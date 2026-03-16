// src/parser/decisions.ts — TASK-11 implementation

import type {
  Decision,
  DecisionFormat,
  ExternalToolSession,
  IntentionalTension,
  Question,
} from "../types/decisions.js";
import type { Section } from "../types/parser.js";

// ─── Return type for parseDecisions ─────────────────────────────────────────

export type ParseDecisionsResult = Decision[] & {
  intentionalTensions: IntentionalTension[];
  externalToolSessions: ExternalToolSession[];
};

// ─── Field extraction helpers ────────────────────────────────────────────────

const FIELD_MARKERS: readonly string[] = [
  "WHAT:",
  "WHY:",
  "WHEN:",
  "ALTERNATIVES CONSIDERED:",
  "REPLACES:",
  "EXCEPTION TO:",
  "SUPERSEDED BY:",
  "RESOLVED FROM:",
  "AMENDS:",
];

function isFullFormat(body: string): boolean {
  const normalized = body.replace(/\*\*/g, "");
  return FIELD_MARKERS.some((m) => normalized.includes(m));
}

function extractField(body: string, marker: string): string | undefined {
  // Strip bold markers so **REPLACES:** matches REPLACES:
  const normalized = body.replace(/\*\*/g, "");
  const idx = normalized.indexOf(marker);
  if (idx === -1) return undefined;
  const start = idx + marker.length;
  let end = normalized.length;
  for (const m of FIELD_MARKERS) {
    if (m === marker) continue;
    const mIdx = normalized.indexOf(m, start);
    if (mIdx !== -1 && mIdx < end) end = mIdx;
  }
  // Strip HTML comments (e.g. <!-- CONFLICT: ... -->) from the extracted value
  const value = normalized
    .slice(start, end)
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  return value.length > 0 ? value : undefined;
}

function stripStrikethrough(text: string): string {
  return text.replace(/~~([^~]+?)~~/g, "$1").trim();
}

function hasStrikethrough(text: string): boolean {
  return /~~[^~]+?~~/.test(text);
}

function hasSupersededLabel(text: string): boolean {
  return /\(superseded\)/i.test(text);
}

// ─── Sequence counter for Decision IDs ──────────────────────────────────────

let _seq = 0;

function nextId(): string {
  _seq += 1;
  return `d-${_seq}`;
}

// ─── Rationale extraction helper ─────────────────────────────────────────────

/** Extract text that appears before the first field marker in a decision body */
function extractRationale(body: string): string | undefined {
  let firstMarkerPos = body.length;
  for (const m of FIELD_MARKERS) {
    const idx = body.indexOf(m);
    if (idx !== -1 && idx < firstMarkerPos) firstMarkerPos = idx;
  }
  const pre = body.slice(0, firstMarkerPos).trim();
  return pre.length > 0 ? pre : undefined;
}

// ─── Decision block parser (H3 → Decision) ───────────────────────────────────

function parseDecisionBlock(content: string, decisions: Decision[]): void {
  const lines = content.split("\n");
  let currentHeading: string | null = null;
  let currentBodyLines: string[] = [];

  function flush(): void {
    if (currentHeading === null) return;
    const heading = currentHeading;
    const body = currentBodyLines.join("\n");
    currentHeading = null;
    currentBodyLines = [];

    // Supersession detection — three independent indicators (PARSE-08)
    const hasStrike = hasStrikethrough(heading);
    const hasLabel = hasSupersededLabel(heading);
    const supersededByField = extractField(body, "SUPERSEDED BY:");
    const exceptionToField = extractField(body, "EXCEPTION TO:");
    const amendsField = extractField(body, "AMENDS:");

    const isSuperseded =
      hasStrike || hasLabel || supersededByField !== undefined;
    // Superseded takes precedence over exception
    const status: Decision["status"] = isSuperseded
      ? "superseded"
      : exceptionToField !== undefined
        ? "exception"
        : "active";

    // Clean heading text
    let text = stripStrikethrough(heading);
    text = text.replace(/\(superseded\)/gi, "").trim();

    const format: DecisionFormat = isFullFormat(body) ? "full" : "minimal";

    if (format === "minimal") {
      const paragraphs = body.split(/\n\n+/);
      const rationale = paragraphs.find((p) => p.trim().length > 0)?.trim();
      decisions.push({
        id: nextId(),
        text,
        status,
        format,
        ...(rationale !== undefined ? { rationale } : {}),
        ...(amendsField !== undefined ? { amends: amendsField } : {}),
      });
    } else {
      // Full format: extract all structured fields (PARSE-11)
      const what = extractField(body, "WHAT:");
      const why = extractField(body, "WHY:");
      const when = extractField(body, "WHEN:");
      const altRaw = extractField(body, "ALTERNATIVES CONSIDERED:");
      const replaces = extractField(body, "REPLACES:");
      const resolvedFrom = extractField(body, "RESOLVED FROM:");

      const alternativesConsidered =
        altRaw !== undefined
          ? altRaw
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0)
          : undefined;

      // Always include rationale key for shape consistency with minimal (may be undefined)
      const rationale = extractRationale(body);

      decisions.push({
        id: nextId(),
        text,
        status,
        format,
        rationale, // explicitly present (possibly undefined) for shape parity with minimal
        ...(what !== undefined ? { what } : {}),
        ...(why !== undefined ? { why } : {}),
        ...(when !== undefined ? { when } : {}),
        ...(alternativesConsidered !== undefined &&
        alternativesConsidered.length > 0
          ? { alternativesConsidered }
          : {}),
        ...(replaces !== undefined ? { replaces } : {}),
        ...(amendsField !== undefined ? { amends: amendsField } : {}),
        ...(exceptionToField !== undefined
          ? { exceptionTo: exceptionToField }
          : {}),
        ...(supersededByField !== undefined
          ? { supersededBy: supersededByField }
          : {}),
        ...(resolvedFrom !== undefined ? { resolvedFrom } : {}),
      });
    }
  }

  for (const line of lines) {
    const h3Match = line.match(/^### (.+)$/);
    if (h3Match) {
      flush();
      currentHeading = h3Match[1].trim();
    } else if (currentHeading !== null) {
      currentBodyLines.push(line);
    }
  }
  flush();
}

