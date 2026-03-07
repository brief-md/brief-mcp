#!/bin/bash
set -euo pipefail

# ============================================================================
# Enhanced Ralph Loop — Audit → Build Mode
#
# Usage:
#   ./loop.sh           # Run until all tasks done or safety stop
#   ./loop.sh 50        # Run max 50 iterations
#
# Per-task flow:
#   1. AUDIT AGENT (first attempt only — skipped on retries)
#      - Reads spec + tests, hunts for missing fixtures, fixes consistency
#      - Signals AUDIT_READY or AUDIT_BLOCKED via .loop-signal
#      - If BLOCKED: task marked needs-human-review, loop moves to next task
#   2. BUILD AGENT (only if audit passed)
#      - Standard implementation → test → commit cycle
#      - Cannot read tests/ (blocked via settings)
#   3. CONTINUATION AGENT (if build hits max-turns with uncommitted changes)
#   4. TEST-REVIEW AGENT (if build flags [SUSPECT-TEST])
#
# Token tracking:
#   Every agent prints input/output tokens. The loop logs them per step and
#   accumulates a running total so you can diagnose context rot across tasks.
# ============================================================================

MAX_ITERATIONS=${1:-0}       # 0 = unlimited
CONSECUTIVE_DIFF_FAILURES=0  # Counts failures across DIFFERENT tasks only
MAX_DIFF_FAILURES=3          # Stop loop after 3 different tasks fail in a row
LAST_FAILED_TASK=""          # Track which task failed last (for same-task detection)
SKIPPED_TASKS=""             # Tasks skipped due to unmet dependencies (reset on success)
SAME_TASK_ITER_COUNT=0       # Consecutive iterations on the same task
MAX_SAME_TASK_ITERS=5        # After 5 iters on same task without commit → escalate to needs-human-review
CURRENT_TASK=""              # Track which task is currently being worked
LOG_DIR=".loop-logs"
ITERATION=0
CURRENT_BRANCH=$(git branch --show-current)

# Token tracking — cumulative across all iterations
TOTAL_INPUT_TOKENS=0
TOTAL_OUTPUT_TOKENS=0

mkdir -p "$LOG_DIR"

echo "=== Enhanced Ralph Loop (Audit → Build) ==="
echo "Branch: $CURRENT_BRANCH"
echo "Model: claude-opus-4-6"
[ $MAX_ITERATIONS -gt 0 ] && echo "Max iterations: $MAX_ITERATIONS"
echo "Safety: stops after $MAX_DIFF_FAILURES different tasks failing consecutively"
echo "---"

# Helper: extract tokens from a log file and print a labelled summary line
# Usage: extract_tokens <log_file> <label>
# Returns: sets STEP_INPUT_TOKENS and STEP_OUTPUT_TOKENS
extract_tokens() {
  local log_file="$1"
  local label="$2"
  STEP_INPUT_TOKENS=$(grep -o '"input_tokens": *[0-9]*' "$log_file" 2>/dev/null | tail -1 | grep -o '[0-9]*$' || echo "0")
  STEP_OUTPUT_TOKENS=$(grep -o '"output_tokens": *[0-9]*' "$log_file" 2>/dev/null | tail -1 | grep -o '[0-9]*$' || echo "0")
  echo "  [$label] Tokens: input=${STEP_INPUT_TOKENS} output=${STEP_OUTPUT_TOKENS}"
  TOTAL_INPUT_TOKENS=$((TOTAL_INPUT_TOKENS + STEP_INPUT_TOKENS))
  TOTAL_OUTPUT_TOKENS=$((TOTAL_OUTPUT_TOKENS + STEP_OUTPUT_TOKENS))
  echo "  [CUMULATIVE] input=${TOTAL_INPUT_TOKENS} output=${TOTAL_OUTPUT_TOKENS}"
  # Log to token file for context rot analysis
  echo "$(date '+%Y-%m-%d %H:%M') iter=${ITERATION} task=${CURRENT_TASK:-unknown} step=${label} in=${STEP_INPUT_TOKENS} out=${STEP_OUTPUT_TOKENS} cumIn=${TOTAL_INPUT_TOKENS}" \
    >> "$LOG_DIR/token-log.tsv"
}

