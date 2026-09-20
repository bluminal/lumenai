#!/usr/bin/env node

import { resolve } from 'node:path';
import {
  readExpectedEntrypoints,
  validateSkillTree,
} from '../lib/contract.mjs';

const pluginRoot = resolve(
  process.argv[2] ?? new URL('../../../plugins/synthex', import.meta.url).pathname,
);
const entries = readExpectedEntrypoints(pluginRoot);
const result = validateSkillTree(pluginRoot, entries);

if (result.missing.length || result.unexpected.length || result.invalid.length) {
  console.error(JSON.stringify({ ok: false, ...result }, null, 2));
  process.exitCode = 1;
} else {
  const counts = {
    commands: entries.filter(({ kind }) => kind === 'command').length,
    agents: entries.filter(({ kind }) => kind === 'agent').length,
    total: entries.length,
  };
  console.log(JSON.stringify({ ok: true, counts }));
}