// ─── Intentional Tensions parser ─────────────────────────────────────────────

function parseTensionItem(line: string): IntentionalTension | undefined {
  const m = line.match(/^-\s+(.+)/);
  if (!m) return undefined;
  const text = m[1].trim();
  const parts = text.split(/\s+vs\.?\s+/i);
  return {
    between: parts.length > 1 ? parts.map((s) => s.trim()) : [text],
    description: text,
  };
}

// ─── External Tool Sessions parser ───────────────────────────────────────────

function parseSessionItem(line: string): ExternalToolSession | undefined {
  const m = line.match(/^-\s+(.+)/);
  if (!m) return undefined;
  const text = m[1].trim();
  // Try to extract: "YYYY-MM-DD Tool: ..."
  const dateToolMatch = text.match(
    /^(\d{4}-\d{2}-\d{2})\s+([^:]+?)(?::\s*(.*))?$/,
  );
  if (dateToolMatch) {
    return {
      capturedAt: dateToolMatch[1],
      tool: dateToolMatch[2].trim(),
      summary: dateToolMatch[3]?.trim() ?? text,
    };
  }
  return { capturedAt: "", tool: "external", summary: text };
}

// ─── Public API — Decision parsing ──────────────────────────────────────────

/**
 * Parse decisions from a "# Key Decisions" section body.
 * Returns an array of Decision objects extended with intentionalTensions and
 * externalToolSessions parsed from named ## sub-sections (PARSE-11).
 */
