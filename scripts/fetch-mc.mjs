#!/usr/bin/env node
/*
 * fetch-mc.mjs — OPTIONAL: pull a tenant's Microsoft 365 Message Center posts
 * into data/raw/mc/messages.json so the build can merge them with the public
 * roadmap ("both" data sources).
 *
 * This is the only part of MCD that touches tenant-specific, authenticated
 * data. It is NOT required for the public site — the roadmap pipeline works on
 * its own. Enable it only if you want your own Message Center announcements
 * folded into the digest.
 *
 * Auth: app-only (client credentials). Register an Entra app with the Graph
 * APPLICATION permission `ServiceMessage.Read.All` (admin-consented), then set:
 *   MC_TENANT_ID, MC_CLIENT_ID, MC_CLIENT_SECRET   (env vars / GitHub secrets)
 *
 * Endpoint: GET /admin/serviceAnnouncement/messages   (Microsoft Graph v1.0)
 *
 * Usage:  MC_TENANT_ID=… MC_CLIENT_ID=… MC_CLIENT_SECRET=… node scripts/fetch-mc.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'data', 'raw', 'mc', 'messages.json');

const TENANT = process.env.MC_TENANT_ID;
const CLIENT = process.env.MC_CLIENT_ID;
const SECRET = process.env.MC_CLIENT_SECRET;

if (!TENANT || !CLIENT || !SECRET) {
  // Not an error: the optional feed is simply disabled when secrets are absent.
  console.log('[fetch-mc] MC_TENANT_ID / MC_CLIENT_ID / MC_CLIENT_SECRET not set — skipping tenant Message Center feed.');
  process.exit(0);
}

async function token() {
  const body = new URLSearchParams({
    client_id: CLIENT,
    client_secret: SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const res = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`token request failed: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function fetchAll(accessToken) {
  let url = 'https://graph.microsoft.com/v1.0/admin/serviceAnnouncement/messages?$top=100';
  const out = [];
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`messages request failed: HTTP ${res.status} ${await res.text()}`);
    const page = await res.json();
    if (Array.isArray(page.value)) out.push(...page.value);
    url = page['@odata.nextLink'] || null;
  }
  return out;
}

const accessToken = await token();
const messages = await fetchAll(accessToken);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(messages, null, 0) + '\n');
console.log(`[fetch-mc] wrote ${messages.length} Message Center posts -> ${OUT}`);
