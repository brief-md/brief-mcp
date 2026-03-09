// src/validation/semantic-conflicts.ts — AI-powered semantic conflict detection
// Optional layer that uses MCP sampling to detect conflicts the heuristic misses.
// Gracefully degrades when sampling is unavailable.

import {
  type CheckConflictsParams,
  type CheckConflictsResult,
  type ConflictDecisionInput,
  checkConflicts,
  type DetectedConflict,
  type IntentionalTensionPair,
} from "./conflicts.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Dependency-injected sampling function — avoids coupling to Server instance.
 * Matches the signature of `server.createMessage()` for basic (non-tool) sampling.
 * Uses loose types so the SDK's concrete types are assignable without casting.
 */
export type SamplingFn = (params: {
  messages: Array<{
    role: "user" | "assistant";
    content: { type: "text"; text: string };
  }>;
  maxTokens: number;
  systemPrompt?: string;
}) => Promise<{ content: unknown; model: string; role: string }>;

export interface SemanticAnalysisResult {
  readonly status: "completed" | "unavailable" | "error" | "skipped";
  readonly conflicts: DetectedConflict[];
  readonly pairsAnalyzed: number;
  readonly durationMs: number;
  readonly errorMessage?: string;
}

export interface CheckConflictsWithSemanticResult extends CheckConflictsResult {
  readonly semanticAnalysis?: SemanticAnalysisResult;
}

export interface SemanticDomainContext {
  readonly tensionProse?: string;
}

/** Parsed AI response for a single pair */
interface SemanticPairResult {
  pairIndex: number;
  isConflict: boolean;
  confidence: number;
  reasoning: string;
}

/** Shape of the full AI JSON response */
interface SemanticResponsePayload {
  results: SemanticPairResult[];
}

