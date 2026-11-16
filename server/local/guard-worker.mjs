#!/usr/bin/env node
// Explicit local one-shot job; cannot run in live/production financial mode.
import { runGuardSandboxTick } from "./guard-connector.mjs";
import { database } from "./database.mjs";
try {
  const report = await runGuardSandboxTick();
  console.log("FDOS Guard sandbox tick: " + JSON.stringify(report));
  if (report.held > 0) process.exitCode = 1;
} catch {
  console.error("Guard sandbox tick failed: check local Guard, FDOS, and server-only settings");
  process.exitCode = 1;
} finally {
  await database.end({ timeout: 5 });
}