export function parseDecisions(content: string): ParseDecisionsResult {
  const decisions: Decision[] = [];
  const intentionalTensions: IntentionalTension[] = [];
  const externalToolSessions: ExternalToolSession[] = [];

  // Split on lines that start an H2 sub-section
  const parts = content.split(/\n(?=## )/);

  for (const part of parts) {
    const h2Match = part.match(/^## (.+?)(?:\n|$)/);
    if (h2Match) {
      const heading = h2Match[1].trim().toLowerCase();
      const subBody = part.slice(h2Match[0].length);

      if (heading === "intentional tensions") {
        for (const line of subBody.split("\n")) {
          const tension = parseTensionItem(line);
          if (tension) intentionalTensions.push(tension);
        }
      } else if (heading === "external tool sessions") {
        for (const line of subBody.split("\n")) {
          const session = parseSessionItem(line);
          if (session) externalToolSessions.push(session);
        }
      } else {
        // Any other H2 block (including "## Key Decisions") — scan for H3 decisions
        parseDecisionBlock(subBody, decisions);
      }
    } else {
      // No H2 heading — plain content block, scan for H3 decisions
      parseDecisionBlock(part, decisions);
    }
  }

  return Object.assign(decisions, {
    intentionalTensions,
    externalToolSessions,
  }) as ParseDecisionsResult;
}

/**
 * Annotates supersession status on decisions based on cross-references (PARSE-08).
 * If decision A has `replaces` pointing to decision B by text, marks B as superseded.
 */
export function detectSupersessionStatus(decisions: Decision[]): void {
  const byText = new Map<string, number>();
  for (let i = 0; i < decisions.length; i++) {
    byText.set(decisions[i].text.toLowerCase().trim(), i);
  }

  for (const d of decisions) {
    if (d.replaces !== undefined) {
      const idx = byText.get(d.replaces.toLowerCase().trim());
      if (idx !== undefined) {
        (decisions[idx] as { status: string }).status = "superseded";
      }
    }
  }
}

// ─── Public API — Question parsing ──────────────────────────────────────────

/**
 * Parse a single "To Resolve" checkbox item (PARSE-16).
 * Extracts text, checked state, and optional Options / Impact sub-fields.
 */
export function parseToResolveItem(item: string): {
  text: string;
  checked: boolean;
  options?: string[];
  impact?: string;
} {
  const checkboxMatch = item.match(/^-\s+\[([x ])\]\s+([\s\S]*)$/i);
  if (!checkboxMatch) {
    return { text: item.trim(), checked: false };
  }

  const checked = checkboxMatch[1].toLowerCase() === "x";
  let rest = checkboxMatch[2] ?? "";

  // Extract **Options:** sub-field — slash-delimited array (PARSE-16)
  let options: string[] | undefined;
  const optMatch = rest.match(/\*\*Options:\*\*\s+([^\n*]+)/i);
  if (optMatch) {
    const parsed = optMatch[1]
      .split("/")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (parsed.length > 0) options = parsed;
    rest = rest.replace(optMatch[0], "");
  }

  // Extract **Impact:** sub-field — single prose string (PARSE-16)
  let impact: string | undefined;
  const impMatch = rest.match(/\*\*Impact:\*\*\s+([^\n*]+)/i);
  if (impMatch) {
    const val = impMatch[1].trim();
    if (val.length > 0) impact = val;
    rest = rest.replace(impMatch[0], "");
  }

  const text = rest.trim();
  const result: {
    text: string;
    checked: boolean;
    options?: string[];
    impact?: string;
  } = {
    text,
    checked,
  };
  if (options !== undefined) result.options = options;
  if (impact !== undefined) result.impact = impact;
  return result;
}

/** Split a section body into individual checkbox list items, grouping continuation lines */
function splitCheckboxItems(body: string): string[] {
  const items: string[] = [];
  const lines = body.split("\n");
  let current: string[] | null = null;

  for (const line of lines) {
    if (/^-\s+\[[ x]\]/i.test(line)) {
      if (current !== null) items.push(current.join("\n"));
      current = [line];
    } else if (current !== null) {
      current.push(line);
    }
  }
  if (current !== null) items.push(current.join("\n"));
  return items;
}

/**
 * Parse questions from a "# Open Questions" section body.
 * Splits by ## To Resolve, ## To Keep Open, ## Resolved sub-headings (PARSE-12).
 */
export function parseQuestions(content: string): {
  toResolve: Question[];
  toKeepOpen: Question[];
  resolved: Question[];
} {
  const toResolve: Question[] = [];
  const toKeepOpen: Question[] = [];
  const resolved: Question[] = [];

  const parts = content.split(/\n(?=## )/);

  for (const part of parts) {
    const headingMatch = part.match(/^## (.+?)(?:\n|$)/);
    if (!headingMatch) continue;

    const heading = headingMatch[1].trim().toLowerCase();
    const body = part.slice(headingMatch[0].length);

    if (heading === "to resolve") {
      for (const item of splitCheckboxItems(body)) {
        const parsed = parseToResolveItem(item.trim());
        const q: Question = {
          text: parsed.text,
          checked: parsed.checked,
          category: "to-resolve",
          ...(parsed.options !== undefined ? { options: parsed.options } : {}),
          ...(parsed.impact !== undefined ? { impact: parsed.impact } : {}),
        };
        toResolve.push(q);
      }
    } else if (heading === "to keep open") {
      // Plain list items — no checkbox state (PARSE-12)
      for (const line of body.split("\n")) {
        const listMatch = line.match(/^-\s+(.+)/);
        if (listMatch) {
          // checked is intentionally absent for keep-open items
          toKeepOpen.push({
            text: listMatch[1].trim(),
            category: "to-keep-open",
          } as unknown as Question);
        }
      }
    } else if (heading === "resolved") {
      for (const item of splitCheckboxItems(body)) {
        const parsed = parseToResolveItem(item.trim());
        resolved.push({
          text: parsed.text,
          checked: parsed.checked,
          category: "resolved",
          ...(parsed.options !== undefined ? { options: parsed.options } : {}),
          ...(parsed.impact !== undefined ? { impact: parsed.impact } : {}),
        });
      }
    }
  }

  return { toResolve, toKeepOpen, resolved };
}

// ─── Original stub implementations (delegating to new API) ──────────────────

export function extractDecisions(decisionsSection: Section): Decision[] {
  return parseDecisions(decisionsSection.body);
}

export function extractQuestions(questionsSection: Section): Question[] {
  const { toResolve, toKeepOpen, resolved } = parseQuestions(
    questionsSection.body,
  );
  return [...toResolve, ...toKeepOpen, ...resolved];
}

export function detectSupersededStatus(heading: string, body: string): boolean {
  return (
    hasStrikethrough(heading) ||
    hasSupersededLabel(heading) ||
    body.includes("SUPERSEDED BY:")
  );
}

export function parseDecisionFormat(body: string): DecisionFormat {
  return isFullFormat(body) ? "full" : "minimal";
}