/** Internal representation of a pair to evaluate */
interface EvalPair {
  a: string;
  b: string;
  pairType: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a conflict detection engine analyzing project decisions and constraints for semantic contradictions. For each numbered pair, determine if they conflict — meaning achieving both simultaneously is impractical, contradictory, or creates tension that should be surfaced.

Return ONLY valid JSON: { "results": [{ "pairIndex": <number>, "isConflict": true, "confidence": <0-1>, "reasoning": "<1 sentence>" }] }

Only include pairs where isConflict is true.`;

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_PAIRS_PER_BATCH = 50;
const MIN_CONFIDENCE = 0.6;

const RESOLUTION_OPTIONS: string[] = [
  "supersede",
  "exception",
  "update",
  "dismiss",
];

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

export function buildSemanticPrompt(
  pairs: EvalPair[],
  tensionProse?: string,
): string {
  const lines: string[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i];
    lines.push(`${i + 1}. A: "${p.a}" | B: "${p.b}" [${p.pairType}]`);
  }

  let message = lines.join("\n");

  if (tensionProse) {
    message += `\n\n---\nDOMAIN CONTEXT (from type guide):\nThese are known tensions in this project domain:\n${tensionProse}\n\nUse this domain knowledge to inform your analysis. Pairs that match known domain tensions should have higher confidence.`;
  }

  return message;
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

export function parseSemanticResponse(result: {
  content: unknown;
}): SemanticPairResult[] | null {
  // Extract text from content (may be object or array — SDK shape varies)
  let raw: string | undefined;
  const content = result.content;
  if (Array.isArray(content)) {
    const textBlock = content.find(
      (c: Record<string, unknown>) =>
        c.type === "text" && typeof c.text === "string",
    );
    raw = textBlock?.text as string | undefined;
  } else if (
    content &&
    typeof content === "object" &&
    "type" in content &&
    (content as Record<string, unknown>).type === "text"
  ) {
    raw = (content as Record<string, unknown>).text as string | undefined;
  }

  if (!raw) return null;

  // Strip markdown code fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "");
  }

  try {
    const parsed: unknown = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== "object") return null;

    const payload = parsed as SemanticResponsePayload;
    if (!Array.isArray(payload.results)) return null;

    // Validate each result
    const valid: SemanticPairResult[] = [];
    for (const r of payload.results) {
      if (
        typeof r.pairIndex === "number" &&
        typeof r.isConflict === "boolean" &&
        typeof r.confidence === "number" &&
        typeof r.reasoning === "string" &&
        r.confidence >= 0 &&
        r.confidence <= 1
      ) {
        valid.push(r);
      }
    }
    return valid.length > 0 ? valid : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pair generation (mirrors heuristic filtering)
// ---------------------------------------------------------------------------

function generatePairs(
  decisions: ConflictDecisionInput[],
  constraints: string[],
  intentionalTensions: IntentionalTensionPair[],
): EvalPair[] {
  const pairs: EvalPair[] = [];

  // Filter same as heuristic: active, no exceptionTo
  const active = decisions.filter(
    (d) => d.status === "active" && !d.exceptionTo,
  );

  // Decision vs decision
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      if (!isSuppressed(active[i].text, active[j].text, intentionalTensions)) {
        pairs.push({
          a: active[i].text,
          b: active[j].text,
          pairType: "decision-decision",
        });
      }
    }
  }

  // Decision vs constraint
  for (const d of active) {
    for (const c of constraints) {
      if (!isSuppressed(d.text, c, intentionalTensions)) {
        pairs.push({ a: d.text, b: c, pairType: "decision-constraint" });
      }
    }
  }

  // Constraint vs constraint
  for (let i = 0; i < constraints.length; i++) {
    for (let j = i + 1; j < constraints.length; j++) {
      if (!isSuppressed(constraints[i], constraints[j], intentionalTensions)) {
        pairs.push({
          a: constraints[i],
          b: constraints[j],
          pairType: "constraint-constraint",
        });
      }
    }
  }

  return pairs;
}

function isSuppressed(
  textA: string,
  textB: string,
  tensions: IntentionalTensionPair[],
): boolean {
  const aLower = textA.toLowerCase().trim();
  const bLower = textB.toLowerCase().trim();
  for (const t of tensions) {
    const tA = t.itemA.toLowerCase().trim();
    const tB = t.itemB.toLowerCase().trim();
    if (
      (matches(aLower, tA) && matches(bLower, tB)) ||
      (matches(aLower, tB) && matches(bLower, tA))
    ) {
      return true;
    }
  }
  return false;
}

function matches(text: string, item: string): boolean {
  return text === item || text.includes(item) || item.includes(text);
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

function isDuplicateOfHeuristic(
  aiConflict: DetectedConflict,
  heuristicConflicts: DetectedConflict[],
): boolean {
  const aiTexts = new Set(
    aiConflict.items.map((i) => i.text.toLowerCase().trim()),
  );
  return heuristicConflicts.some((h) => {
    const hTexts = new Set(h.items.map((i) => i.text.toLowerCase().trim()));
    if (aiTexts.size !== hTexts.size) return false;
    for (const t of aiTexts) {
      if (!hTexts.has(t)) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Core: run semantic analysis
// ---------------------------------------------------------------------------

export async function runSemanticAnalysis(
  decisions: ConflictDecisionInput[],
  constraints: string[],
  intentionalTensions: IntentionalTensionPair[],
  samplingFn: SamplingFn,
  options?: {
    timeoutMs?: number;
    maxPairsPerBatch?: number;
    tensionProse?: string;
  },
): Promise<SemanticAnalysisResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxPerBatch = options?.maxPairsPerBatch ?? MAX_PAIRS_PER_BATCH;
  const start = Date.now();

  const allPairs = generatePairs(decisions, constraints, intentionalTensions);
  if (allPairs.length === 0) {
    return {
      status: "skipped",
      conflicts: [],
      pairsAnalyzed: 0,
      durationMs: Date.now() - start,
    };
  }

  // Chunk into batches
  const batches: EvalPair[][] = [];
  for (let i = 0; i < allPairs.length; i += maxPerBatch) {
    batches.push(allPairs.slice(i, i + maxPerBatch));
  }

  const allResults: SemanticPairResult[] = [];
  const pairOffsets: number[] = []; // track pair index offsets per batch

  try {
    let offset = 0;
    for (const batch of batches) {
      const prompt = buildSemanticPrompt(batch, options?.tensionProse);

      const resultPromise = samplingFn({
        messages: [{ role: "user", content: { type: "text", text: prompt } }],
        maxTokens: 2000,
        systemPrompt: SYSTEM_PROMPT,
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`Sampling timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      });

      const result = await Promise.race([resultPromise, timeoutPromise]);
      const parsed = parseSemanticResponse(result);
      if (parsed) {
        // Adjust pairIndex by batch offset
        for (const r of parsed) {
          allResults.push({ ...r, pairIndex: r.pairIndex - 1 + offset });
        }
      }
      pairOffsets.push(offset);
      offset += batch.length;
    }
  } catch (err) {
    return {
      status: "error",
      conflicts: [],
      pairsAnalyzed: allPairs.length,
      durationMs: Date.now() - start,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }

  // Convert high-confidence results to DetectedConflict
  const aiConflicts: DetectedConflict[] = [];
  for (const r of allResults) {
    if (!r.isConflict || r.confidence < MIN_CONFIDENCE) continue;
    if (r.pairIndex < 0 || r.pairIndex >= allPairs.length) continue;

    const pair = allPairs[r.pairIndex];
    aiConflicts.push({
      type: pair.pairType,
      source: "semantic-ai",
      severity: "warning",
      items: [
        { text: pair.a, status: "active" },
        {
          text: pair.b,
          status: pair.pairType.includes("constraint")
            ? "constraint"
            : "active",
        },
      ],
      resolutionOptions: [...RESOLUTION_OPTIONS],
    });
  }

  return {
    status: "completed",
    conflicts: aiConflicts,
    pairsAnalyzed: allPairs.length,
    durationMs: Date.now() - start,
  };
}

