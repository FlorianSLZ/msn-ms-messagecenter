#!/usr/bin/env node
/*
 * build-data.mjs — assemble MCD's change index from the raw source pulls.
 *
 * Inputs  (source of truth):
 *   data/raw/roadmap.json   — public Microsoft 365 roadmap (scripts/fetch-roadmap.mjs)
 *   data/raw/mc/*.json      — OPTIONAL tenant Message Center pulls (scripts/fetch-mc.mjs)
 *
 * Output (loaded by the app):
 *   data/changes.js
 *     window.MCD.DATA      — array of normalized change entries the app indexes
 *     window.MCD.PRODUCTS  — per-product display metadata (label, color, tag, count)
 *     window.MCD.META      — counts + build info (generated, sources, byStatus, …)
 *
 * Deterministic apart from the single `generated` timestamp. Re-run after a
 * fetch:  node scripts/build-data.mjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ROADMAP = join(ROOT, 'data', 'raw', 'roadmap.json');
const MC_DIR = join(ROOT, 'data', 'raw', 'mc');
const OUT = join(ROOT, 'data', 'changes.js');

// ---------------------------------------------------------------------------
// Per-product display metadata. Brand-ish colour aids visual scanning; the
// global brand accent stays msnugget green. Keys are canonical (lower-cased).
// `tag` is the short monogram shown on the product tile. Unknown products get
// a deterministic colour + monogram from a hash so the UI never breaks.
// ---------------------------------------------------------------------------
const PRODUCT_META = [
  // [canonical display name, color, monogram]
  ['Microsoft Copilot (Microsoft 365)', '#0a7dff', 'Cp'],
  ['Microsoft Teams',                   '#5b5fc7', 'Tm'],
  ['Microsoft Purview',                 '#8b5cf6', 'Pv'],
  ['Outlook',                           '#0a6cff', 'Ol'],
  ['Microsoft Viva',                    '#d6336c', 'Vi'],
  ['SharePoint',                        '#0a7d77', 'SP'],
  ['PowerPoint',                        '#d24726', 'PP'],
  ['Word',                              '#2b579a', 'Wd'],
  ['Microsoft 365',                     '#ea580c', '365'],
  ['Microsoft Edge',                    '#2563eb', 'Ed'],
  ['Microsoft 365 app',                 '#e8590c', 'Ap'],
  ['OneDrive',                          '#0a84ff', 'OD'],
  ['Microsoft 365 admin center',        '#1f6feb', 'AC'],
  ['Excel',                             '#217346', 'Xl'],
  ['Microsoft Intune',                  '#2aa6e6', 'In'],
  ['Microsoft Defender for Office 365', '#11a37f', 'Df'],
  ['OneNote',                           '#7719aa', 'ON'],
  ['Planner',                           '#1a9e76', 'Pl'],
  ['Microsoft Clipchamp',               '#7b5cff', 'Cc'],
  ['Microsoft Entra',                   '#5b73f0', 'En'],
  ['Exchange',                          '#0f6cbd', 'Ex'],
  ['Windows 365',                       '#0a84ff', 'W365'],
  ['Universal Print',                   '#6066d0', 'UP'],
  ['Access',                            '#a4373a', 'Ac'],
  ['Forms',                             '#1a8a6b', 'Fo'],
  ['Microsoft Copilot Studio',          '#2563eb', 'CS'],
  ['Microsoft Information Protection',  '#8b5cf6', 'IP'],
  ['Whiteboard',                        '#159e8c', 'Wb'],
  ['Power Automate',                    '#0066ff', 'PA'],
  ['Microsoft Agent 365',               '#1f6feb', 'Ag'],
  ['Minecraft Education',               '#5fa854', 'Mc'],
  ['Microsoft To Do',                   '#2564cf', 'Td'],
  ['Microsoft Stream',                  '#bc1948', 'St'],
  ['SharePoint Syntex',                 '#0a7d77', 'Sx'],
  ['Windows',                           '#0078d4', 'Wn'],
  ['Office 365',                        '#ea580c', 'O365'],
  ['Microsoft Project',                 '#31752f', 'Pj'],
];
const META_BY_KEY = new Map();
for (const [name, color, tag] of PRODUCT_META) META_BY_KEY.set(name.toLowerCase(), { label: name, color, tag });

// Deterministic fallback palette for unmapped products.
const FALLBACK_COLORS = [
  '#5b73f0', '#2aa6e6', '#0a7d77', '#8b5cf6', '#d6336c', '#ea580c',
  '#11a37f', '#2563eb', '#c026d3', '#0a84ff', '#f59e0b', '#14b8a6',
];

const KNOWN_STATUS = new Set(['In development', 'Rolling out', 'Launched', 'Cancelled']);

// ---- helpers --------------------------------------------------------------
const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const tagNames = (arr) => (Array.isArray(arr) ? arr.map((t) => clean(t && t.tagName)).filter(Boolean) : []);
const uniq = (arr) => {
  const seen = new Set(); const out = [];
  for (const v of arr) { const k = v.toLowerCase(); if (v && !seen.has(k)) { seen.add(k); out.push(v); } }
  return out;
};
function hashInt(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}
function monogram(name) {
  const words = name.replace(/[()]/g, '').split(/\s+/).filter((w) => !/^microsoft$/i.test(w));
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || '??';
}
function productMeta(canonKey, display) {
  if (META_BY_KEY.has(canonKey)) return META_BY_KEY.get(canonKey);
  return { label: display, color: FALLBACK_COLORS[hashInt(canonKey) % FALLBACK_COLORS.length], tag: monogram(display) };
}

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
/**
 * Parse a roadmap availability string into a sortable YYYYMM integer.
 * Handles "August CY2026", "Q3 CY2026", and bare "CY2026". 0 when unknown.
 */