while true; do
  # --- Max iteration check ---
  if [ $MAX_ITERATIONS -gt 0 ] && [ $ITERATION -ge $MAX_ITERATIONS ]; then
    echo "=== Reached max iterations ($MAX_ITERATIONS) ==="
    break
  fi

  # --- Consecutive different-task failure check ---
  if [ $CONSECUTIVE_DIFF_FAILURES -ge $MAX_DIFF_FAILURES ]; then
    echo "=== SAFETY STOP: $MAX_DIFF_FAILURES different tasks failed consecutively ==="
    echo "This suggests a systemic issue (broken dependency, corrupted state)."
    echo "Review BUGS.md and git log before resuming."
    exit 1
  fi

  ITERATION=$((ITERATION + 1))
  ITER_START=$(date +%s)
  ITER_LOG="$LOG_DIR/iteration-${ITERATION}-$(date '+%Y%m%d-%H%M%S').log"

  echo ""
  echo "=== Iteration $ITERATION ($(date '+%H:%M:%S')) ==="
  echo "Different-task failures in a row: $CONSECUTIVE_DIFF_FAILURES"

  # --- Pre-detect next task ---
  NEXT_TASK=""
  IN_PROGRESS=$(grep 'in-progress' TASK_INDEX.md 2>/dev/null | head -1 | grep -oE 'TASK-[0-9]+[a-z]*' | head -1 || true)
  if [ -n "$IN_PROGRESS" ]; then
    NEXT_TASK="$IN_PROGRESS"
    IS_FIRST_ATTEMPT=false   # Already in-progress → retry → skip audit
  else
    while IFS= read -r _line; do
      _candidate=$(echo "$_line" | grep -oE 'TASK-[0-9]+[a-z]*' | head -1)
      if [ -n "$_candidate" ] && ! echo "$SKIPPED_TASKS" | grep -qw "$_candidate"; then
        NEXT_TASK="$_candidate"
        break
      fi
    done < <(grep 'pending' TASK_INDEX.md)
    IS_FIRST_ATTEMPT=true    # Was pending → first attempt → run audit
  fi

  # --- Per-task iteration limit ---
  if [ -n "$NEXT_TASK" ]; then
    if [ "$NEXT_TASK" = "$CURRENT_TASK" ]; then
      SAME_TASK_ITER_COUNT=$((SAME_TASK_ITER_COUNT + 1))
    else
      SAME_TASK_ITER_COUNT=1
      CURRENT_TASK="$NEXT_TASK"
    fi

    if [ $SAME_TASK_ITER_COUNT -ge $MAX_SAME_TASK_ITERS ]; then
      echo "  -> PER-TASK LIMIT: $NEXT_TASK has run $SAME_TASK_ITER_COUNT iterations without a commit"
      echo "  -> Escalating to needs-human-review"
      sed -i "s/| $NEXT_TASK | \([0-9]*\) | in-progress /| $NEXT_TASK | \1 | needs-human-review /" TASK_INDEX.md
      SAME_TASK_ITER_COUNT=0
      CURRENT_TASK=""
      CONSECUTIVE_DIFF_FAILURES=$((CONSECUTIVE_DIFF_FAILURES + 1))
      sleep 2
      continue
    fi
  fi

  # --- Build context for the task ---
  DYNAMIC_PROMPT=""
  TASK_FILE=""
  TEST_FILE=""
  MODULE_PATH=""
  MODULE_CONTENT=""
  SIBLING_CONTENT=""
  TYPE_CONTENT=""

  if [ -n "$NEXT_TASK" ]; then
    TASK_FILE=$(ls tasks/${NEXT_TASK}* 2>/dev/null | head -1)
    MODULE_PATH=$(grep 'Module path:' "$TASK_FILE" 2>/dev/null | sed 's/.*Module path: *//' | tr -d '`' | xargs || true)
    TEST_FILE_REL=$(grep 'Test file:' "$TASK_FILE" 2>/dev/null | sed 's/.*Test file: *//' | tr -d '`' | xargs || true)
    ALSO_READ=$(grep 'Also read:' "$TASK_FILE" 2>/dev/null | sed 's/.*Also read: *//' | tr -d '`' || true)

    # Read module files
    if [ -n "$MODULE_PATH" ]; then
      if [ -d "$MODULE_PATH" ]; then
        for f in "$MODULE_PATH"*.ts; do
          [ -f "$f" ] && MODULE_CONTENT="$MODULE_CONTENT
--- $f ---
$(cat "$f")"
        done
      elif [ -f "$MODULE_PATH" ]; then
        MODULE_CONTENT="--- $MODULE_PATH ---
$(cat "$MODULE_PATH")"
      fi
    fi

    # Read type interface files
    if [ -n "$ALSO_READ" ]; then
      IFS=',' read -ra TYPE_FILES <<< "$ALSO_READ"
      for tf in "${TYPE_FILES[@]}"; do
        tf=$(echo "$tf" | xargs)
        [ -f "$tf" ] && TYPE_CONTENT="$TYPE_CONTENT
