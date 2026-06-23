#!/usr/bin/env node
/*
 * scripts/apikeys.mjs — manage API keys for this tool.
 *
 * The repo stores ONLY SHA-256 hashes of keys (api-keys.json). The raw key is
 * shown exactly once, when created, so you can hand it out; it is never written
 * to disk and cannot be recovered. Safe to keep api-keys.json in a public repo.
 *
 *   node scripts/apikeys.mjs new --name "Florian CLI"
 *   node scripts/apikeys.mjs list
 *   node scripts/apikeys.mjs revoke <id>
 *   node scripts/apikeys.mjs enable <id>
 *   node scripts/apikeys.mjs verify <key>
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const PREFIX = 'mcd'; // per-tool key prefix (mcd = MessageCenter)
const FILE = fileURLToPath(new URL('../api-keys.json', import.meta.url));

function load() {
  try { return JSON.parse(readFileSync(FILE, 'utf8')); }
  catch { return { version: 1, keys: [] }; }
}
function save(registry) {
  writeFileSync(FILE, JSON.stringify(registry, null, 2) + '\n');
}
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const today = () => new Date().toISOString().slice(0, 10);

const [, , cmd, ...rest] = process.argv;
const flag = (name) => {
  const i = rest.indexOf('--' + name);
  return i >= 0 ? rest[i + 1] : null;
};
const positional = rest.filter((a, i) => !a.startsWith('--') && rest[i - 1] !== '--name');

function cmdNew() {
  const name = flag('name') || positional[0] || 'unnamed';
  const secret = randomBytes(16).toString('hex'); // 32 hex chars
  const key = `${PREFIX}_live_${secret}`;
  const id = 'k_' + randomBytes(4).toString('hex');
  const registry = load();
  registry.keys.push({
    id,
    name,
    prefix: `${PREFIX}_live_${secret.slice(0, 6)}`,
    hash: sha256(key),
    created: today(),
    disabled: false,
  });
  save(registry);
  console.log('\n  New API key created — copy it now, it is NOT recoverable:\n');
  console.log('    ' + key + '\n');
  console.log('    id:   ' + id);
  console.log('    name: ' + name + '\n');
  console.log('  Test it:');
  console.log(`    curl -H "Authorization: Bearer ${key}" http://localhost:8787/api/v1/health\n`);
}

function cmdList() {
  const registry = load();
  if (!registry.keys.length) { console.log('No API keys yet. Create one with:  node scripts/apikeys.mjs new --name "<who>"'); return; }
  console.log('\n  id            status    created     prefix             name');
  console.log('  ' + '-'.repeat(70));
  for (const k of registry.keys) {
    const status = k.disabled ? 'disabled' : 'active  ';
    console.log(`  ${k.id.padEnd(13)} ${status}  ${(k.created || '').padEnd(10)}  ${(k.prefix || '').padEnd(17)}  ${k.name || ''}`);
  }
  console.log('');
}

function setDisabled(id, disabled) {
  const registry = load();
  const entry = registry.keys.find((k) => k.id === id);
  if (!entry) { console.error(`No key with id "${id}".`); process.exit(1); }
  entry.disabled = disabled;
  save(registry);
  console.log(`${disabled ? 'Revoked' : 'Enabled'} ${id} (${entry.name}).`);
}

function cmdVerify() {
  const key = positional[0];
  if (!key) { console.error('Usage: node scripts/apikeys.mjs verify <key>'); process.exit(1); }
  const registry = load();
  const entry = registry.keys.find((k) => k.hash === sha256(key));
  if (!entry) { console.log('No match.'); process.exit(1); }
  console.log(`Matches ${entry.id} (${entry.name}) — ${entry.disabled ? 'DISABLED' : 'active'}.`);
}

switch (cmd) {
  case 'new': cmdNew(); break;
  case 'list': cmdList(); break;
  case 'revoke': setDisabled(positional[0], true); break;
  case 'enable': setDisabled(positional[0], false); break;
  case 'verify': cmdVerify(); break;
  default:
    console.log('Usage: node scripts/apikeys.mjs <new|list|revoke|enable|verify> [...]');
    console.log('  new --name "<who>"   create a key (printed once)');
    console.log('  list                 list keys (never shows the key)');
    console.log('  revoke <id>          disable a key');
    console.log('  enable <id>          re-enable a key');
    console.log('  verify <key>         check a raw key against the registry');
}
