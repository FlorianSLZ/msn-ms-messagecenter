#!/usr/bin/env node
/*
 * fetch-roadmap.mjs — pull the public Microsoft 365 roadmap into data/raw/roadmap.json
 *
 * Source of truth:
 *   https://www.microsoft.com/releasecommunications/api/v1/m365
 *
 * This is Microsoft's PUBLIC release-communications feed — the same data behind
 * https://www.microsoft.com/microsoft-365/roadmap. It needs no authentication,
 * so it is safe to fetch from a public GitHub Action and commit the result.
 *
 * The build (scripts/build-data.mjs) consumes data/raw/roadmap.json together
 * with any optional tenant Message Center pulls in data/raw/mc/*.json.
 *
 * Usage:  node scripts/fetch-roadmap.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'data', 'raw', 'roadmap.json');

const API = 'https://www.microsoft.com/releasecommunications/api/v1/m365';

// Retry with backoff — the endpoint is occasionally flaky under CI load.
async function fetchJson(url, attempts = 4) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'MCD-roadmap-bot/1.0 (+https://github.com/FlorianSLZ/MCD)' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('expected a JSON array');
      return data;
    } catch (err) {
      lastErr = err;
      const wait = 1500 * (i + 1);
      console.warn(`[fetch-roadmap] attempt ${i + 1}/${attempts} failed: ${err.message}; retrying in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

const items = await fetchJson(API);
if (items.length < 100) {
  // Sanity guard: the live feed has ~1,800 entries. A tiny payload means the
  // upstream is degraded; fail loudly so CI does not commit a gutted dataset.
  throw new Error(`roadmap payload looks truncated: only ${items.length} items`);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(items, null, 0) + '\n');
console.log(`[fetch-roadmap] wrote ${items.length} items -> ${OUT}`);
