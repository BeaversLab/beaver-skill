#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const entry = join(__dirname, '..', 'src', 'bin.ts');
const args = process.argv.slice(2);

function run(command, commandArgs) {
  return spawnSync(command, commandArgs, {
    stdio: 'inherit',
  });
}

const bunResult = run('bun', [entry, ...args]);
if (!bunResult.error) {
  process.exit(bunResult.status ?? 0);
}

const nodeResult = run(process.execPath, ['--import', 'tsx', entry, ...args]);
if (nodeResult.error) {
  console.error('[rss-digest] Failed to start runtime.');
  console.error('[rss-digest] Install bun or use Node.js with package dependency resolution enabled.');
  console.error(String(nodeResult.error));
  process.exit(1);
}

process.exit(nodeResult.status ?? 0);
