<div align="center">

<a href="https://msnugget.com/"><img src="https://img.shields.io/badge/Part%20of-msnugget-39A751?style=for-the-badge&labelColor=1F8F3D" alt="Part of the msnugget family" /></a>

# M365 Change Digest

**Every Microsoft 365 change, in one place.**

[![Live](https://img.shields.io/badge/Live-mcd.msnugget.com-39A751?style=for-the-badge&logo=googlechrome&logoColor=white)](https://mcd.msnugget.com)
[![PWA](https://img.shields.io/badge/PWA-offline%20ready-267038?style=for-the-badge)](#tech)
[![License: MIT](https://img.shields.io/badge/License-MIT-1F8F3D?style=for-the-badge)](#license)

Built by [Florian Salzmann](https://scloud.work/about-florian/) &amp; [Jannik Reinhard](https://jannikreinhard.com/about/)

</div>

---

A free, 100% client-side dashboard that tracks every Microsoft 365 change and lays it out clearly — filter by **product**, **status**, **release phase**, **cloud** and **platform**, search instantly, and follow a **release timeline per product**.

Built from Microsoft's **public Microsoft 365 roadmap** (~1,800+ changes across 37 products) and — optionally — your own tenant's **Message Center** via Microsoft Graph. The index is refreshed **daily** by a GitHub Action and deployed on **Cloudflare Pages**.

> **Independent project — not affiliated with Microsoft.** Roadmap and Message Center data is © Microsoft Corporation. Microsoft, Microsoft 365, Azure, Entra and Intune are trademarks of Microsoft Corporation.

---

## What it is

Microsoft ships a relentless stream of M365 changes, scattered across the roadmap and the Message Center. MCD collapses that into one fast, readable dashboard:

- **Timeline per product** — a release schedule for each product, laid out across calendar quarters and colour-coded by status.
- **Faceted filters** — combine product, status (In development / Rolling out / Launched), release phase, platform and cloud. Counts update live; every view is shareable by URL.
- **Instant search** — type any feature, product or keyword and MCD ranks matching changes across the whole index (typo- and acronym-tolerant).
- **Status at a glance** — availability and preview dates surface right on each card; click for the full description and a link to the source.
- **100% client-side PWA** — the whole index ships with the page, nothing is sent anywhere, installable and works offline.

---

## Data sources

MCD combines two sources into one index (`window.MCD.DATA`):

| Source | Auth | Default | Notes |
|---|---|---|---|
| **Public Microsoft 365 roadmap** | none | **on** | `https://www.microsoft.com/releasecommunications/api/v1/m365` — the feed behind the [public roadmap](https://www.microsoft.com/microsoft-365/roadmap). |
| **Tenant Message Center** | Microsoft Graph (app-only) | off | Your org's Message Center posts via `/admin/serviceAnnouncement/messages` (`ServiceMessage.Read.All`). |

> ⚠️ **Privacy note:** the Message Center feed is **off by default**. If you enable it, your tenant's Message Center posts are baked into `data/changes.js` and **published on your site**. Only enable it on a deployment you're comfortable making public (or keep the repo/site private).

---

## How it works

The running app is a static site — plain HTML, CSS and ES5-style vanilla JavaScript on the `window.MCD` namespace, with **no build step and zero runtime dependencies**.

1. **`data/changes.js`** defines `window.MCD.DATA` (the change index), `window.MCD.PRODUCTS` (per-product display metadata: `label`, `color`, monogram `tag`, `count`) and `window.MCD.META` (counts + build date).
2. **`js/search.js`** builds a lightweight in-memory index and answers ranked text queries (`window.MCD.search.query`).
3. **`js/app.js`** powers the dashboard (faceted sidebar, list + timeline views, detail drawer); **`js/landing.js`** powers the marketing page's live demo. Both share `js/util.js` and `js/icons.js`.
4. **`sw.js`** precaches the app shell for offline use (and serves the daily-updated `data/changes.js` network-first so returning visitors stay current).

---

## Data pipeline

The index is **generated**, not hand-edited:

```
                       (scripts)                         (output)
data/raw/roadmap.json  ── fetch-roadmap.mjs ─┐
data/raw/mc/*.json     ── fetch-mc.mjs (opt) ─┤── build-data.mjs ──▶ data/changes.js
                                              │                       window.MCD.DATA / PRODUCTS / META
```

Regenerate locally:

```bash
node scripts/fetch-roadmap.mjs   # pull the public roadmap -> data/raw/roadmap.json
node scripts/build-data.mjs      # normalize + merge -> data/changes.js
```

The build is deterministic (no network, no randomness apart from the build date), so the same inputs always produce the same `data/changes.js`.

---

## Run locally

Pure static files — any static server works:

```bash
python3 -m http.server 8080        # then open http://localhost:8080
# or:  npx serve .
```

No `npm install`, no bundler. (A service worker / PWA install needs a **secure context** — `https://` or `http://localhost`.)

---

## Deploy

The recommended setup is **commit → Cloudflare Pages auto-build** (no Cloudflare secrets in GitHub):

1. **Cloudflare Pages** → *Create a project* → *Connect to Git* → pick this repo.
   - Framework preset: **None**. Build command: *(empty)*. Build output directory: **`/`** (the repo root is the site).
2. **GitHub Action** (`.github/workflows/update-data.yml`) runs daily, fetches the roadmap, rebuilds `data/changes.js`, and commits it. Each push triggers a Cloudflare Pages deploy automatically.

Any other static host works too (GitHub Pages, Netlify, S3 + CloudFront) — there is no server-side logic.

### Optional: enable the tenant Message Center feed

1. Register an Entra app with the **application** Graph permission `ServiceMessage.Read.All` (grant admin consent).
2. Add repository **secrets**: `MC_TENANT_ID`, `MC_CLIENT_ID`, `MC_CLIENT_SECRET`.
3. That's it — the daily workflow's "Fetch tenant Message Center" step is a no-op without the secrets and starts merging Message Center posts once they're set. (See the privacy note above.)

---

## Project structure

```
MCD/
├── index.html              # Landing page (SEO, JSON-LD, OG, live demo)
├── app.html                # Dashboard shell (search, filters, list + timeline, drawer)
├── manifest.webmanifest    # PWA manifest
├── sw.js                   # Service worker — offline shell, network-first data
├── favicon.svg / icon.svg  # Brand mark (green tile + ascending bars + pulse dot)
├── og-image.png            # 1200×630 social card (rendered from og-image.svg)
├── og-image.svg            # Social card source
├── _headers / _redirects   # Cloudflare Pages cache headers + clean-URL aliases
├── robots.txt / sitemap.xml / llms.txt
├── css/
│   ├── landing.css         # Landing design tokens, brand, sections
│   └── app.css             # App chrome, sidebar, cards, timeline, drawer
├── assets/fonts/manrope.woff2
├── data/
│   ├── changes.js          # Generated index: window.MCD.DATA / PRODUCTS / META
│   └── raw/
│       ├── roadmap.json    # Fetched public roadmap (committed)
│       └── mc/             # Optional tenant Message Center pulls (git-ignored)
├── scripts/
│   ├── fetch-roadmap.mjs   # Pull the public M365 roadmap
│   ├── fetch-mc.mjs        # OPTIONAL: pull tenant Message Center via Graph
│   └── build-data.mjs      # Deterministic index builder
├── .github/workflows/
│   └── update-data.yml     # Daily fetch + build + commit
└── js/
    ├── util.js             # window.MCD helpers (escape, debounce, dates)
    ├── icons.js            # SVG set, status metadata, product tiles
    ├── search.js           # window.MCD.search — ranking engine
    ├── app.js              # Dashboard UI
    └── landing.js          # Theme/nav + hero live demo
```

Scripts load as classic `<script src>` tags in dependency order — no ES modules, no bundler for the running app.

---

## Tech

- **Vanilla HTML / CSS / JavaScript** — ES5-style IIFE modules on `window.MCD`, `'use strict'`. Every value reaching the DOM is escaped via `MCD.util`.
- **No framework, no build step** for the running app; the only Node usage is the offline data builder.
- **PWA** — installable, offline-capable, self-hosted Manrope font, no CDN or external requests.
- **Themes** — dark (default) and light, toggled via `<html data-theme>` and persisted in `localStorage`.

---

## 🧩 Part of the msnugget family

Free, independent, privacy-first tools for Microsoft admins — explore them all at **[msnugget.com](https://msnugget.com/)**.

| Tool | What it does |
|---|---|
| [**CMTrace.dev**](https://cmtrace.dev) | Web-based CMTrace / ConfigMgr log viewer |
| [**MSFinder**](https://msfinder.dev) | Find any Microsoft admin portal setting in one search |
| [**MSChanges**](https://mschanges.dev) | Track every change to Microsoft's documentation |
| ⭐ [**M365 Change Digest**](https://mcd.msnugget.com) | Every Microsoft 365 roadmap & Message Center change in one place · **you are here** |
| [**Error Hunter**](https://errorhunter.app) | Resolve any Intune / Windows error code |

---

## Credits

- Data: the **[Microsoft 365 public roadmap](https://www.microsoft.com/microsoft-365/roadmap)** (release-communications feed) and, optionally, the **Microsoft Graph** service-announcement API.
- Product logos from the MIT-licensed **[dashboard-icons](https://github.com/homarr-labs/dashboard-icons)** set, supplemented by **[svgl](https://github.com/pheralb/svgl)** and **[Wikimedia Commons](https://commons.wikimedia.org/)** for products it doesn't cover; the few products without an available logo use a coloured monogram. All product names and logos are trademarks of their respective owners.
- Part of the **[msnugget](https://msnugget.com/)** brand family.
- Built by **[Florian Salzmann](https://scloud.work/about-florian/)** & **[Jannik Reinhard](https://jannikreinhard.com/about/)**.
- Source: **[github.com/FlorianSLZ/MCD](https://github.com/FlorianSLZ/MCD)**.

---

## License

MIT.

---

## Disclaimer

MCD is an **independent project** and is **not affiliated with, endorsed by, or sponsored by Microsoft Corporation**. All product names and the underlying roadmap/Message Center data are property of their respective owners. MCD does not distribute any Microsoft binaries or proprietary code; it only organizes and links to publicly available information (and, where you explicitly configure it, your own tenant's data).