function gaSortKey(s) {
  if (!s) return 0;
  const str = String(s);
  const ym = str.match(/CY\s*(\d{4})/i);
  if (!ym) return 0;
  const year = parseInt(ym[1], 10);
  const mName = str.toLowerCase().match(/[a-z]+/g) || [];
  for (const w of mName) if (MONTHS[w]) return year * 100 + MONTHS[w];
  const q = str.match(/Q([1-4])/i);
  if (q) return year * 100 + (parseInt(q[1], 10) - 1) * 3 + 1;
  return year * 100; // year only
}

const dateOnly = (s) => { const m = String(s || '').match(/^\d{4}-\d{2}-\d{2}/); return m ? m[0] : ''; };
const normCloud = (c) => c.replace(/\s*\(.*\)\s*/, '').trim() || c; // "Worldwide (Standard Multi-Tenant)" -> "Worldwide"

// ---- normalize one roadmap item -------------------------------------------
function fromRoadmap(it) {
  const title = clean(it.title);
  const id = String(it.id == null ? '' : it.id);
  if (!title || !id) return null;
  const tc = it.tagsContainer || {};
  const products = uniq(tagNames(tc.products));
  const status = KNOWN_STATUS.has(clean(it.status)) ? clean(it.status) : (clean(it.status) || 'In development');
  const ga = clean(it.publicDisclosureAvailabilityDate);
  return {
    id: 'rm-' + id,
    rid: id,
    title,
    desc: clean(it.description),
    products: products.length ? products : ['Microsoft 365'],
    status,
    phases: uniq(tagNames(tc.releasePhase)),
    platforms: uniq(tagNames(tc.platforms)),
    clouds: uniq(tagNames(tc.cloudInstances).map(normCloud)),
    ga,
    gaSort: gaSortKey(ga),
    preview: clean(it.publicPreviewDate),
    created: dateOnly(it.created),
    modified: dateOnly(it.modified) || dateOnly(it.created),
    link: 'https://www.microsoft.com/microsoft-365/roadmap?searchterms=' + encodeURIComponent(id),
    more: clean(it.moreInfoLink),
    source: 'roadmap',
  };
}

// ---- normalize one Message Center message (Graph serviceAnnouncement) ------
// Tolerant to both raw Graph shape and a pre-normalized shape from fetch-mc.mjs.
function fromMessageCenter(m) {
  const id = String(m.id || m.Id || '');
  const title = clean(m.title || m.Title);
  if (!id || !title) return null;
  const services = Array.isArray(m.services) ? m.services
    : Array.isArray(m.Services) ? m.Services : [];
  // body.content can be HTML; strip tags for the description text.
  const bodyRaw = (m.body && (m.body.content || m.body.Content)) || m.bodyPreview || m.desc || '';
  const desc = clean(String(bodyRaw).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' '));
  const cat = clean(m.category || m.Category); // planForChange | preventOrFixIssue | stayInformed
  const catKey = cat.toLowerCase();
  const statusMap = { planforchange: 'In development', stayinformed: 'Launched', preventorfixissue: 'Rolling out' };
  const phaseMap = { planforchange: 'Plan for change', preventorfixissue: 'Prevent or fix issue', stayinformed: 'Stay informed' };
  const status = statusMap[catKey] || 'Launched';
  return {
    id: 'mc-' + id,
    rid: id,
    title,
    desc,
    products: uniq(services.map(clean).filter(Boolean)).length ? uniq(services.map(clean).filter(Boolean)) : ['Microsoft 365'],
    status,
    phases: catKey && phaseMap[catKey] ? [phaseMap[catKey]] : (cat ? ['Stay informed'] : []),
    platforms: [],
    clouds: [],
    ga: '',
    gaSort: 0,
    preview: '',
    created: dateOnly(m.startDateTime || m.lastModifiedDateTime || m.created),
    modified: dateOnly(m.lastModifiedDateTime || m.startDateTime || m.modified),
    link: id.toUpperCase().startsWith('MC')
      ? 'https://admin.microsoft.com/Adminportal/Home#/MessageCenter/:/messages/' + encodeURIComponent(id)
      : clean(m.link),
    more: '',
    source: 'mc',
  };
}

// ---- load -----------------------------------------------------------------
if (!existsSync(ROADMAP)) {
  console.error(`[build-data] missing ${ROADMAP} — run: node scripts/fetch-roadmap.mjs`);
  process.exit(1);
}
const roadmapRaw = JSON.parse(readFileSync(ROADMAP, 'utf8'));
let entries = [];
for (const it of roadmapRaw) { const n = fromRoadmap(it); if (n) entries.push(n); }
const roadmapCount = entries.length;

