#!/usr/bin/env node
// Thin launcher so `npx qiropt` works after `npm install`.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tsx = join(root, 'node_modules', '.bin', 'tsx');
const result = spawnSync(tsx, [join(root, 'src', 'cli', 'main.ts'), ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(result.status ?? 1);
