# MessageCenter API

A small, read-only HTTP API over the M365 Change Digest (Microsoft 365 roadmap +
optional Message Center) that powers
[MessageCenter](https://github.com/FlorianSLZ/msn-ms-messagecenter). Same data the
website uses — exposed as JSON for scripts and automation.

> The underlying dataset is already public (the site ships it as a static file).
> The API adds a clean, queryable, rate-limited interface on top — it is not a
> secrecy boundary. Note the same privacy caveat as the site: if you enable the
> tenant Message Center feed, those posts are baked into the data and exposed here.

## Base URL

```
https://<your-deployment>/api/v1
```

## Authentication

Every request needs an API key, sent **either** way:

```bash
curl -H "Authorization: Bearer mcd_live_xxxxxxxx" https://<host>/api/v1/health
curl -H "x-api-key: mcd_live_xxxxxxxx"             https://<host>/api/v1/health
```

Missing key → `401 missing_api_key`. Unknown key → `401 invalid_api_key`.
Disabled key → `403 disabled_api_key`.

### Getting a key

Keys are minted from the repo with a small CLI. Only a SHA-256 **hash** is stored in
`api-keys.json` — the raw key is printed once and cannot be recovered, so the registry
is safe to keep in a public repo.

```bash
npm run key:new -- --name "Florian CLI"   # prints the key once — copy it
npm run key:list                          # list keys (never shows the secret)
npm run key:revoke -- k_ab12cd34          # disable a key
```

## Rate limit

**20 requests per minute, per key** (Cloudflare's sliding-window limiter — approximate
by design). Over the limit → `429 rate_limited` with `Retry-After: 60`. Every response
carries `RateLimit-Limit: 20` and `RateLimit-Policy: 20;w=60`.

## Endpoints

### `GET /messages?product=&status=&platform=&cloud=&since=&q=&limit=&offset=`
List change-digest entries (newest first) with optional filters.
- `product` — e.g. `SharePoint`, `OneDrive`, `Microsoft Purview` (matches the entry's products[])
- `status` — roadmap status (e.g. `In development`, `Rolling out`, `Launched`)
- `platform` — e.g. `Web`, `Desktop`, `Mobile`, `Mac`
- `cloud` — e.g. `Worldwide (Standard Multi-Tenant)`, `GCC`
- `since` — ISO date, inclusive lower bound on the modified/created date
- `q` — substring across title/desc/products/platforms/source
- `limit` (default 50, max 200), `offset`

```bash
curl -H "x-api-key: $KEY" "https://<host>/api/v1/messages?product=SharePoint&status=Rolling%20out&limit=5"
```
```jsonc
{ "meta": { "total": 92, "count": 5, "limit": 5, "offset": 0, "next": 5 },
  "data": [ { "id": "...", "title": "...", "desc": "...", "products": ["SharePoint"],
              "status": "Rolling out", "created": "2026-05-01", "modified": "2026-06-10",
              "link": "https://...", "platforms": ["Web"] } ] }
```

### `GET /messages/<id>`
A single entry by id, or `404 not_found`.

### `GET /products`
The product catalog (labels, colors, tags, counts) plus dataset meta.

### `GET /health`
```jsonc
{ "status": "ok", "messages": 1800, "products": 37 }
```

## Errors

All errors share one shape:
```jsonc
{ "error": { "code": "rate_limited", "message": "Rate limit of 20 requests per minute exceeded." } }
```
| Status | code | meaning |
|-------|------|---------|
| 400 | `missing_parameter` | required query parameter missing |
| 401 | `missing_api_key` / `invalid_api_key` | no / unknown key |
| 403 | `disabled_api_key` | key revoked |
| 404 | `not_found` | unknown route or id |
| 405 | `method_not_allowed` | only `GET` is supported |
| 429 | `rate_limited` | over 20 req/min |
| 503 | `data_unavailable` | dataset not built (run `npm run build:api`) |

## CORS

`Access-Control-Allow-Origin: *` on all API responses; `OPTIONS` preflight supported.
