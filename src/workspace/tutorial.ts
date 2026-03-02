// src/workspace/tutorial.ts — stub for TASK-23
// Replace with real implementation during build loop.

export interface TutorialTopic {
  topic: string;
  triggerPoint: string;
  narration: string;
}

export interface TutorialContent {
  topics: TutorialTopic[];
  completionMessage: string;
}

export function getTutorialContent(): TutorialContent {
  throw new Error("Not implemented: getTutorialContent");
}

export async function setTutorialDismissed(_permanent: boolean): Promise<void> {
  throw new Error("Not implemented: setTutorialDismissed");
}

export async function isTutorialDismissed(): Promise<boolean> {
  throw new Error("Not implemented: isTutorialDismissed");
}