// ---------------------------------------------------------------------------
// Main export: composed conflict check
// ---------------------------------------------------------------------------

export async function checkConflictsWithSemantic(
  params: CheckConflictsParams & { semantic?: boolean },
  samplingFn?: SamplingFn,
  isSamplingAvailable?: () => boolean,
  domainContext?: SemanticDomainContext,
): Promise<CheckConflictsWithSemanticResult> {
  // 1. Always run heuristic layer first
  const heuristicResult = checkConflicts(params);

  // 2. If semantic not requested, return heuristic only
  if (!params.semantic) {
    return heuristicResult;
  }

  // 3. If sampling unavailable, signal it
  if (!samplingFn || (isSamplingAvailable && !isSamplingAvailable())) {
    return {
      ...heuristicResult,
      semanticAnalysis: {
        status: "unavailable",
        conflicts: [],
        pairsAnalyzed: 0,
        durationMs: 0,
      },
    };
  }

  // 4. Run semantic analysis
  try {
    const semanticResult = await runSemanticAnalysis(
      params.decisions,
      params.constraints,
      params.intentionalTensions ?? [],
      samplingFn,
      { tensionProse: domainContext?.tensionProse },
    );

    // Deduplicate: remove AI conflicts already found by heuristic
    const uniqueAiConflicts = semanticResult.conflicts.filter(
      (c) => !isDuplicateOfHeuristic(c, heuristicResult.conflicts),
    );

    return {
      ...heuristicResult,
      semanticAnalysis: {
        ...semanticResult,
        conflicts: uniqueAiConflicts,
      },
    };
  } catch (err) {
    return {
      ...heuristicResult,
      semanticAnalysis: {
        status: "error",
        conflicts: [],
        pairsAnalyzed: 0,
        durationMs: 0,
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