--- $tf ---
$(cat "$tf")"
      done
    fi

    # Auto-inject sibling modules
    if [ -n "$MODULE_PATH" ] && [ -f "$MODULE_PATH" ]; then
      MODULE_DIR=$(dirname "$MODULE_PATH")
      for f in "$MODULE_DIR"/*.ts; do
        [ "$f" = "$MODULE_PATH" ] && continue
        [ -f "$f" ] && SIBLING_CONTENT="$SIBLING_CONTENT
--- $f ---
$(cat "$f")"
      done
    fi

    # =========================================================================
    # PHASE A: AUDIT AGENT (first attempt on this task only)
    # =========================================================================
    if [ "$IS_FIRST_ATTEMPT" = true ] && [ -f "PROMPT_audit.md" ]; then
      echo "  -> Running AUDIT AGENT for $NEXT_TASK (first attempt)"
      AUDIT_LOG="$LOG_DIR/iteration-${ITERATION}-audit-$(date '+%Y%m%d-%H%M%S').log"
      rm -f .loop-signal

      AUDIT_PROMPT="$(cat PROMPT_audit.md)

========================================
PRE-LOADED CONTEXT FOR AUDIT — Do NOT re-read these files
========================================

=== Task Packet: $NEXT_TASK ===
$(cat "$TASK_FILE" 2>/dev/null || echo '(task file not found)')

=== Module Stub ===
$MODULE_CONTENT

=== Sibling Modules ===
$SIBLING_CONTENT

=== Type Interfaces ===
$TYPE_CONTENT

=== LEARNINGS.md ===
$(cat LEARNINGS.md 2>/dev/null || echo '(not found)')
"

      AUDIT_PROMPT_FILE="$LOG_DIR/prompt-${ITERATION}-audit.txt"
      printf '%s' "$AUDIT_PROMPT" > "$AUDIT_PROMPT_FILE"

      export CLAUDE_CODE_MAX_OUTPUT_TOKENS=128000
      export AUDIT_MODE=1
      cat "$AUDIT_PROMPT_FILE" | claude \
        --model claude-opus-4-6 \
        --dangerously-skip-permissions \
        --output-format stream-json \
        --verbose \
        --max-turns 30 \
        2>&1 | tee "$AUDIT_LOG" | node scripts/format-log.js || true
      unset AUDIT_MODE

      extract_tokens "$AUDIT_LOG" "AUDIT"

      # Read audit verdict from .loop-signal
      AUDIT_VERDICT="AUDIT_BLOCKED"  # default: fail-safe — agent must write explicit AUDIT_READY
      BLOCKED_REASON=""              # always defined — set to detail only if signal file says so
      if [ -f ".loop-signal" ]; then
        SIGNAL=$(cat .loop-signal)
        if echo "$SIGNAL" | grep -q "AUDIT_READY"; then
          AUDIT_VERDICT="AUDIT_READY"
        elif echo "$SIGNAL" | grep -q "AUDIT_BLOCKED"; then
          AUDIT_VERDICT="AUDIT_BLOCKED"
          BLOCKED_REASON=$(echo "$SIGNAL" | sed 's/AUDIT_BLOCKED[: ]*//')
        elif echo "$SIGNAL" | grep -q "NO_WORKABLE_TASKS"; then
          AUDIT_VERDICT="NO_WORKABLE_TASKS"
        fi
        rm -f .loop-signal
      fi

      if [ "$AUDIT_VERDICT" = "AUDIT_BLOCKED" ]; then
        # Save any partial audit work so a reset can't wipe it
        _AUDIT_PARTIAL=$(git status --porcelain src/ tests/ tasks/ ERROR_CONVENTIONS.md 2>/dev/null | grep -vF '??' | head -1 || true)
        _AUDIT_PARTIAL_NEW=$(git ls-files --others --exclude-standard src/ tests/ tasks/ 2>/dev/null | head -1 || true)
        if [ -n "$_AUDIT_PARTIAL" ] || [ -n "$_AUDIT_PARTIAL_NEW" ]; then
          echo "  -> Saving partial audit work before blocking"
          git add -A
          git commit -m "audit: partial fixes for $NEXT_TASK (blocked/incomplete)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>" || true
        fi
        echo "  -> AUDIT BLOCKED: $NEXT_TASK cannot proceed — human input required"
        echo "  -> Reason: ${BLOCKED_REASON:-(audit crashed or hit max turns without writing signal)}"
        echo "  -> Marking $NEXT_TASK as needs-human-review"
        sed -i "s/| $NEXT_TASK | \([0-9]*\) | pending /| $NEXT_TASK | \1 | needs-human-review /" TASK_INDEX.md
        SKIPPED_TASKS="$SKIPPED_TASKS $NEXT_TASK"
        CONSECUTIVE_DIFF_FAILURES=$((CONSECUTIVE_DIFF_FAILURES + 1))
        continue
      elif [ "$AUDIT_VERDICT" = "NO_WORKABLE_TASKS" ]; then
        echo "  -> Audit: $NEXT_TASK has unmet dependencies — skipping"
        SKIPPED_TASKS="$SKIPPED_TASKS $NEXT_TASK"
        continue
      else
        echo "  -> AUDIT READY: $NEXT_TASK cleared for implementation"
        # Commit any fixes the audit agent made (agent no longer does this itself)
        AUDIT_CHANGES=$(git status --porcelain src/ tests/ tasks/ ERROR_CONVENTIONS.md 2>/dev/null | grep -vF '??' | head -1 || true)
        AUDIT_UNTRACKED=$(git ls-files --others --exclude-standard src/ tests/ tasks/ 2>/dev/null | head -1 || true)
        if [ -n "$AUDIT_CHANGES" ] || [ -n "$AUDIT_UNTRACKED" ]; then
          echo "  -> Committing audit fixes for $NEXT_TASK"
          git add -A
          git commit -m "audit: pre-implementation fixes for $NEXT_TASK

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>" \
            || echo "  -> Nothing new to commit from audit"
        else
          echo "  -> No audit fixes to commit"
        fi
      fi
    else
      if [ "$IS_FIRST_ATTEMPT" = false ]; then
        echo "  -> Skipping audit (retry attempt — audit already ran for $NEXT_TASK)"
      else
        echo "  -> Skipping audit (PROMPT_audit.md not found)"
      fi
    fi

    # =========================================================================
    # PHASE B: BUILD AGENT
    # =========================================================================
    echo "  Pre-injecting context for $NEXT_TASK (packet: $TASK_FILE)"
    DYNAMIC_PROMPT="$(cat PROMPT_build_v2.md)

