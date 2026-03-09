// src/ontology/discovery.ts — WP5: Ontology discovery (OQ-6)
// Searches local installed packs and external sources (Hugging Face) for relevant ontologies.

import defaultLogger from "../observability/logger.js";
import { listOntologies } from "./management.js";
import { searchOntology } from "./search.js";

const logger = defaultLogger;

// ---------------------------------------------------------------------------
// SSRF protection (shared pattern from management.ts)
// ---------------------------------------------------------------------------

function isPrivateHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "::1") return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
  }
  if (hostname.startsWith("fd")) return true;
  return false;
}

// Thin wrapper — reads globalThis.fetch at call time (test-spy compatible)
const httpGet = (u: RequestInfo | URL, i?: RequestInit) =>
  globalThis.fetch(u, i); // check-rules-ignore

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LocalOntologyResult {
  name: string;
  entryCount: number;
  relevanceScore: number;
  description?: string;
}

export interface ExternalOntologyResult {
  source: "huggingface";
  datasetId: string;
  description: string;
  tags: string[];
  downloads: number;
  relevanceScore: number;
}

export interface DiscoverOntologiesResult {
  localResults: LocalOntologyResult[];
  externalResults: ExternalOntologyResult[];
  signal: string;
}

// ---------------------------------------------------------------------------
// Hugging Face search
// ---------------------------------------------------------------------------

const HF_TIMEOUT_MS = 30_000;

async function searchHuggingFace(
  query: string,
  extensionContext: string | undefined,
  maxResults: number,
): Promise<ExternalOntologyResult[]> {
  const encoded = encodeURIComponent(query);
  const url = `https://huggingface.co/api/datasets?search=${encoded}&sort=downloads&direction=-1&limit=${maxResults}`;

  const parsed = new URL(url);
  if (isPrivateHost(parsed.hostname)) {
    logger.warn("SSRF: HuggingFace URL resolved to private IP, skipping");
    return [];
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HF_TIMEOUT_MS);

  try {
    const response = await httpGet(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timer);

    if (!response.ok) {
      logger.warn(`HuggingFace API returned ${response.status}`);
      return [];
    }

    const data = (await response.json()) as Array<{
      id?: string;
      description?: string;
      tags?: string[];
      downloads?: number;
      [key: string]: unknown;
    }>;

    if (!Array.isArray(data)) return [];

    const contextTokens = extensionContext
      ? extensionContext.toLowerCase().split(/\W+/).filter(Boolean)
      : [];

    return data
      .filter((d) => d.id && typeof d.id === "string")
      .map((d) => {
        const tags = Array.isArray(d.tags)
          ? d.tags.filter((t): t is string => typeof t === "string")
          : [];
        const desc = typeof d.description === "string" ? d.description : "";

        // Score relevance by tag overlap with extension context
        let relevanceScore = 0.3; // base score for being a search result
        if (contextTokens.length > 0) {
          const tagText = tags.join(" ").toLowerCase();
          const descText = desc.toLowerCase();
          const combined = `${tagText} ${descText}`;
          const matched = contextTokens.filter((t) =>
            combined.includes(t),
          ).length;
          relevanceScore = Math.min(
            1.0,
            0.3 + (matched / contextTokens.length) * 0.7,
          );
        }

        return {
          source: "huggingface" as const,
          datasetId: d.id as string,
          description: desc.slice(0, 500),
          tags: tags.slice(0, 20),
          downloads: typeof d.downloads === "number" ? d.downloads : 0,
          relevanceScore,
        };
      })
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, maxResults);
  } catch (err: unknown) {
    clearTimeout(timer);
    const isAbort =
      err instanceof Error &&
      (err.name === "AbortError" || err.message.includes("abort"));
    if (isAbort) {
      logger.warn("HuggingFace search timed out");
    } else {
      logger.warn(`HuggingFace search failed: ${(err as Error).message}`);
    }
    return [];
  }
}

// ---------------------------------------------------------------------------
// Local search
// ---------------------------------------------------------------------------

async function searchLocal(
  query: string,
  maxResults: number,
): Promise<LocalOntologyResult[]> {
  // Get all installed packs for metadata
  const { packs } = await listOntologies();
  if (packs.length === 0) return [];

  // Search across all packs
  try {
    const searchResult = await searchOntology({
      query,
      maxResults: maxResults * 3, // over-fetch to aggregate per pack
    });

    // Aggregate results by pack — search results use 'pack' or 'source' field
    const packScores = new Map<string, number>();
    const rawResults = searchResult as {
      results?: Array<Record<string, unknown>>;
    };
    const results = rawResults.results ?? [];
    for (const r of results) {
      const packName =
        typeof r.pack === "string"
          ? r.pack
          : typeof r.source === "string"
            ? r.source
            : "unknown";
      const score = typeof r.score === "number" ? r.score : 0;
      const existing = packScores.get(packName) ?? 0;
      packScores.set(packName, Math.max(existing, score));
    }

    return packs
      .map((p) => ({
        name: p.name,
        entryCount: p.entryCount,
        relevanceScore: packScores.get(p.name) ?? 0,
        description: p.description || undefined,
      }))
      .filter((p) => p.relevanceScore > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, maxResults);
  } catch {
    // Fallback: return all packs with zero relevance
    return packs.slice(0, maxResults).map((p) => ({
      name: p.name,
      entryCount: p.entryCount,
      relevanceScore: 0,
      description: p.description || undefined,
    }));
  }
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function discoverOntologies(params: {
  query: string;
  extensionContext?: string;
  projectType?: string;
  maxResults?: number;
  sources?: Array<"local" | "huggingface">;
}): Promise<DiscoverOntologiesResult> {
  const {
    query,
    extensionContext,
    maxResults = 10,
    sources = ["local", "huggingface"],
  } = params;

  if (!query || query.trim().length === 0) {
    return {
      localResults: [],
      externalResults: [],
      signal: "Empty query. Provide a search term to discover ontologies.",
    };
  }

  const searchLocal_ = sources.includes("local");
  const searchExternal = sources.includes("huggingface");

  // Run searches in parallel
  const [localResults, externalResults] = await Promise.all([
    searchLocal_ ? searchLocal(query, maxResults) : Promise.resolve([]),
    searchExternal
      ? searchHuggingFace(query, extensionContext, maxResults)
      : Promise.resolve([]),
  ]);

  // Build signal
  const totalResults = localResults.length + externalResults.length;
  let signal: string;
  if (totalResults === 0) {
    signal =
      "No ontologies found. Consider creating a custom ontology with brief_create_ontology.";
  } else if (localResults.length > 0 && externalResults.length > 0) {
    signal = `Found ${localResults.length} local and ${externalResults.length} external ontologies. Review results and install relevant packs.`;
  } else if (localResults.length > 0) {
    signal = `Found ${localResults.length} matching local ontologies. Search external sources for additional coverage.`;
  } else {
    signal = `Found ${externalResults.length} external datasets. Use brief_install_ontology to install, or brief_create_ontology for custom packs.`;
  }

  return { localResults, externalResults, signal };
}
