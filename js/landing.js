/* ============================================================================
 * MCD — js/landing.js
 * Powers the marketing page: theme toggle, mobile nav, the live hero "latest
 * changes" demo (real MCD.search over the shipped index), the stats numbers and
 * the product-coverage grid. Pure vanilla, ES5-style IIFE; all dynamic text is
 * escaped via MCD.util before it reaches the DOM.
 * ==========================================================================*/
(function () {
  'use strict';

  var util = MCD.util, icons = MCD.icons, search = MCD.search;
  var DATA = MCD.DATA || [], PRODUCTS = MCD.PRODUCTS || {}, META = MCD.META || {};
  var $ = function (id) { return document.getElementById(id); };

  // ---- year ----
  var yr = $('year'); if (yr) yr.textContent = String(new Date().getFullYear());

  // ---- theme toggle ----
  var themeBtn = $('theme-toggle');
  function setTheme(t) { document.documentElement.setAttribute('data-theme', t); util.lsSet('mcd-theme', t); }
  if (themeBtn) themeBtn.addEventListener('click', function () {
    setTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
  });

  // ---- mobile nav ----
  var navToggle = document.querySelector('.nav-toggle'), navLinks = $('nav-links');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', function () {
      var open = navLinks.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(open));
    });
    navLinks.addEventListener('click', function (e) {
      if (e.target.closest('a')) { navLinks.classList.remove('open'); navToggle.setAttribute('aria-expanded', 'false'); }
    });
  }

  // ---- stats ----
  var sc = $('stat-count'); if (sc) sc.innerHTML = util.escapeHtml((META.count || DATA.length).toLocaleString()) + '<span class="accent">+</span>';
  var sp = $('stat-products'); if (sp) sp.textContent = String(META.products || Object.keys(PRODUCTS).length);

  // ---- product coverage grid ----
  var catGrid = $('cat-grid');
  if (catGrid) {
    var prods = Object.keys(PRODUCTS).sort(function (a, b) {
      return (PRODUCTS[b].count || 0) - (PRODUCTS[a].count || 0) || a.localeCompare(b);
    });
    var html = '';
    prods.forEach(function (name) {
      var p = PRODUCTS[name];
      var lg = icons.logo(name);
      var tag = lg
        ? '<span class="cat-tag"><img class="svc-logo" src="' + util.escapeAttr(lg) + '" alt="" loading="lazy" decoding="async"></span>'
        : '<span class="cat-tag" style="--tag-color:' + util.escapeAttr(p.color) + '"><span class="mono">' + util.escapeHtml(p.tag) + '</span></span>';
      html += '<a class="cat-chip" href="app.html#products=' + encodeURIComponent(name) + '">' + tag +
        '<span class="cat-meta"><span class="cat-name">' + util.escapeHtml(p.label) + '</span>' +
        '<span class="cat-count"><b>' + (p.count || 0).toLocaleString() + '</b> change' + (p.count === 1 ? '' : 's') + '</span></span></a>';
    });
    catGrid.innerHTML = html;
  }

  // ---- hero live demo ----
  var input = $('demo-input'), results = $('demo-results'), countEl = $('demo-count');
  var statusGroup = $('demo-status');
  var demoStatus = '';

  function statusPill(name) {
    return '<span class="st-pill" data-status="' + icons.statusKey(name) + '"><span class="st-dot" aria-hidden="true"></span>' + util.escapeHtml(name) + '</span>';
  }

  function renderDemo() {
    if (!results) return;
    var q = input ? input.value : '';
    var ranked = search.query(q);
    if (demoStatus) ranked = ranked.filter(function (r) { return r.e.status === demoStatus; });
    var total = ranked.length;
    var top = ranked.slice(0, 6);

    if (!top.length) {
      results.innerHTML = '<div class="demo-empty">No changes match <strong>' + util.escapeHtml(q) + '</strong>. Try a broader term.</div>';
      if (countEl) countEl.textContent = '';
      return;
    }

    var html = '';
    top.forEach(function (r) {
      var e = r.e;
      var prod = (e.products && e.products[0]) || 'Microsoft 365';
      var pm = icons.product(prod);
      var titleHtml = util.highlight(e.title, r.ranges);
      var crumb = util.escapeHtml(pm.label) + (e.products.length > 1 ? ' <span class="sep">·</span> +' + (e.products.length - 1) : '') +
        ' <span class="sep">·</span> ' + util.escapeHtml(util.fmtRel(e.modified) || util.fmtDate(e.modified));
      var right = e.ga
        ? '<span class="demo-ga">' + util.escapeHtml(util.fmtGa(e.ga)) + '</span>' + statusPill(e.status)
        : statusPill(e.status);
      var lg = icons.logo(prod);
      var tag = lg
        ? '<span class="demo-tag"><img class="svc-logo" src="' + util.escapeAttr(lg) + '" alt="" loading="lazy" decoding="async"></span>'
        : '<span class="demo-tag" style="--tag-color:' + util.escapeAttr(pm.color) + '">' + util.escapeHtml(pm.tag) + '</span>';
      html += '<a class="demo-result" href="' + util.escapeAttr(e.link) + '" target="_blank" rel="noopener">' + tag +
        '<span class="demo-body"><span class="demo-title">' + titleHtml + '</span><span class="demo-crumb">' + crumb + '</span></span>' +
        '<span class="demo-meta">' + right + '</span>' +
        '<svg class="demo-go" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '</a>';
    });
    results.innerHTML = html;
    if (countEl) {
      countEl.textContent = q || demoStatus
        ? 'Showing ' + top.length + ' of ' + total.toLocaleString() + ' matching changes'
        : (META.count || DATA.length).toLocaleString() + ' changes tracked' + (META.generated ? ' · updated ' + util.fmtDate(META.generated) : '');
    }
  }

  if (input) input.addEventListener('input', util.debounce(renderDemo, 110));
  if (statusGroup) statusGroup.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-status]'); if (!b) return;
    demoStatus = b.getAttribute('data-status');
    var btns = statusGroup.querySelectorAll('button');
    for (var j = 0; j < btns.length; j++) {
      var on = btns[j] === b;
      btns[j].classList.toggle('is-active', on);
      btns[j].setAttribute('aria-pressed', String(on));
    }
    renderDemo();
  });

  renderDemo();

  // Register the service worker for offline / PWA install.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
})();
