/*
 * src/ratelimiter.js — Durable Object that enforces an exact, strongly-consistent
 * rate limit per key.
 *
 * Cloudflare's native ratelimits binding turned out to be per-isolate in
 * production (the counter is not shared across separate requests), so it cannot
 * enforce a hard "N requests per window" across real traffic. A Durable Object is
 * single-instance per key and strongly consistent, which gives an exact limit.
 *
 * One DO instance per API-key id (env.RL_DO.idFromName(keyId)). Fixed 60s window.
 */

const LIMIT = 20;
const WINDOW_MS = 60_000;

export class RateLimiter {
  constructor(state) {
    this.state = state;
  }

  async fetch() {
    const now = Date.now();
    let w = await this.state.storage.get('w');
    if (!w || now - w.start >= WINDOW_MS) {
      w = { start: now, count: 0 };
    }
    w.count += 1;
    await this.state.storage.put('w', w);

    const allowed = w.count <= LIMIT;
    const resetMs = w.start + WINDOW_MS - now;
    return Response.json({
      allowed,
      limit: LIMIT,
      remaining: Math.max(0, LIMIT - w.count),
      retryAfter: allowed ? 0 : Math.max(1, Math.ceil(resetMs / 1000)),
    });
  }
}

/** Helper used by the Worker: returns { allowed, retryAfter, remaining }. */
export async function checkRateLimit(env, keyId) {
  const id = env.RL_DO.idFromName(keyId);
  const stub = env.RL_DO.get(id);
  const res = await stub.fetch('https://ratelimiter/check');
  return res.json();
}
