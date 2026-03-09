// src/workspace/maturity.ts — WP6: Decision maturity signals (OQ-2/OQ-5 Phase 4-5)

import { readBrief } from "../io/project-state.js"; // check-rules-ignore

// ── Types ───────────────────────────────────────────────────────────────────

export type MaturityLevel =
  | "nascent"
  | "developing"
  | "maturing"
  | "established";

export interface UpgradeableDecision {
  title: string;
  missingFields: string[];
}

export interface MaturitySignals {
  maturityLevel: MaturityLevel;
  decisionCount: number;
  minimalFormatCount: number;
  fullFormatCount: number;
  upgradeableDecisions: UpgradeableDecision[];
  openQuestionCount: number;
  signals: string[];
  nextSteps: string[];
}

// ── Field detection ─────────────────────────────────────────────────────────

const FULL_FORMAT_FIELDS = [
  { key: "what", pattern: /^WHAT:/m },
  { key: "why", pattern: /^WHY:/m },
  { key: "when", pattern: /^WHEN:/m },
  { key: "alternativesConsidered", pattern: /^ALTERNATIVES CONSIDERED:/m },
] as const;

/** A decision is "full format" if it has at least WHAT and WHY fields. */
function isFullFormat(body: string): boolean {
  return (
    FULL_FORMAT_FIELDS[0].pattern.test(body) &&
    FULL_FORMAT_FIELDS[1].pattern.test(body)
  );
}

function getMissingFields(body: string): string[] {
  return FULL_FORMAT_FIELDS.filter((f) => !f.pattern.test(body)).map(
    (f) => f.key,
  );
}

// ── Section extraction helpers ──────────────────────────────────────────────

/**
 * Extract the text between a given `## Heading` and the next `## ` heading
 * (or end-of-file).
 */
function extractSection(content: string, heading: string): string {
  const pattern = new RegExp(`^## ${heading}\\s*$`, "m");
  const match = pattern.exec(content);
  if (!match) return "";

  const start = match.index + match[0].length;
  const nextH2 = content.indexOf("\n## ", start);
  return nextH2 === -1 ? content.slice(start) : content.slice(start, nextH2);
}

/**
 * Split a section body into individual `### ` sub-headings, returning
 * `{ title, body }` pairs. Superseded decisions (strikethrough title or
 * "(superseded)" marker) are excluded.
 */
function parseDecisions(
  sectionBody: string,
): Array<{ title: string; body: string }> {
  const decisions: Array<{ title: string; body: string }> = [];
  const headingRe = /^### (.+)$/gm;
  const matches: Array<{ title: string; index: number; end: number }> = [];

  let m = headingRe.exec(sectionBody);
  while (m !== null) {
    matches.push({
      title: m[1].trim(),
      index: m.index,
      end: m.index + m[0].length,
    });
    m = headingRe.exec(sectionBody);
  }

  for (let i = 0; i < matches.length; i++) {
    const bodyStart = matches[i].end;
    const bodyEnd =
      i + 1 < matches.length ? matches[i + 1].index : sectionBody.length;
    const title = matches[i].title;

    // Skip superseded decisions
    if (/~~.*~~/.test(title) || /\(superseded\)/i.test(title)) {
      continue;
    }

    decisions.push({ title, body: sectionBody.slice(bodyStart, bodyEnd) });
  }

  return decisions;
}

/** Count bullet items (`- `) in a section body. */
function countBullets(sectionBody: string): number {
  const bullets = sectionBody.match(/^- .+/gm);
  return bullets ? bullets.length : 0;
}

// ── Maturity classification ─────────────────────────────────────────────────

function classifyMaturity(decisionCount: number): MaturityLevel {
  if (decisionCount <= 2) return "nascent";
  if (decisionCount <= 5) return "developing";
  if (decisionCount <= 10) return "maturing";
  return "established";
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function getMaturitySignals(params: {
  projectPath: string;
}): Promise<MaturitySignals> {
  const content = await readBrief(params.projectPath);

  // Parse decisions
  const decisionSection = extractSection(content, "Key Decisions");
  const decisions = parseDecisions(decisionSection);
  const decisionCount = decisions.length;

  let minimalFormatCount = 0;
  let fullFormatCount = 0;
  const upgradeableDecisions: UpgradeableDecision[] = [];

  for (const d of decisions) {
    if (isFullFormat(d.body)) {
      fullFormatCount++;
    } else {
      minimalFormatCount++;
    }
  }

  const maturityLevel = classifyMaturity(decisionCount);

  // For developing+, identify upgradeable minimal-format decisions
  if (maturityLevel !== "nascent") {
    for (const d of decisions) {
      if (!isFullFormat(d.body)) {
        upgradeableDecisions.push({
          title: d.title,
          missingFields: getMissingFields(d.body),
        });
      }
    }
  }

  // Count open questions
  const oqSection = extractSection(content, "Open Questions");
  const openQuestionCount = countBullets(oqSection);

  // Build signals
  const signals: string[] = [];
  if (minimalFormatCount > 0 && maturityLevel !== "nascent") {
    signals.push(
      `${minimalFormatCount} decision(s) use minimal format and could be upgraded to include WHAT/WHY/WHEN fields`,
    );
  }
  if (openQuestionCount > 0) {
    signals.push(`${openQuestionCount} open question(s) remain unresolved`);
  }
  if (maturityLevel === "maturing" || maturityLevel === "established") {
    signals.push(
      "Project is mature enough to use full decision format by default",
    );
  }

  // Build nextSteps
  const nextSteps: string[] = [];
  for (const ud of upgradeableDecisions) {
    nextSteps.push(
      `Consider upgrading '${ud.title}' with missing fields: ${ud.missingFields.join(", ")}`,
    );
  }
  if (maturityLevel === "maturing" || maturityLevel === "established") {
    nextSteps.push(
      "New decisions should include WHAT, WHY, WHEN, and ALTERNATIVES CONSIDERED fields",
    );
  }

  return {
    maturityLevel,
    decisionCount,
    minimalFormatCount,
    fullFormatCount,
    upgradeableDecisions,
    openQuestionCount,
    signals,
    nextSteps,
  };
}