let mcCount = 0;
if (existsSync(MC_DIR)) {
  const mcFiles = readdirSync(MC_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
  for (const f of mcFiles) {
    let arr;
    try { arr = JSON.parse(readFileSync(join(MC_DIR, f), 'utf8')); } catch { continue; }
    // accept either a bare array or a Graph { value: [...] } envelope
    const list = Array.isArray(arr) ? arr : Array.isArray(arr && arr.value) ? arr.value : [];
    for (const m of list) { const n = fromMessageCenter(m); if (n) { entries.push(n); mcCount++; } }
  }
}

// ---- dedupe by id (keep most recently modified) ---------------------------
const byId = new Map();
for (const e of entries) {
  const cur = byId.get(e.id);
  if (!cur || e.modified > cur.modified) byId.set(e.id, e);
}
entries = [...byId.values()];

// ---- product registry + counts -------------------------------------------
const prodCount = new Map();       // canonKey -> count
const prodDisplay = new Map();     // canonKey -> chosen display
for (const e of entries) {
  // canonicalise product display variants (case-insensitive) to one label
  e.products = uniq(e.products.map((p) => {
    const key = p.toLowerCase();
    const meta = productMeta(key, p);
    if (!prodDisplay.has(key)) prodDisplay.set(key, meta.label);
    return prodDisplay.get(key);
  }));
  for (const p of e.products) {
    const key = p.toLowerCase();
    prodCount.set(key, (prodCount.get(key) || 0) + 1);
  }
}
const PRODUCTS = {};
for (const [key, count] of prodCount) {
  const display = prodDisplay.get(key);
  const meta = productMeta(key, display);
  PRODUCTS[display] = { label: meta.label, color: meta.color, tag: meta.tag, count };
}

// ---- sort: most recently modified first (the app re-sorts on demand) ------
entries.sort((a, b) => (b.modified || '').localeCompare(a.modified || '') || b.gaSort - a.gaSort || a.title.localeCompare(b.title));

// ---- counts ---------------------------------------------------------------
const byStatus = {}; const byProduct = {}; const bySource = {};
for (const e of entries) {
  byStatus[e.status] = (byStatus[e.status] || 0) + 1;
  bySource[e.source] = (bySource[e.source] || 0) + 1;
  for (const p of e.products) byProduct[p] = (byProduct[p] || 0) + 1;
}

// ---- slim entries (drop empty optional fields to shrink the file) ---------
const slimmed = entries.map((e) => {
  const o = {
    id: e.id, title: e.title, desc: e.desc, products: e.products, status: e.status,
    created: e.created, modified: e.modified, link: e.link, source: e.source,
  };
  if (e.phases.length) o.phases = e.phases;
  if (e.platforms.length) o.platforms = e.platforms;
  if (e.clouds.length) o.clouds = e.clouds;
  if (e.ga) { o.ga = e.ga; o.gaSort = e.gaSort; }
  if (e.preview) o.preview = e.preview;
  if (e.more) o.more = e.more;
  return o;
});

// ---- emit -----------------------------------------------------------------
const generated = new Date().toISOString().slice(0, 10);
const meta = {
  count: entries.length,
  products: Object.keys(PRODUCTS).length,
  generated,
  sources: { roadmap: roadmapCount, mc: mcCount },
  byStatus,
  byProduct,
  bySource,
};

const header = `/*
 * data/changes.js — MCD (M365 Change Digest) index (GENERATED, do not edit by hand)
 *
 * Regenerate with:  node scripts/build-data.mjs
 * Source of truth:  data/raw/roadmap.json (+ optional data/raw/mc/*.json)
 *
 * Entry shape:
 *   { id, title, desc, products[], status, created, modified, link, source,
 *     phases?, platforms?, clouds?, ga?, gaSort?, preview?, more? }
 *   status ∈ "In development" | "Rolling out" | "Launched" | "Cancelled"
 *   source ∈ "roadmap" | "mc"
 *
 * Entries: ${entries.length}  ·  Products: ${Object.keys(PRODUCTS).length}  ·  Generated: ${generated}
 * Data © Microsoft. Independent project — not affiliated with Microsoft.
 */
`;
const body =
  'window.MCD = window.MCD || {};\n\n' +
  'window.MCD.PRODUCTS = ' + JSON.stringify(PRODUCTS, null, 2) + ';\n\n' +
  'window.MCD.META = ' + JSON.stringify(meta, null, 2) + ';\n\n' +
  'window.MCD.DATA = ' + JSON.stringify(slimmed) + ';\n';

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, header + body);

console.log('[build-data] roadmap entries:', roadmapCount, '| message-center entries:', mcCount);
console.log('[build-data] total after dedupe:', entries.length, '| products:', Object.keys(PRODUCTS).length);
console.log('[build-data] byStatus:', JSON.stringify(byStatus));
console.log('[build-data] wrote:', OUT, '(' + (Buffer.byteLength(header + body) / 1024).toFixed(1) + ' KB)');
