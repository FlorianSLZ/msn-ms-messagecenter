/* ============================================================================
 * MCD (M365 Change Digest) — js/app.js
 * The dashboard UI in app.html: command-bar search, faceted filter sidebar with
 * live counts, list view + per-product release timeline, a detail drawer, and
 * shareable URL state. Pure vanilla, ES5-style IIFE on window.MCD; all dynamic
 * text reaches the DOM only through MCD.util escaping/highlight helpers.
 * ==========================================================================*/
(function () {
  'use strict';

  var util = MCD.util, icons = MCD.icons, search = MCD.search;
  var DATA = MCD.DATA || [], PRODUCTS = MCD.PRODUCTS || {}, META = MCD.META || {};

  var $ = function (id) { return document.getElementById(id); };
  var byId = {};
  for (var i = 0; i < DATA.length; i++) byId[DATA[i].id] = DATA[i];

  // ---- DOM refs ----
  var elFacets = $('facets'), elList = $('list'), elTimeline = $('timeline'),
      elRegion = $('results-region'), elQ = $('q'), elClear = $('q-clear'),
      elSort = $('sort'), elChips = $('active-chips'), elReset = $('btn-reset'),
      elCount = $('status-count'), elMeta = $('status-meta'),
      elOverlay = $('overlay'), elDrawer = $('drawer'),
      elSidebar = $('sidebar'), elBackdrop = $('sidebar-backdrop');

  // ---- static icon injection ----
  document.querySelector('.cb-icon').innerHTML = icons.svg.search;
  elClear.querySelector('.icon').innerHTML = icons.svg.close;
  document.querySelector('.sidebar-head .icon').innerHTML = icons.svg.filter;

  // ---------------------------------------------------------------------------
  // Facet model
  // ---------------------------------------------------------------------------
  function distinct(field) {
    var seen = {}, out = [];
    for (var j = 0; j < DATA.length; j++) {
      var v = DATA[j][field];
      if (!v) continue;
      var arr = (typeof v === 'string') ? [v] : v;
      for (var k = 0; k < arr.length; k++) if (!seen[arr[k]]) { seen[arr[k]] = 1; out.push(arr[k]); }
    }
    return out;
  }

  // Status in lifecycle order; only those present.
  var statusOrder = icons.STATUS.map(function (s) { return s.name; });
  var statusValues = statusOrder.filter(function (n) { return (META.byStatus || {})[n]; });

  // Products by change count desc.
  var productValues = Object.keys(PRODUCTS).sort(function (a, b) {
    return (PRODUCTS[b].count || 0) - (PRODUCTS[a].count || 0) || a.localeCompare(b);
  });

  var sources = distinct('source');
  var GROUPS = [
    { key: 'status', label: 'Status', field: 'status', single: true, values: statusValues, open: true },
    { key: 'products', label: 'Product', field: 'products', values: productValues, open: true, searchable: true, tile: true },
    { key: 'phases', label: 'Release phase', field: 'phases', values: distinct('phases') },
    { key: 'platforms', label: 'Platform', field: 'platforms', values: distinct('platforms') },
    { key: 'clouds', label: 'Cloud', field: 'clouds', values: distinct('clouds') }
  ];
  if (sources.length > 1) {
    GROUPS.splice(1, 0, { key: 'source', label: 'Source', field: 'source', single: true,
      values: sources, labels: { roadmap: 'Public roadmap', mc: 'Message Center' }, open: true });
  }

  // ---------------------------------------------------------------------------
  // State (+ URL hash)
  // ---------------------------------------------------------------------------
  var VALID_SORTS = { relevance: 1, modified: 1, created: 1, ga: 1, az: 1 };
  var state = { q: '', view: 'list', sort: 'relevance', sel: {}, prodFilter: '', limit: 60 };
  GROUPS.forEach(function (g) { state.sel[g.key] = {}; });

  function anyFilter() {
    if (state.q) return true;
    for (var g in state.sel) for (var v in state.sel[g]) if (state.sel[g][v]) return true;
    return false;
  }

  function readHash() {
    var h = location.hash.replace(/^#/, '');
    if (!h) return;
    var parts = h.split('&');
    for (var p = 0; p < parts.length; p++) {
      var kv = parts[p].split('='); var key = decodeURIComponent(kv[0] || '');
      var val = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
      if (key === 'q') state.q = val;
      else if (key === 'view' && (val === 'list' || val === 'timeline')) state.view = val;
      else if (key === 'sort' && VALID_SORTS[val]) state.sort = val;
      else if (state.sel[key] !== undefined && val) {
        val.split(',').forEach(function (v) { if (v) state.sel[key][v] = true; });
      }
    }
  }

  function writeHash() {
    var parts = [];
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.view !== 'list') parts.push('view=' + state.view);
    if (state.sort !== 'relevance') parts.push('sort=' + state.sort);
    GROUPS.forEach(function (g) {
      var vals = Object.keys(state.sel[g.key]).filter(function (v) { return state.sel[g.key][v]; });
      if (vals.length) parts.push(g.key + '=' + vals.map(encodeURIComponent).join(','));
    });
    var url = parts.length ? '#' + parts.join('&') : location.pathname + location.search;
    try { history.replaceState(null, '', url); } catch (e) {}
  }

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------
  function entryHas(e, group, value) {
    var v = e[group.field];
    if (!v) return false;
    if (group.single) return v === value;
    for (var j = 0; j < v.length; j++) if (v[j] === value) return true;
    return false;
  }

  function passes(e, exceptKey) {
    for (var gi = 0; gi < GROUPS.length; gi++) {
      var g = GROUPS[gi];
      if (g.key === exceptKey) continue;
      var sel = state.sel[g.key];
      var active = Object.keys(sel).filter(function (v) { return sel[v]; });
      if (!active.length) continue;
      var ok = false;
      for (var a = 0; a < active.length; a++) if (entryHas(e, g, active[a])) { ok = true; break; }
      if (!ok) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Sorting
  // ---------------------------------------------------------------------------
  function sortResults(results) {
    var s = VALID_SORTS[state.sort] ? state.sort : 'modified';
    if (s === 'relevance' && !state.q) s = 'modified';
    var arr = results.slice();
    if (s === 'relevance') return arr; // already score-sorted by search.query
    arr.sort(function (ra, rb) {
      var a = ra.e, b = rb.e;
      if (s === 'modified') return (b.modified || '').localeCompare(a.modified || '');
      if (s === 'created') return (b.created || '').localeCompare(a.created || '');
      if (s === 'az') return a.title.localeCompare(b.title);
      if (s === 'ga') {
        var ga = a.gaSort || 0, gb = b.gaSort || 0;
        if (!ga && !gb) return (b.modified || '').localeCompare(a.modified || '');
        if (!ga) return 1; if (!gb) return -1;       // undated last
        return ga - gb || a.title.localeCompare(b.title);
      }
      return 0;
    });
    return arr;
  }

  // ---------------------------------------------------------------------------
  // Render: facets
  // ---------------------------------------------------------------------------
  var CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l4.5 4.5L19 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function buildFacets() {
    var html = '';
    GROUPS.forEach(function (g) {
      html += '<details class="facet" data-group="' + g.key + '"' + (g.open ? ' open' : '') + '>';
      html += '<summary>' + util.escapeHtml(g.label) +
        '<span class="fcount" data-fcount="' + g.key + '" hidden></span>' +
        '<span class="chev icon">' + icons.svg.chevron + '</span></summary>';
      html += '<div class="facet-body">';
      if (g.searchable) {
        html += '<input type="search" class="prod-search" data-prodsearch="1" placeholder="Filter products…" aria-label="Filter product list" spellcheck="false" />';
      }
      html += '<div class="facet-scroll' + (g.searchable ? '' : ' facet-scroll-auto') + '" data-opts="' + g.key + '">';
      html += renderOptions(g);
      html += '</div></div></details>';
    });
    elFacets.innerHTML = html;
  }

  function renderOptions(g) {
    var html = '';
    var dotClass = g.key === 'status' ? { 'In development': 'dot-dev', 'Rolling out': 'dot-rolling', 'Launched': 'dot-launched', 'Cancelled': 'dot-cancelled' } : null;
    for (var v = 0; v < g.values.length; v++) {
      var val = g.values[v];
      var checked = !!state.sel[g.key][val];
      var label = g.labels && g.labels[val] ? g.labels[val] : val;
      var lead = '';
      if (g.tile) lead = icons.productTile(val, 'sm');
      else if (dotClass) lead = '<span class="dot ' + (dotClass[val] || '') + '" aria-hidden="true"></span>';
      html += '<label class="opt" data-val="' + util.escapeAttr(val) + '">' +
        '<input type="checkbox"' + (checked ? ' checked' : '') + ' data-group="' + g.key + '" value="' + util.escapeAttr(val) + '" />' +
        '<span class="box" aria-hidden="true">' + CHECK + '</span>' +
        '<span class="opt-label">' + lead + '<span class="txt">' + util.escapeHtml(label) + '</span></span>' +
        '<span class="opt-count" data-count="' + util.escapeAttr(val) + '"></span></label>';
    }
    return html;
  }

  function updateFacetCounts(textResults) {
    GROUPS.forEach(function (g) {
      // base = text-matched entries passing all OTHER groups' filters
      var base = textResults.filter(function (r) { return passes(r.e, g.key); });
      var counts = {};
      for (var b = 0; b < base.length; b++) {
        var e = base[b].e, v = e[g.field];
        if (!v) continue;
        var arr = g.single ? [v] : v;
        for (var a = 0; a < arr.length; a++) counts[arr[a]] = (counts[arr[a]] || 0) + 1;
      }
      var scope = elFacets.querySelector('[data-opts="' + g.key + '"]');
      if (!scope) return;
      var opts = scope.querySelectorAll('.opt');
      for (var o = 0; o < opts.length; o++) {
        var val = opts[o].getAttribute('data-val');
        var c = counts[val] || 0;
        var cEl = opts[o].querySelector('.opt-count');
        if (cEl) cEl.textContent = c ? c.toLocaleString() : '0';
        opts[o].classList.toggle('is-zero', c === 0 && !state.sel[g.key][val]);
      }
      // selected-count pill on the summary
      var nSel = Object.keys(state.sel[g.key]).filter(function (v) { return state.sel[g.key][v]; }).length;
      var pill = elFacets.querySelector('[data-fcount="' + g.key + '"]');
      if (pill) { pill.textContent = nSel; pill.hidden = nSel === 0; }
    });
  }

  // ---------------------------------------------------------------------------
  // Render: active chips
  // ---------------------------------------------------------------------------
  function renderChips() {
    var html = '';
    GROUPS.forEach(function (g) {
      Object.keys(state.sel[g.key]).filter(function (v) { return state.sel[g.key][v]; }).forEach(function (val) {
        var label = g.labels && g.labels[val] ? g.labels[val] : val;
        html += '<span class="achip">' + util.escapeHtml(g.label) + ': ' + util.escapeHtml(label) +
          '<button type="button" class="x" data-rmgroup="' + util.escapeAttr(g.key) + '" data-rmval="' + util.escapeAttr(val) + '" aria-label="Remove filter ' + util.escapeAttr(label) + '">' + icons.svg.close + '</button></span>';
      });
    });
    elChips.innerHTML = html;
    elReset.disabled = !anyFilter();
  }

  // ---------------------------------------------------------------------------
  // Render: list
  // ---------------------------------------------------------------------------
  var currentSorted = [];

  function statusPill(name) {
    return '<span class="pill" data-status="' + icons.statusKey(name) + '"><span class="dot" aria-hidden="true"></span>' + util.escapeHtml(name) + '</span>';
  }

  function changeCard(r) {
    var e = r.e;
    var title = util.highlight(e.title, r.ranges);
    var prods = (e.products || []).slice(0, 3).map(function (p) {
      return '<span class="badge badge-prod">' + icons.productTile(p, 'sm') + util.escapeHtml(icons.product(p).label) + '</span>';
    }).join('');
    var extra = (e.products || []).length > 3 ? '<span class="badge badge-prod">+' + ((e.products.length) - 3) + '</span>' : '';
    var meta = '';
    if (e.ga) meta += '<span class="ga-chip"><span class="icon">' + icons.svg.calendar + '</span>' + util.escapeHtml(util.fmtGa(e.ga)) + '</span>';
    meta += '<span class="meta-tag"><span class="icon">' + icons.svg.clock + '</span>Updated ' + util.escapeHtml(util.fmtRel(e.modified) || util.fmtDate(e.modified)) + '</span>';
    if (e.source === 'mc') meta += '<span class="src-chip">Message Center</span>';

    return '<article class="change" data-id="' + util.escapeAttr(e.id) + '" tabindex="0" role="button" aria-label="' + util.escapeAttr(e.title) + '">' +
      '<div class="change-main">' +
        '<h3 class="change-title">' + title + '</h3>' +
        (e.desc ? '<p class="change-desc">' + util.escapeHtml(e.desc) + '</p>' : '') +
        '<div class="change-meta">' + prods + extra + meta + '</div>' +
      '</div>' +
      '<div class="change-side">' + statusPill(e.status) + '</div>' +
    '</article>';
  }

  function renderList() {
    if (!currentSorted.length) { elList.innerHTML = emptyState(); return; }
    var slice = currentSorted.slice(0, state.limit);
    var html = '';
    for (var j = 0; j < slice.length; j++) html += changeCard(slice[j]);
    if (currentSorted.length > slice.length) {
      html += '<div style="text-align:center;padding:8px 0 4px"><button type="button" class="btn" id="show-more">Show ' +
        Math.min(60, currentSorted.length - slice.length) + ' more (' + (currentSorted.length - slice.length).toLocaleString() + ' hidden)</button></div>';
    }
    elList.innerHTML = html;
    var more = $('show-more');
    if (more) more.addEventListener('click', function () { state.limit += 60; renderList(); });
  }

  function emptyState() {
    return '<div class="empty"><span class="icon">' + icons.svg.search + '</span>' +
      '<h3>No matching changes</h3><p>Try a different search term or clear some filters to widen the results.</p></div>';
  }

  // ---------------------------------------------------------------------------
  // Render: timeline (per-product lanes × quarter columns)
  // ---------------------------------------------------------------------------
  var MAX_LANES = 30, CELL_CAP = 10;

  function quarterOf(gaSort) { // gaSort = YYYYMM
    var y = Math.floor(gaSort / 100), m = gaSort % 100;
    var q = m ? Math.ceil(m / 3) : 0;
    return { y: y, q: q, key: y + 'Q' + q, label: (q ? 'Q' + q + ' ' : '') + y, sort: y * 10 + (q || 0) };
  }

  function renderTimeline() {
    var entries = currentSorted.map(function (r) { return r.e; });
    if (!entries.length) { elTimeline.innerHTML = emptyState(); return; }

    // columns = distinct quarters present (dated), sorted asc; + TBD if any undated
    var colMap = {}, hasTbd = false;
    entries.forEach(function (e) {
      if (e.gaSort) { var q = quarterOf(e.gaSort); colMap[q.key] = q; } else { hasTbd = true; }
    });
    var cols = Object.keys(colMap).map(function (k) { return colMap[k]; }).sort(function (a, b) { return a.sort - b.sort; });
    if (hasTbd) cols.push({ key: 'tbd', label: 'TBD', tbd: true });

    // lanes = products present, by count desc
    var laneCount = {};
    entries.forEach(function (e) { (e.products || []).forEach(function (p) { laneCount[p] = (laneCount[p] || 0) + 1; }); });
    var lanes = Object.keys(laneCount).sort(function (a, b) { return laneCount[b] - laneCount[a] || a.localeCompare(b); });
    var truncated = lanes.length > MAX_LANES;
    lanes = lanes.slice(0, MAX_LANES);

    // bucket: product -> colKey -> [entries]
    var grid = {};
    lanes.forEach(function (p) { grid[p] = {}; });
    entries.forEach(function (e) {
      var colKey = e.gaSort ? quarterOf(e.gaSort).key : 'tbd';
      (e.products || []).forEach(function (p) {
        if (!grid[p]) return;
        (grid[p][colKey] = grid[p][colKey] || []).push(e);
      });
    });

    var colTemplate = '190px repeat(' + cols.length + ', 150px)';
    var html = '';
    html += '<p class="tl-hint"><span class="icon">' + icons.svg.timeline + '</span>Release timeline by product — coloured by status. Columns are calendar quarters of the announced availability date.' +
      (truncated ? ' Showing the top ' + MAX_LANES + ' products; filter to narrow.' : '') + '</p>';

    html += '<div class="tl-grid" style="--tl-cols:' + colTemplate + '">';
    // header
    html += '<div class="tl-row tl-head" style="grid-template-columns:var(--tl-cols)">';
    html += '<div class="tl-cell tl-corner tl-lane-head">Product</div>';
    cols.forEach(function (c) { html += '<div class="tl-cell">' + util.escapeHtml(c.label) + '</div>'; });
    html += '</div>';
    // lanes
    lanes.forEach(function (p) {
      var meta = icons.product(p);
      html += '<div class="tl-row" style="grid-template-columns:var(--tl-cols)">';
      html += '<div class="tl-cell tl-lane-head">' + icons.productTile(p, 'sm') +
        '<span class="txt" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + util.escapeHtml(meta.label) + '</span>' +
        '<span class="lane-count">' + laneCount[p] + '</span></div>';
      cols.forEach(function (c) {
        var cell = (grid[p][c.key] || []);
        var cls = 'tl-cell' + (c.tbd ? ' tl-cell-tbd' : '');
        html += '<div class="' + cls + '">';
        var shown = cell.slice(0, CELL_CAP);
        shown.forEach(function (e) {
          html += '<button type="button" class="tl-chip" data-status="' + icons.statusKey(e.status) + '" data-id="' + util.escapeAttr(e.id) + '" title="' + util.escapeAttr(e.title) + '">' + util.escapeHtml(e.title) + '</button>';
        });
        if (cell.length > CELL_CAP) {
          html += '<button type="button" class="tl-more" data-drill="' + util.escapeAttr(p) + '">+' + (cell.length - CELL_CAP) + ' more</button>';
        }
        html += '</div>';
      });
      html += '</div>';
    });
    html += '</div>';
    elTimeline.innerHTML = html;
  }

  // ---------------------------------------------------------------------------
  // Main run
  // ---------------------------------------------------------------------------
  function run() {
    var textResults = search.query(state.q);
    updateFacetCounts(textResults);
    var filtered = textResults.filter(function (r) { return passes(r.e, null); });
    currentSorted = sortResults(filtered);
    state.limit = 60;

    if (state.view === 'timeline') { elTimeline.hidden = false; elList.hidden = true; renderTimeline(); }
    else { elTimeline.hidden = true; elList.hidden = false; renderList(); }

    renderChips();
    elRegion.scrollTop = 0;

    // status bar
    var total = DATA.length;
    elCount.innerHTML = '<strong>' + currentSorted.length.toLocaleString() + '</strong>&nbsp;of ' + total.toLocaleString() + ' changes';
    var metaParts = [];
    metaParts.push((META.products || productValues.length) + ' products');
    if (META.generated) metaParts.push('updated ' + util.escapeHtml(util.fmtDate(META.generated)));
    elMeta.innerHTML = metaParts.join(' &nbsp;·&nbsp; ');

    elClear.hidden = !state.q;
    writeHash();
  }

  var runDebounced = util.debounce(run, 130);

  // ---------------------------------------------------------------------------
  // Detail drawer
  // ---------------------------------------------------------------------------
  var lastFocus = null;

  function tagList(arr) {
    if (!arr || !arr.length) return '<span class="tag-lite">—</span>';
    return '<div class="tags">' + arr.map(function (t) { return '<span class="tag-lite">' + util.escapeHtml(t) + '</span>'; }).join('') + '</div>';
  }

  function openDrawer(id) {
    var e = byId[id];
    if (!e) return;
    lastFocus = document.activeElement;
    var prodBadges = (e.products || []).map(function (p) {
      return '<span class="badge badge-prod">' + icons.productTile(p, 'sm') + util.escapeHtml(icons.product(p).label) + '</span>';
    }).join('');
    var kv = '';
    kv += '<dt>Status</dt><dd>' + statusPill(e.status) + '</dd>';
    if (e.ga) kv += '<dt>Availability</dt><dd>' + util.escapeHtml(e.ga) + '</dd>';
    if (e.preview) kv += '<dt>Preview</dt><dd>' + util.escapeHtml(e.preview) + '</dd>';
    kv += '<dt>Products</dt><dd>' + tagList((e.products || []).map(function (p) { return icons.product(p).label; })) + '</dd>';
    if (e.phases) kv += '<dt>Release phase</dt><dd>' + tagList(e.phases) + '</dd>';
    if (e.platforms) kv += '<dt>Platforms</dt><dd>' + tagList(e.platforms) + '</dd>';
    if (e.clouds) kv += '<dt>Clouds</dt><dd>' + tagList(e.clouds) + '</dd>';
    kv += '<dt>Created</dt><dd>' + util.escapeHtml(util.fmtDate(e.created) || '—') + '</dd>';
    kv += '<dt>Last updated</dt><dd>' + util.escapeHtml(util.fmtDate(e.modified) || '—') + '</dd>';
    kv += '<dt>Source</dt><dd>' + (e.source === 'mc' ? 'Tenant Message Center' : 'Microsoft 365 public roadmap') + '</dd>';

    var foot = '<a class="btn btn-primary" href="' + util.escapeAttr(e.link) + '" target="_blank" rel="noopener">' +
      (e.source === 'mc' ? 'Open in Message Center' : 'View on Microsoft roadmap') + '<span class="icon">' + icons.svg.external + '</span></a>';
    if (e.more) foot += '<a class="btn" href="' + util.escapeAttr(e.more) + '" target="_blank" rel="noopener">More info<span class="icon">' + icons.svg.external + '</span></a>';

    elDrawer.innerHTML =
      '<div class="drawer-head"><h2 id="drawer-title">' + util.escapeHtml(e.title) + '</h2>' +
        '<button type="button" class="drawer-close" id="drawer-close" aria-label="Close details">' + icons.svg.close + '</button></div>' +
      '<div class="drawer-body">' +
        '<div class="drawer-badges">' + statusPill(e.status) + prodBadges + '</div>' +
        '<div class="drawer-desc">' + util.escapeHtml(e.desc || 'No description provided.') + '</div>' +
        '<dl class="kv">' + kv + '</dl>' +
      '</div>' +
      '<div class="drawer-foot">' + foot + '</div>';

    elDrawer.setAttribute('aria-hidden', 'false');
    elDrawer.classList.add('is-open');
    elOverlay.classList.add('is-open');
    $('drawer-close').addEventListener('click', closeDrawer);
    elDrawer.focus();
  }

  function closeDrawer() {
    elDrawer.classList.remove('is-open');
    elOverlay.classList.remove('is-open');
    elDrawer.setAttribute('aria-hidden', 'true');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  // ---------------------------------------------------------------------------
  // Theme
  // ---------------------------------------------------------------------------
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    util.lsSet('mcd-theme', t);
    var btn = $('btn-theme'); if (btn) btn.setAttribute('aria-pressed', String(t === 'light'));
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------
  elQ.addEventListener('input', function () { state.q = elQ.value; runDebounced(); });
  elClear.addEventListener('click', function () { state.q = ''; elQ.value = ''; elQ.focus(); run(); });
  elSort.addEventListener('change', function () { state.sort = elSort.value; run(); });

  $('view-toggle').addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-view]'); if (!b) return;
    state.view = b.getAttribute('data-view');
    syncViewButtons();
    run();
  });
  function syncViewButtons() {
    var btns = $('view-toggle').querySelectorAll('button');
    for (var j = 0; j < btns.length; j++) {
      var on = btns[j].getAttribute('data-view') === state.view;
      btns[j].classList.toggle('is-active', on);
      btns[j].setAttribute('aria-pressed', String(on));
    }
  }

  // facet checkbox changes (delegated)
  elFacets.addEventListener('change', function (ev) {
    var cb = ev.target.closest('input[type="checkbox"][data-group]'); if (!cb) return;
    var g = cb.getAttribute('data-group'), v = cb.value;
    if (cb.checked) state.sel[g][v] = true; else delete state.sel[g][v];
    run();
  });
  // product list inline search (delegated)
  elFacets.addEventListener('input', function (ev) {
    var ps = ev.target.closest('input[data-prodsearch]'); if (!ps) return;
    var q = ps.value.toLowerCase();
    var scope = ps.parentNode.querySelector('[data-opts="products"]');
    var opts = scope.querySelectorAll('.opt');
    for (var j = 0; j < opts.length; j++) {
      var val = opts[j].getAttribute('data-val').toLowerCase();
      opts[j].style.display = (!q || val.indexOf(q) !== -1) ? '' : 'none';
    }
  });

  elChips.addEventListener('click', function (ev) {
    var x = ev.target.closest('[data-rmgroup]'); if (!x) return;
    var g = x.getAttribute('data-rmgroup'), v = x.getAttribute('data-rmval');
    delete state.sel[g][v];
    syncCheckboxes();
    run();
  });
  elReset.addEventListener('click', function () {
    state.q = ''; elQ.value = '';
    GROUPS.forEach(function (g) { state.sel[g.key] = {}; });
    syncCheckboxes();
    run();
  });
  function syncCheckboxes() {
    var cbs = elFacets.querySelectorAll('input[type="checkbox"][data-group]');
    for (var j = 0; j < cbs.length; j++) {
      cbs[j].checked = !!state.sel[cbs[j].getAttribute('data-group')][cbs[j].value];
    }
  }

  // list / timeline clicks -> drawer or drill-down
  elList.addEventListener('click', function (ev) {
    var card = ev.target.closest('.change[data-id]'); if (card) openDrawer(card.getAttribute('data-id'));
  });
  elList.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    var card = ev.target.closest('.change[data-id]'); if (!card) return;
    ev.preventDefault(); openDrawer(card.getAttribute('data-id'));
  });
  elTimeline.addEventListener('click', function (ev) {
    var more = ev.target.closest('[data-drill]');
    if (more) {
      var p = more.getAttribute('data-drill');
      GROUPS.forEach(function (g) { if (g.key === 'products') state.sel.products = {}; });
      state.sel.products[p] = true; state.view = 'list'; syncViewButtons(); syncCheckboxes(); run(); return;
    }
    var chip = ev.target.closest('.tl-chip[data-id]'); if (chip) openDrawer(chip.getAttribute('data-id'));
  });

  elOverlay.addEventListener('click', closeDrawer);
  $('btn-theme').addEventListener('click', function () {
    applyTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
  });

  // mobile sidebar
  function toggleSidebar(open) { elSidebar.classList.toggle('is-open', open); elBackdrop.classList.toggle('is-open', open); }
  $('btn-filters-m').addEventListener('click', function () { toggleSidebar(!elSidebar.classList.contains('is-open')); });
  elBackdrop.addEventListener('click', function () { toggleSidebar(false); });

  // keyboard
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') {
      if (elDrawer.classList.contains('is-open')) { closeDrawer(); return; }
      if (elSidebar.classList.contains('is-open')) { toggleSidebar(false); return; }
      if (state.q) { state.q = ''; elQ.value = ''; run(); return; }
    }
    // Trap focus inside the open detail drawer (aria-modal dialog).
    if (ev.key === 'Tab' && elDrawer.classList.contains('is-open')) {
      var f = elDrawer.querySelectorAll('a[href], button:not([disabled])');
      if (!f.length) { ev.preventDefault(); elDrawer.focus(); return; }
      var first = f[0], last = f[f.length - 1];
      if (!elDrawer.contains(document.activeElement)) { ev.preventDefault(); first.focus(); }
      else if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
      return;
    }
    var tag = (ev.target.tagName || '').toLowerCase();
    var typing = tag === 'input' || tag === 'textarea' || tag === 'select';
    if ((ev.key === 'k' || ev.key === 'K') && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); elQ.focus(); elQ.select(); }
    else if (ev.key === '/' && !typing) { ev.preventDefault(); elQ.focus(); }
  });

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  readHash();
  buildFacets();
  syncCheckboxes();
  elQ.value = state.q;
  elSort.value = state.sort;
  syncViewButtons();
  applyTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
  run();

  // Register the service worker for offline / PWA install.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
})();
