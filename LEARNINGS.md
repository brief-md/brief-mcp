# LEARNINGS.md — Operational Knowledge

This file captures operational knowledge the agent discovers during the build.
The agent reads this at the start of every iteration and writes new entries
when it discovers something useful for future iterations.

## Rules
- Maximum 20 entries. If full, replace the least useful entry.
- One line per entry. Format: `[TASK-XX] <what you learned>`
- Only record genuinely useful operational knowledge — not task progress.
- Good learnings: tool quirks, type system gotchas, config discoveries.
- Bad learnings: "TASK-05 is done" (that is what TASK_INDEX.md is for).

## Entries

[TASK-03] Windows CRLF line endings cause Biome format errors on commit — run `npx biome check --write src/<module>/` before staging to fix
[TASK-03] WeakMap is the right pattern for associating internal config with Logger instances without leaking internals
[TASK-03] scaffold test "no source file exceeds 500 lines" was already failing from TASK-02 (src/types/tools.ts at 892 lines) — not a TASK-03 regression
