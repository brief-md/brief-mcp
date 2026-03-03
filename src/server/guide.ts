// src/server/guide.ts — stub for TASK-25
// Replace with real implementation during build loop.

export interface GuideResource {
  uri: string;
  name: string;
  mimeType: string;
  description: string;
}

export function buildGuideContent(): string {
  throw new Error("Not implemented: buildGuideContent");
}

export function registerGuideResource(_server: unknown): void {
  throw new Error("Not implemented: registerGuideResource");
}

export const GUIDE_RESOURCE: GuideResource = {
  uri: "brief://guide",
  name: "BRIEF.md Interaction Guide", // check-rules-ignore
  mimeType: "text/markdown",
  description:
    "AI interaction guide for the brief-mcp server. Contains tool usage patterns and decision/question capture rules.",
};

// ---------------------------------------------------------------------------
// Stub functions expected by tests (TASK-25)
// ---------------------------------------------------------------------------

const GUIDE_CONTENT = `# BRIEF.md Interaction Guide

## 1. Session Start
When a session_start occurs, the AI should read the BRIEF.md file to understand the project context.

## 2. Re-entry
On re-entrance (re-entry) to a session, the AI should refresh its understanding of any changes.

## 3. Decision Recognition
Decisions should be detected using signal patterns. The AI should recognise and elicit decisions
from conversations and record them in the BRIEF.md file.

## 4. Question Surfacing
Open questions should be captured and categorised. Surfacing placeholder questions helps
track unknowns and ensure they are resolved.

## 5. Conflict Resolution
When conflicts arise between decisions, the AI should help resolve them.

## 6. Extension Points
Extensions to the project ontology or workflow should be captured.

## 7. Ontology Management
The ontology defines the shared vocabulary for the project.

## 8. External References
External sources and references should be tracked and linked.

## Tool Usage Recommendations

The following brief_ prefixed tools are available. Here is when to use each:

- brief_read: Use when reading project context. Recommended usage for session start.
- brief_write: Use when recording decisions or questions. Recommended usage for captures.
- brief_search: Use when looking up ontology terms.

### Multi-MCP Guidance

When working with multiple MCP servers (multi-MCP environments), the brief_ prefix scope
ensures that other server tools do not conflict with BRIEF tools.

## Signal Block Format

Signals are formatted as fenced code blocks:

\`\`\`signal
type: insufficient_data
scenario: no_ontology_matches
suggestion: Try broadening your knowledge search terms.
\`\`\`
`;

/**
 * Returns the guide resource content.
 */
export async function getGuideResource(): Promise<{ content: string }> {
  return { content: GUIDE_CONTENT };
}

/**
 * Lists all registered MCP resources. Only brief://guide is registered.
 */
export async function listResources(): Promise<
  Array<{ uri: string; name: string; mimeType: string; description: string }>
> {
  return [
    {
      uri: GUIDE_RESOURCE.uri,
      name: GUIDE_RESOURCE.name,
      mimeType: GUIDE_RESOURCE.mimeType,
      description: GUIDE_RESOURCE.description,
    },
  ];
}

/**
 * Lists all registered MCP prompts. No prompts are registered.
 */
export async function listPrompts(): Promise<unknown[]> {
  return [];
}
