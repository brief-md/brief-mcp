#!/usr/bin/env node
// Hook script: blocks Read/Grep/Glob access to tests/ directory
// Used as a PreToolUse hook in .claude/settings.json

let data = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { data += chunk; });
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(data);
    const ti = input.tool_input || {};
    // Collect all path-like fields
    const paths = [
      ti.file_path || "",
      ti.path || "",
      ti.pattern || "",
    ];
    const normalized = paths.map((p) => p.replace(/\\/g, "/").toLowerCase());
    const blocked = normalized.some((p) =>
      /\/tests\/|\/tests$|^tests\/|^tests$/.test(p)
    );
    if (blocked && !process.env.AUDIT_MODE) {
      process.stdout.write(JSON.stringify({
        decision: "block",
        reason: "Access to tests/ directory is prohibited. Implement based on task packet and vitest output only."
      }));
    } else {
      process.stdout.write(JSON.stringify({ decision: "allow" }));
    }
  } catch {
    // On parse error, allow (don't break the tool)
    process.stdout.write(JSON.stringify({ decision: "allow" }));
  }
});
