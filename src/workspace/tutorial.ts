// src/workspace/tutorial.ts — TASK-23: Tutorial content & state management

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface TutorialTopic {
  topic: string;
  triggerPoint: string;
  narration: string;
}

export interface TutorialContent {
  topics: TutorialTopic[];
  completionMessage: string;
}

// ---------------------------------------------------------------------------
// TUT-03: Tutorial topics and narrations
// ---------------------------------------------------------------------------

const TUTORIAL_TOPICS: TutorialTopic[] = [
  {
    topic: "Decisions",
    triggerPoint: "When the user first commits to something",
    narration:
      "I just noticed you made a decision \u2014 I'll record that in your BRIEF.md. Decisions are permanent choices that shape the project going forward.",
  },
  {
    topic: "Open Questions",
    triggerPoint: "When the user first says 'not sure'",
    narration:
      "No problem \u2014 I can note that as an open question. These are things you haven't decided yet but don't want to forget. You'll see them at re-entry.",
  },
  {
    topic: "Deferral",
    triggerPoint: "After the first open question is created",
    narration:
      "Any question I ask, you can always say 'not sure yet' and I'll save it for later. You don't have to have everything figured out to start.",
  },
  {
    topic: "To Keep Open",
    triggerPoint: "After 3-4 decisions have been made",
    narration:
      "Some things in creative work are intentionally unresolved \u2014 they're tensions you want to keep, not problems to solve.",
  },
  {
    topic: "Re-entry",
    triggerPoint: "At the end of project setup",
    narration:
      "When you come back to this project later, I'll give you a summary of where you left off \u2014 decisions made, questions still open, anything that needs attention.",
  },
];

const COMPLETION_MESSAGE =
  "That's the basics. You can always ask me 'how does this work?' or run a tutorial any time with 'start tutorial'.";

// ---------------------------------------------------------------------------
// Module-level dismissed state (shared with reentry.ts)
// ---------------------------------------------------------------------------

let _tutorialDismissed = false;

// ---------------------------------------------------------------------------
// getTutorialContent (TUT-03)
// ---------------------------------------------------------------------------

export function getTutorialContent(): TutorialContent {
  return {
    topics: TUTORIAL_TOPICS.map((t) => ({ ...t })),
    completionMessage: COMPLETION_MESSAGE,
  };
}

// ---------------------------------------------------------------------------
// isTutorialDismissed (TUT-06)
// ---------------------------------------------------------------------------

export async function isTutorialDismissed(): Promise<boolean> {
  return _tutorialDismissed;
}

// ---------------------------------------------------------------------------
// setDismissedFlag — internal setter used by reentry.ts setTutorialDismissed
// ---------------------------------------------------------------------------

export function setDismissedFlag(dismissed: boolean): void {
  _tutorialDismissed = dismissed;
}
