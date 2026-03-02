#!/usr/bin/env node
import { checkNodeVersion } from "./check-node-version.js";

// Enforce Node.js 20+ at startup
checkNodeVersion(20);

// CLI entry point — full implementation in TASK-47
