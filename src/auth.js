/*
 * src/auth.js — API-key authentication for the msn.tools APIs.
 *
 * Keys are never stored in the repo. api-keys.json holds only the SHA-256 hash
 * of each key plus metadata; we hash the presented key and look for a match.
 * Identical across the four APIs — keep changes in sync.
 */

export async function sha256hex(input) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Pull the API key from `Authorization: Bearer <key>` or the `x-api-key` header. */
export function extractKey(request) {
  const auth = request.headers.get('authorization');
  if (auth && /^bearer\s+/i.test(auth)) return auth.replace(/^bearer\s+/i, '').trim();
  const x = request.headers.get('x-api-key');
  if (x) return x.trim();
  return null;
}

/**
 * authenticate(request, registry) -> { ok, entry } | { ok:false, status, code, message }
 * registry is the parsed api-keys.json ({ version, keys: [...] }).
 */
export async function authenticate(request, registry) {
  const raw = extractKey(request);
  if (!raw) {
    return {
      ok: false,
      status: 401,
      code: 'missing_api_key',
      message: 'Provide an API key via "Authorization: Bearer <key>" or the "x-api-key" header.',
    };
  }
  const hash = await sha256hex(raw);
  const entry = (registry.keys || []).find((k) => k.hash === hash);
  if (!entry) {
    return { ok: false, status: 401, code: 'invalid_api_key', message: 'The provided API key is not valid.' };
  }
  if (entry.disabled) {
    return { ok: false, status: 403, code: 'disabled_api_key', message: 'This API key has been disabled.' };
  }
  return { ok: true, entry };
}
