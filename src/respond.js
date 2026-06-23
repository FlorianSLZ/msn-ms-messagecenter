/*
 * src/respond.js — shared HTTP/JSON helpers for the ErrorHunter API Worker.
 * Identical across the four msn.tools APIs (MSFinder, ErrorHunter, MS-Changelog,
 * MessageCenter); keep changes in sync.
 */

const BASE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'cache-control': 'no-store',
  'ratelimit-limit': '20',
  'ratelimit-policy': '20;w=60',
};

export function json(body, init = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    status: init.status || 200,
    headers: { ...BASE_HEADERS, ...(init.headers || {}) },
  });
}

export function apiError(status, code, message, extraHeaders) {
  return json({ error: { code, message } }, { status, headers: extraHeaders });
}

export function preflight() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'authorization, x-api-key, content-type',
      'access-control-max-age': '86400',
    },
  });
}

function clamp(n, lo, hi) {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

/** Slice `items` by ?limit (default 50, max 200) and ?offset, returning a page + meta. */
export function paginate(items, url) {
  const limit = clamp(parseInt(url.searchParams.get('limit') || '50', 10), 1, 200);
  const offset = clamp(parseInt(url.searchParams.get('offset') || '0', 10), 0, Number.MAX_SAFE_INTEGER);
  const total = items.length;
  const page = items.slice(offset, offset + limit);
  const nextOffset = offset + limit;
  return {
    page,
    meta: {
      total,
      count: page.length,
      limit,
      offset,
      next: nextOffset < total ? nextOffset : null,
    },
  };
}

/** Case-insensitive substring match of `q` across the named record fields (arrays are searched too). */
export function matchText(rec, q, fields) {
  if (!q) return true;
  const needle = String(q).toLowerCase();
  return fields.some((f) => {
    const v = rec[f];
    if (v == null) return false;
    if (Array.isArray(v)) return v.some((x) => String(x).toLowerCase().includes(needle));
    return String(v).toLowerCase().includes(needle);
  });
}
