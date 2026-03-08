#!/usr/bin/env node
import { checkNodeVersion } from "./check-node-version.js";

// Enforce Node.js 20+ at startup
checkNodeVersion(20);

import { startServer } from "./server/bootstrap.js";

startServer().catch((err) => {
  process.stderr.write(`[brief-mcp] Fatal: ${err}\n`);
  process.exit(1);
});