========================================
PRE-LOADED CONTEXT — Do NOT re-read these files
========================================

=== TASK_INDEX.md ===
$(cat TASK_INDEX.md)

=== Task Packet: $NEXT_TASK ===
$(cat "$TASK_FILE" 2>/dev/null | sed \
  's/^- Module path: .*/- Module path: (pre-loaded as Module Files below)/' | sed \
  's/^- Also read: .*/- Also read: (pre-loaded as Sibling Modules and Type Interfaces below)/' \
  || echo '(task file not found)')

=== BUGS.md ===
$(cat BUGS.md)

=== LEARNINGS.md ===
$(cat LEARNINGS.md)

=== LOCKED_FILES.txt ===
$(cat LOCKED_FILES.txt 2>/dev/null || echo '(no locked files)')

=== Module Files ===
$MODULE_CONTENT

=== Sibling Modules (same directory — do NOT re-read these) ===
$SIBLING_CONTENT

=== Type Interfaces ===
$TYPE_CONTENT
"
  else
    # Fallback to original prompt if task detection fails
    echo "  WARNING: Could not detect next task — using original prompt"
    DYNAMIC_PROMPT="$(cat PROMPT_build.md)"
  fi

  # --- Snapshot bug count before running build agent ---
  BUGS_COUNT_BEFORE=$(grep -c '^### BUG-' BUGS.md 2>/dev/null || true)

  # --- Run build agent ---
  PROMPT_FILE="$LOG_DIR/prompt-${ITERATION}.txt"
  printf '%s' "$DYNAMIC_PROMPT" > "$PROMPT_FILE"
  export CLAUDE_CODE_MAX_OUTPUT_TOKENS=128000
  cat "$PROMPT_FILE" | claude \
    --model claude-opus-4-6 \
    --dangerously-skip-permissions \
    --output-format stream-json \
    --verbose \
    --max-turns 30 \
    2>&1 | tee "$ITER_LOG" | node scripts/format-log.js || true

  EXIT_CODE=${PIPESTATUS[0]}
  ITER_END=$(date +%s)
  ITER_DURATION=$((ITER_END - ITER_START))

  extract_tokens "$ITER_LOG" "BUILD"

  # Detect silent build agent crash (0 tokens = claude never ran or exited immediately)
  if [ "$STEP_INPUT_TOKENS" -eq 0 ] && [ "$STEP_OUTPUT_TOKENS" -eq 0 ]; then
    echo "  ERROR: Build agent produced 0 tokens — likely crashed or API error"
    echo "  Treating as failed iteration (do not count any prior audit commit as success)"
    CONSECUTIVE_DIFF_FAILURES=$((CONSECUTIVE_DIFF_FAILURES + 1))
    LAST_FAILED_TASK="$NEXT_TASK"
    continue
  fi

  if [ $ITER_DURATION -gt 1200 ]; then
    echo "  WARNING: Iteration took ${ITER_DURATION}s (>20 min) — possible spiral"
    echo "  [$(date '+%Y-%m-%d %H:%M')] Iteration $ITERATION: ${ITER_DURATION}s" >> "$LOG_DIR/duration-warnings.log"
  fi

  # --- Continuation agent: if max_turns hit with uncommitted changes ---
  HIT_MAX_TURNS=$(grep -c '"subtype":"error_max_turns"' "$ITER_LOG" 2>/dev/null) || HIT_MAX_TURNS=0
  HAS_CHANGES=$(git diff --name-only 2>/dev/null | head -1)
  if [ -z "$HAS_CHANGES" ]; then
    HAS_CHANGES=$(git ls-files --others --exclude-standard src/ 2>/dev/null | head -1)
  fi
  LATEST_COMMIT_TIME_PRE=$(git log -1 --format=%ct 2>/dev/null || echo "0")

  if [ "$HIT_MAX_TURNS" -gt 0 ] && [ -n "$HAS_CHANGES" ] && [ "$LATEST_COMMIT_TIME_PRE" -lt "$ITER_START" ]; then
    echo "  -> Max turns hit with uncommitted changes — spawning continuation agent"
    CONT_LOG="$LOG_DIR/iteration-${ITERATION}-continue-$(date '+%Y%m%d-%H%M%S').log"

    CONT_PROMPT="$(cat PROMPT_continue_v2.md)

