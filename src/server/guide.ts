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
