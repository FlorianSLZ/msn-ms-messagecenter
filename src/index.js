/*
 * src/index.js — MessageCenter (M365 Change Digest) API Worker.
 *
 * Serves the existing static site for every non-/api path (via the ASSETS
 * binding) and a small read-only JSON API under /api/v1 over the change digest
 * (MCD.DATA). Every API request needs a valid API key (api-keys.json /
 * scripts/apikeys.mjs) and is limited to 20 requests per minute per key.
 */

import KEYS from '../api-keys.json';
import { authenticate } from './auth.js';
import { json, apiError, preflight, paginate, matchText } from './respond.js';
import { checkRateLimit } from './ratelimiter.js';

export { RateLimiter } from './ratelimiter.js';

let DATA = null; // { generated, messages: [...], products: {...}, meta: {...} }

async function ensureData(env, origin) {
  if (DATA) return;
  const res = await env.ASSETS.fetch(new URL('/data/api/messages.json', origin));
  if (!res.ok) throw new Error('dataset not found (run scripts/build-api-data.mjs)');
  DATA = await res.json();
}

const SEARCH_FIELDS = ['title', 'desc', 'products', 'platforms', 'source'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    if (request.method === 'OPTIONS') return preflight();
    if (request.method !== 'GET') return apiError(405, 'method_not_allowed', 'Only GET requests are supported.');

    const auth = await authenticate(request, KEYS);
    if (!auth.ok) return apiError(auth.status, auth.code, auth.message);

    const rl = await checkRateLimit(env, auth.entry.id);
    if (!rl.allowed) return apiError(429, 'rate_limited', 'Rate limit of 20 requests per minute exceeded.', { 'retry-after': String(rl.retryAfter || 60), 'ratelimit-remaining': '0' });

    try {
      await ensureData(env, url.origin);
    } catch (err) {
      return apiError(503, 'data_unavailable', String(err.message || err));
    }

    const path = url.pathname.replace(/\/+$/, '');
    const sp = url.searchParams;

    if (path === '/api/v1/health') {
      return json({ status: 'ok', messages: DATA.messages.length, products: Object.keys(DATA.products || {}).length });
    }

    if (path === '/api/v1/products') {
      return json({ data: DATA.products || {}, meta: DATA.meta || {} });
    }

    // List / filter change-digest entries (newest first).
    if (path === '/api/v1/messages') {
      let items = DATA.messages;
      const product = sp.get('product');
      const status = sp.get('status');
      const platform = sp.get('platform');
      const cloud = sp.get('cloud');
      const since = sp.get('since'); // ISO date on `modified`, inclusive
      const q = sp.get('q');
      const has = (arr, v) => Array.isArray(arr) && arr.some((x) => String(x).toLowerCase() === v.toLowerCase());
      if (product) items = items.filter((m) => has(m.products, product));
      if (status) items = items.filter((m) => (m.status || '').toLowerCase() === status.toLowerCase());
      if (platform) items = items.filter((m) => has(m.platforms, platform));
      if (cloud) items = items.filter((m) => has(m.clouds, cloud));
      if (since) items = items.filter((m) => (m.modified || m.created || '') >= since);
      if (q) items = items.filter((m) => matchText(m, q, SEARCH_FIELDS));
      const { page, meta } = paginate(items, url);
      return json({ meta, data: page });
    }

    // Single entry by id.
    const mId = path.match(/^\/api\/v1\/messages\/(.+)$/);
    if (mId) {
      const id = decodeURIComponent(mId[1]);
      const hit = DATA.messages.find((m) => String(m.id) === id);
      if (!hit) return apiError(404, 'not_found', `No entry with id "${id}".`);
      return json({ data: hit });
    }

    return apiError(404, 'not_found', 'Unknown endpoint. See /API.md for the available routes.');
  },
};