========================================
PRE-LOADED CONTEXT
========================================

=== TASK_INDEX.md ===
$(cat TASK_INDEX.md)

=== Task Packet ===
$(cat "$TASK_FILE" 2>/dev/null | sed \
  's/^- Module path: .*/- Module path: (pre-loaded)/' | sed \
  's/^- Also read: .*/- Also read: (pre-loaded)/' \
  || echo '(task file not found)')

=== BUGS.md ===
$(cat BUGS.md)

=== LEARNINGS.md ===
$(cat LEARNINGS.md)

=== LOCKED_FILES.txt ===
$(cat LOCKED_FILES.txt 2>/dev/null || echo '(no locked files)')

=== Uncommitted changes (tracked files) ===
$(git diff 2>/dev/null | head -400)

=== New untracked src/ files (new implementations not yet in git) ===
$(git ls-files --others --exclude-standard src/ 2>/dev/null | while IFS= read -r f; do echo "--- $f ---"; cat "$f"; done | head -400)
"

    CONT_PROMPT_FILE="$LOG_DIR/prompt-${ITERATION}-continue.txt"
    printf '%s' "$CONT_PROMPT" > "$CONT_PROMPT_FILE"
    export CLAUDE_CODE_MAX_OUTPUT_TOKENS=128000
    cat "$CONT_PROMPT_FILE" | claude \
      --model claude-opus-4-6 \
      --dangerously-skip-permissions \
      --output-format stream-json \
      --verbose \
      --max-turns 25 \
      2>&1 | tee "$CONT_LOG" | node scripts/format-log.js || true

    EXIT_CODE=${PIPESTATUS[0]}
    ITER_END=$(date +%s)
    ITER_DURATION=$((ITER_END - ITER_START))
    extract_tokens "$CONT_LOG" "CONTINUATION"
    echo "  Continuation agent finished (exit: $EXIT_CODE, total ${ITER_DURATION}s)"
  fi

  echo "=== Iteration $ITERATION finished in ${ITER_DURATION}s (exit: $EXIT_CODE) ==="

  # --- Check if agent signalled no workable tasks ---
  if [ -f ".loop-signal" ] && grep -q "NO_WORKABLE_TASKS" .loop-signal 2>/dev/null; then
    rm -f .loop-signal
    if [ -n "$NEXT_TASK" ]; then
      SKIPPED_TASKS="$SKIPPED_TASKS $NEXT_TASK"
      echo "  -> $NEXT_TASK has unmet dependencies — skipping"
      _has_workable=false
      while IFS= read -r _line; do
        _candidate=$(echo "$_line" | grep -oE 'TASK-[0-9]+[a-z]*' | head -1)
        if [ -n "$_candidate" ] && ! echo "$SKIPPED_TASKS" | grep -qw "$_candidate"; then
          _has_workable=true
          break
        fi
      done < <(grep 'pending' TASK_INDEX.md)
      if [ "$_has_workable" = false ]; then
        echo "=== All remaining pending tasks have unmet dependencies ==="
        break
      fi
      continue
    else
      echo "=== No workable tasks remaining ==="
      break
    fi
  fi
  rm -f .loop-signal

  # --- Context budget enforcement ---
  SMART_ZONE_LIMIT=23000
  CONTEXT_HARD_LIMIT=39000
  CONTEXT_OVERFLOW=false

  if [ "${STEP_INPUT_TOKENS:-0}" -gt "$CONTEXT_HARD_LIMIT" ]; then
    echo "  CONTEXT OVERFLOW: ${STEP_INPUT_TOKENS} input tokens exceeded context window (${CONTEXT_HARD_LIMIT})"
    echo "  Output is unreliable — forcing retry with reset."
    echo "  [$(date '+%Y-%m-%d %H:%M')] Iteration $ITERATION: OVERFLOW ${STEP_INPUT_TOKENS} input tokens" >> "$LOG_DIR/token-warnings.log"
    CONTEXT_OVERFLOW=true
  elif [ "${STEP_INPUT_TOKENS:-0}" -gt "$SMART_ZONE_LIMIT" ]; then
    echo "  WARNING: Left smart zone — ${STEP_INPUT_TOKENS} input tokens (limit: ${SMART_ZONE_LIMIT})"
    echo "  [$(date '+%Y-%m-%d %H:%M')] Iteration $ITERATION: ${STEP_INPUT_TOKENS} input tokens (outside smart zone)" >> "$LOG_DIR/token-warnings.log"
  fi

  # --- Detect success or failure ---
  LATEST_COMMIT_TIME=$(git log -1 --format=%ct 2>/dev/null || echo "0")

  if [ "$CONTEXT_OVERFLOW" = true ]; then
    echo "  -> CONTEXT OVERFLOW: reverting any changes from this iteration"
    git checkout HEAD -- src/ 2>/dev/null || true
    echo "  Next iteration will retry fresh with full context budget."
  elif [ $EXIT_CODE -eq 0 ] && [ "$LATEST_COMMIT_TIME" -ge "$ITER_START" ]; then
    # --- Verify locked files are append-only ---
    LOCK_VIOLATION=false
    if [ -f "LOCKED_FILES.txt" ]; then
      while IFS= read -r pattern; do
        [[ "$pattern" =~ ^#.*$ || -z "$pattern" ]] && continue
        for locked_file in $pattern; do
          [ -f "$locked_file" ] || continue
          DELETIONS=$(git diff HEAD~1 HEAD -- "$locked_file" 2>/dev/null | grep -c '^-[^-]' || true)
          if [ "$DELETIONS" -gt 0 ]; then
            echo "  LOCK VIOLATION: $locked_file has $DELETIONS deleted lines"
            LOCK_VIOLATION=true
          fi
        done
      done < LOCKED_FILES.txt
    fi

    if [ "$LOCK_VIOLATION" = true ]; then
      echo "  -> REJECTING: agent modified locked files (append-only violation)"
      git revert --no-edit HEAD 2>/dev/null || git reset --hard HEAD~1
      FAILED_TASK=$(grep '^### BUG-[0-9]' BUGS.md 2>/dev/null | grep -oE 'TASK-[0-9]+[a-z]*' | tail -1 || echo "unknown")
      if [ "$FAILED_TASK" != "$LAST_FAILED_TASK" ]; then
        CONSECUTIVE_DIFF_FAILURES=$((CONSECUTIVE_DIFF_FAILURES + 1))
      fi
      LAST_FAILED_TASK="$FAILED_TASK"
    else
      echo "  -> SUCCESS: new commit detected"
      CONSECUTIVE_DIFF_FAILURES=0
      LAST_FAILED_TASK=""
      SKIPPED_TASKS=""
      SAME_TASK_ITER_COUNT=0
      CURRENT_TASK=""

      # Lock type files after implementation
      NEW_TYPE_FILES=$(git diff --name-only HEAD~1 HEAD -- 'src/types/' 2>/dev/null || true)
      if [ -n "$NEW_TYPE_FILES" ]; then
        echo "  Locking type contract files:"
        while IFS= read -r f; do
          if ! grep -qF "$f" LOCKED_FILES.txt 2>/dev/null; then
            echo "$f" >> LOCKED_FILES.txt
            echo "    + $f"
          fi
        done <<< "$NEW_TYPE_FILES"
      fi
    fi
  else
    echo "  -> NO COMMIT (exit=$EXIT_CODE)"

    FAILED_TASK=$(grep '^### BUG-[0-9]' BUGS.md 2>/dev/null | grep -oE 'TASK-[0-9]+[a-z]*' | tail -1 || echo "unknown")

    if [ "$FAILED_TASK" = "$LAST_FAILED_TASK" ]; then
      echo "  Same task ($FAILED_TASK) retrying — per-task limit applies"
    else
      CONSECUTIVE_DIFF_FAILURES=$((CONSECUTIVE_DIFF_FAILURES + 1))
      echo "  Different task failing ($FAILED_TASK) — diff-failure count: $CONSECUTIVE_DIFF_FAILURES"
    fi
    LAST_FAILED_TASK="$FAILED_TASK"

    echo "  Resetting failed implementation changes..."
    git checkout HEAD -- src/ 2>/dev/null || true

    # Crash detection
    BUGS_COUNT_AFTER=$(grep -c '^### BUG-' BUGS.md 2>/dev/null || true)
    IN_PROGRESS_TASK=$(grep 'in-progress' TASK_INDEX.md 2>/dev/null | grep -oE 'TASK-[0-9]+[a-z]*' | head -1 || true)
    if [ -n "$IN_PROGRESS_TASK" ] && [ "$BUGS_COUNT_AFTER" -le "$BUGS_COUNT_BEFORE" ]; then
      echo "  CRASH DETECTED: $IN_PROGRESS_TASK failed without writing a new bug entry"
      echo "  Writing crash bug entry to BUGS.md..."

      LAST_BUG=$(grep -oE 'BUG-[0-9]+' BUGS.md 2>/dev/null | grep -oE '[0-9]+$' | sort -n | tail -1 || echo "0")
      NEXT_BUG=$((LAST_BUG + 1))
      NEXT_BUG_PAD=$(printf "%03d" $NEXT_BUG)

      CRASH_REASON="unknown"
      if grep -qE "You.ve hit your limit|rate.?limit|overloaded" "$ITER_LOG" 2>/dev/null; then
        CRASH_REASON="API rate limit hit"
      elif grep -qE 'ECONNREFUSED|ConnectionRefused|Unable to connect to API' "$ITER_LOG" 2>/dev/null; then
        CRASH_REASON="API connection refused"
      elif grep -q 'UND_ERR_SOCKET\|ECONNRESET\|ETIMEDOUT' "$ITER_LOG" 2>/dev/null; then
        CRASH_REASON="API connection error (socket/timeout)"
      elif [ "$HIT_MAX_TURNS" -gt 0 ]; then
        CRASH_REASON="hit max-turns limit without completing"
      elif grep -q 'ENOMEM\|heap out of memory' "$ITER_LOG" 2>/dev/null; then
        CRASH_REASON="out of memory"
      fi

      if [[ "$CRASH_REASON" == *"rate limit"* ]]; then
        echo "  -> Rate limited — sleeping 60s before retry"
        sleep 60
      fi

      PREV_ATTEMPTS=$(grep -c "$IN_PROGRESS_TASK.*Attempt" BUGS.md 2>/dev/null || true)
      ATTEMPT_NUM=$((PREV_ATTEMPTS + 1))

      printf '\n### BUG-%s: %s — Attempt %d [Tier 3]\n' "$NEXT_BUG_PAD" "$IN_PROGRESS_TASK" "$ATTEMPT_NUM" >> BUGS.md
      printf -- '- **Failing tier:** Tier 3 (agent crashed before completing)\n' >> BUGS.md
      printf -- '- **Error:** Agent crashed: %s. No test results or approach data available.\n' "$CRASH_REASON" >> BUGS.md
      printf -- '- **Approach tried:** Unknown — agent did not complete. Check log: %s\n' "$ITER_LOG" >> BUGS.md
      printf -- '- **Why it failed:** Agent process terminated before reaching bug-logging step.\n' >> BUGS.md
      printf -- '- **Suggested next approach:** Start fresh. Review log file for any partial progress.\n' >> BUGS.md

      if grep -q '*(none)*' BUGS.md 2>/dev/null; then
        sed -i "s/| \*(none)\* | .*/| $IN_PROGRESS_TASK | $ATTEMPT_NUM | Tier 3 | active | Agent crashed: $CRASH_REASON |/" BUGS.md
      fi

      echo "  Wrote BUG-$NEXT_BUG_PAD for $IN_PROGRESS_TASK (crash recovery, attempt $ATTEMPT_NUM)"
    fi

    if [ $EXIT_CODE -ne 0 ]; then
      echo "  Pausing 10s before next iteration..."
      sleep 10
    fi
  fi

  # --- Test-review agent: if [SUSPECT-TEST] flagged ---
  if grep -q '^### BUG-[0-9].*\[SUSPECT-TEST\]' BUGS.md 2>/dev/null; then
    echo "  -> [SUSPECT-TEST] detected — spawning test-review agent"
    TR_LOG="$LOG_DIR/iteration-${ITERATION}-test-review-$(date '+%Y%m%d-%H%M%S').log"

    cp .claude/settings.json .claude/settings.build-backup.json
    cp .claude/settings.test-review.json .claude/settings.json

    CLAUDE_CODE_MAX_OUTPUT_TOKENS=128000 \
    claude -p "$(cat PROMPT_test_review.md)" \
      --model claude-opus-4-6 \
      --dangerously-skip-permissions \
      --output-format stream-json \
      --verbose \
      --max-turns 15 \
      2>&1 | tee "$TR_LOG" | node scripts/format-log.js || true

    TR_EXIT=${PIPESTATUS[0]}

    cp .claude/settings.build-backup.json .claude/settings.json
    rm -f .claude/settings.build-backup.json

    extract_tokens "$TR_LOG" "TEST-REVIEW"

    # Safety: verify test-review agent only touched tests/
    TR_UNCOMMITTED=$(git diff --name-only 2>/dev/null || true)
    TR_NON_TEST=$(echo "$TR_UNCOMMITTED" | grep -v '^tests/' | grep -v '^$' || true)
    if [ -n "$TR_NON_TEST" ]; then
      echo "  SAFETY: test-review agent left uncommitted non-test changes — reverting"
      while IFS= read -r f; do
        [ -n "$f" ] && git checkout HEAD -- "$f" 2>/dev/null || true
      done <<< "$TR_NON_TEST"
    fi

    TR_COMMIT_TIME=$(git log -1 --format=%ct 2>/dev/null || echo "0")
    if [ "$TR_COMMIT_TIME" -ge "$ITER_START" ]; then
      TR_COMMITTED_FILES=$(git diff --name-only HEAD~1 HEAD 2>/dev/null || true)
      TR_BAD_COMMIT=$(echo "$TR_COMMITTED_FILES" | grep -v '^tests/' | grep -v '^$' || true)
      if [ -n "$TR_BAD_COMMIT" ]; then
        echo "  SAFETY: test-review agent committed non-test files — reverting commit"
        git revert --no-edit HEAD 2>/dev/null || git reset --hard HEAD~1
      fi
    fi

    [ -f ".loop-signal" ] && grep -q "NO_SUSPECT_TESTS" .loop-signal 2>/dev/null && rm -f .loop-signal
    echo "  Test-review agent finished (exit: $TR_EXIT)"
  fi

  # --- Check if all tasks are done ---
  REMAINING=$(grep -c 'pending\|in-progress' TASK_INDEX.md 2>/dev/null || true)
  if [ "$REMAINING" -eq 0 ]; then
    echo "=== All tasks completed or escalated to human review! ==="
    break
  fi

  echo "---"
  sleep 2
done

echo ""
echo "=== Loop finished after $ITERATION iterations ==="
COMPLETED=$(grep -c 'completed' TASK_INDEX.md 2>/dev/null || true)
HUMAN_REVIEW=$(grep -c 'needs-human-review' TASK_INDEX.md 2>/dev/null || true)
STILL_PENDING=$(grep -c 'pending\|in-progress' TASK_INDEX.md 2>/dev/null || true)
echo "  Completed: $COMPLETED"
echo "  Needs human review: $HUMAN_REVIEW"
echo "  Still pending: $STILL_PENDING"
echo "  Total input tokens this run: $TOTAL_INPUT_TOKENS"
echo "  Total output tokens this run: $TOTAL_OUTPUT_TOKENS"
echo ""
echo "Token log: $LOG_DIR/token-log.tsv"
echo "Review: git log --oneline -20"
echo "Review: cat TASK_INDEX.md"
echo "Review: cat BUGS.md && cat BUGS_RESOLVED.md"
echo "Review: cat LEARNINGS.md"
