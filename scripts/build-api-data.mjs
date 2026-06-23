/*
 * scripts/build-api-data.mjs — emit the API dataset as clean JSON.
 *
 * data/changes.js assigns to a `window.MCD` global. We run it in a Node vm whose
 * global object IS the sandbox (so `window.MCD = ...` behaves like the browser),
 * then serialise to data/api/messages.json, which the Worker fetches via the
 * ASSETS binding. Run on every deploy / after the daily data refresh.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = fileURLToPath(new URL('..', import.meta.url));

const sandbox = { console };
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

vm.runInContext(readFileSync(root + 'data/changes.js', 'utf8'), sandbox, { filename: 'data/changes.js' });

const MCD = sandbox.MCD || {};
const out = {
  generated: new Date().toISOString(),
  messages: MCD.DATA || [],
  products: MCD.PRODUCTS || {},
  meta: MCD.META || {},
};

mkdirSync(root + 'data/api', { recursive: true });
writeFileSync(root + 'data/api/messages.json', JSON.stringify(out));

console.log(`Wrote data/api/messages.json — ${out.messages.length} entries, ${Object.keys(out.products).length} products`);
