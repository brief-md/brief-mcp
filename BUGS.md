# BUGS.md — Active Bug Log

This file contains ONLY active, unresolved bugs. The agent reads this every
iteration. Resolved bugs are moved to BUGS_RESOLVED.md (which the agent
never reads). This keeps this file small and context-efficient.

## Current Blockers

| Task ID | Attempts | Failing Tier | Status | Last Error Summary |
|---------|----------|-------------|--------|-------------------|

---

## Bug Details

*(BUG-001 and BUG-002 for TASK-10 moved to BUGS_RESOLVED.md — root cause was test bugs, not implementation bugs.)*
*(BUG-003 for TASK-13 resolved — human fixed test: replaced `fc.stringOf` with `fc.stringMatching` for fast-check v4 compatibility.)*

*(BUG-004 for TASK-15b resolved — see BUGS_RESOLVED.md)*

*(BUG-005 and BUG-006 for TASK-17 resolved — test bugs fixed by test-review agent, see BUGS_RESOLVED.md)*

*(BUG-007, BUG-008, BUG-009 for TASK-19 resolved — test bug fixed by test-review agent, see BUGS_RESOLVED.md)*

*(BUG-010 for TASK-20 resolved — see BUGS_RESOLVED.md)*

*(BUG-011 for TASK-32a resolved — test bug fixed by test-review agent, see BUGS_RESOLVED.md)*

*(BUG-012 and BUG-013 for TASK-34 resolved — test bug fixed by test-review agent, see BUGS_RESOLVED.md)*

<!-- Bug entries will be added here as tasks fail. Format:

### BUG-NNN: TASK-XX — Attempt N [Tier 3] or [Husky] or [SUSPECT-TEST] or [REGRESSION]
- **Failing tier:** Tier 3 (tests) or Husky (lint/arch — tests PASSED)
- **Error:** [what went wrong conceptually — NOT exact expected values]
- **Approach tried:** [algorithm/strategy used]
- **Why it failed:** [root cause in the code logic]
- **Suggested next approach:** [different algorithm to try — NOT "produce correct output"]

Four tier tags:
- [Tier 3] = tests failed → try a DIFFERENT approach
- [Husky] = lint/arch failed, tests PASSED → KEEP approach, fix mechanical issue
- [SUSPECT-TEST] = test appears to contradict the task packet's rules.
  Must cite the specific rule. Immediately marks task "needs-human-review".
  Only use after 2+ attempts with different approaches all failing.
- [REGRESSION] = implementing TASK-N broke a previously-passing test from an
  earlier task. The implementation approach for TASK-N conflicts with a
  contract already established. Identify which previously-passing test(s) broke
  and what the conflict is. Do NOT re-open or modify the earlier task — treat
  this as a TASK-N implementation problem.

WHEN RESOLVING BUGS:
- Move the bug entry from this file to BUGS_RESOLVED.md (append to end)
- Add a one-line resolution note
- Remove the task's row from the Current Blockers table above
- When a tier PASSES that previously had bugs, move those old bugs to
  BUGS_RESOLVED.md immediately — even if a later tier fails

This file must ONLY contain active bugs. Never let resolved bugs accumulate
here — they waste context on information the agent doesn't need.

-->

*(BUG-013 and BUG-014 for TASK-41 resolved — see BUGS_RESOLVED.md)*

### BUG-013: TASK-55 — Attempt 1 [Tier 3]
- **Failing tier:** Tier 3 (agent crashed before completing)
- **Error:** Agent crashed: API rate limit hit. No test results or approach data available.
- **Approach tried:** Unknown — agent did not complete. Check log: .loop-logs/iteration-2-20260308-034813.log
- **Why it failed:** Agent process terminated before reaching bug-logging step.
- **Suggested next approach:** Start fresh. Review log file for any partial progress.

### BUG-013: TASK-55 — Attempt 2 [Tier 3]
- **Failing tier:** Tier 3 (agent crashed before completing)
- **Error:** Agent crashed: API rate limit hit. No test results or approach data available.
- **Approach tried:** Unknown — agent did not complete. Check log: .loop-logs/iteration-3-20260308-041247.log
- **Why it failed:** Agent process terminated before reaching bug-logging step.
- **Suggested next approach:** Start fresh. Review log file for any partial progress.
