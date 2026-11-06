#!/usr/bin/env node
// Run by the operator's local cron/systemd scheduler. Not an always-on daemon.
import { runAutomationWorker } from "./automation.mjs";
import { database } from "./database.mjs";
try {
  const summary=await runAutomationWorker();
  // No personal financial details, contact addresses or credentials in logs.
  process.stdout.write("FDOS automation check: "+JSON.stringify(summary)+"\n");
  if(summary.failed>0)process.exitCode=1;
}catch {
  console.error("Automation check failed; inspect local API and PostgreSQL health");
  process.exitCode=1;
}finally{
  await database.end({timeout:5});
}
