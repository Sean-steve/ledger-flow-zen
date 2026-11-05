#!/usr/bin/env node
// Dependency-free integrity proof for the immutable Stage 4 reference.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/phase-0/source-manifest.json'), 'utf8'));
const refRoot = path.join(root, 'reference/receipts-stage4');
const errors = [];
if (manifest.sourceRepository !== 'Sean-steve/Receipts' || manifest.files.length !== 57) errors.push('Unexpected source manifest.');
for (const file of manifest.files) {
  const absolute = path.resolve(refRoot, file.path);
  if (!absolute.startsWith(refRoot + path.sep) || !fs.existsSync(absolute)) {
    errors.push('Missing/invalid file: ' + file.path);
    continue;
  }
  const bytes = fs.readFileSync(absolute);
  const sha = crypto.createHash('sha1').update('blob ' + bytes.length).update(Buffer.from([0])).update(bytes).digest('hex');
  if (sha !== file.sha || bytes.length !== file.size) errors.push('Content hash mismatch: ' + file.path);
}
const tests = manifest.files.filter(x => x.path.endsWith('.test.ts'));
if (tests.length !== 7) errors.push('Expected 7 preserved test suites.');
const tpl = fs.readFileSync(path.join(refRoot, 'src/application/templateService.ts'), 'utf8');
for (const name of ['executive-atelier','modern-minimal','midnight-ledger','linear-mono','editorial-classic','nordic-studio','swiss-grid','compact-ledger']) {
  if (!tpl.includes("id: '" + name + "'")) errors.push('Missing template: ' + name);
}
if (!fs.existsSync(path.join(root, 'src/lib/db.ts'))) errors.push('Canonical DB client missing.');
if (errors.length) {
  console.error('Phase 0 FAILED:\n' + errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Phase 0 integrity PASS: 57/57 exact source files, seven tests, eight templates, canonical database client.');
}
