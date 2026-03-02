import { checkNodeVersion } from "./check-node-version.js";

// Enforce Node.js 20+ at startup
checkNodeVersion(20);

// Placeholder export — full server bootstrap implemented in TASK-08
export const BRIEF_MCP_VERSION = "1.0.0";
