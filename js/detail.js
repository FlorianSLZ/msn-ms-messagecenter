/* ============================================================================
 * MCD — js/detail.js
 * Shared change-detail popup (centred modal) used by BOTH the dashboard
 * (app.js) and the landing page (landing.js), so clicking a change always opens
 * the real details in place instead of navigating away. window.MCD.detail.
 *
 * Self-contained: creates its own #overlay + #drawer elements on first use,
 * manages the overlay, focus trap, Escape and focus restore. All dynamic text
 * is escaped via MCD.util before it reaches the DOM. Styling lives in
 * css/detail.css (loaded by both pages).
 * ==========================================================================*/
window.MCD = window.MCD || {};

(function () {
  'use strict';

  var util = MCD.util, icons = MCD.icons;
  var overlay = null, drawer = null, lastFocus = null, onCloseCb = null;

  function ensure() {
    if (drawer) return;
    overlay = document.getElementById('overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'overlay';
      overlay.setAttribute('aria-hidden', 'true');
      document.body.appendChild(overlay);
    }
    drawer = document.getElementById('drawer');
    if (!drawer) {
      drawer = document.createElement('aside');
      drawer.id = 'drawer';
      drawer.setAttribute('role', 'dialog');
      drawer.setAttribute('aria-modal', 'true');
      drawer.setAttribute('aria-label', 'Change details');
      drawer.setAttribute('aria-hidden', 'true');
      drawer.tabIndex = -1;
      document.body.appendChild(drawer);
    }
    overlay.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
  }

  function statusPill(name) {
    return '<span class="det-pill" data-status="' + icons.statusKey(name) +
      '"><span class="det-dot" aria-hidden="true"></span>' + util.escapeHtml(name) + '</span>';
  }
  function tagList(arr) {
    if (!arr || !arr.length) return '<span class="tag-lite">—</span>';
    return '<div class="tags">' + arr.map(function (t) {
      return '<span class="tag-lite">' + util.escapeHtml(t) + '</span>';
    }).join('') + '</div>';
  }

  /** Open the popup for a change entry. opts.onClose runs after it closes. */
  function open(e, opts) {
    if (!e) return;
    ensure();
    lastFocus = document.activeElement;
    onCloseCb = (opts && opts.onClose) || null;

    var prodBadges = (e.products || []).map(function (p) {
      return '<span class="det-prod">' + icons.productTile(p, 'sm') + util.escapeHtml(icons.product(p).label) + '</span>';
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

    var foot = '<a class="det-btn det-btn-primary" href="' + util.escapeAttr(e.link) + '" target="_blank" rel="noopener">' +
      (e.source === 'mc' ? 'Open in Message Center' : 'View on Microsoft roadmap') + '<span aria-hidden="true">' + icons.svg.external + '</span></a>';
    if (e.more) foot += '<a class="det-btn" href="' + util.escapeAttr(e.more) + '" target="_blank" rel="noopener">More info<span aria-hidden="true">' + icons.svg.external + '</span></a>';

    drawer.innerHTML =
      '<div class="drawer-head"><h2 id="drawer-title">' + util.escapeHtml(e.title) + '</h2>' +
        '<button type="button" class="drawer-close" id="drawer-close" aria-label="Close details">' + icons.svg.close + '</button></div>' +
      '<div class="drawer-body">' +
        '<div class="drawer-badges">' + statusPill(e.status) + prodBadges + '</div>' +
        '<div class="drawer-desc">' + util.escapeHtml(e.desc || 'No description provided.') + '</div>' +
        '<dl class="kv">' + kv + '</dl>' +
      '</div>' +
      '<div class="drawer-foot">' + foot + '</div>';

    drawer.setAttribute('aria-hidden', 'false');
    drawer.classList.add('is-open');
    overlay.classList.add('is-open');
    document.getElementById('drawer-close').addEventListener('click', close);
    drawer.focus();
  }

  function close() {
    if (!drawer || !drawer.classList.contains('is-open')) return;
    drawer.classList.remove('is-open');
    overlay.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    var cb = onCloseCb; onCloseCb = null;
    if (cb) cb();
  }

  function isOpen() { return !!(drawer && drawer.classList.contains('is-open')); }

  function onKey(ev) {
    if (!isOpen()) return;
    if (ev.key === 'Escape') { ev.stopPropagation(); close(); return; }
    if (ev.key === 'Tab') {
      var f = drawer.querySelectorAll('a[href], button:not([disabled])');
      if (!f.length) { ev.preventDefault(); drawer.focus(); return; }
      var first = f[0], last = f[f.length - 1];
      if (!drawer.contains(document.activeElement)) { ev.preventDefault(); first.focus(); }
      else if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    }
  }

  MCD.detail = { open: open, close: close, isOpen: isOpen };
})();
