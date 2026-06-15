/* ============================================================================
 * MCD — js/icons.js
 * Inline SVG registry + status metadata + product-tile helper on window.MCD.icons.
 * Keeping icons here (rather than in markup) lets the landing page and the app
 * share one set with zero external requests. All SVGs use currentColor so they
 * inherit theme/accent colours.
 * ==========================================================================*/
window.MCD = window.MCD || {};

(function () {
  'use strict';

  var util = MCD.util;

  /* ---- UI icon set (24×24, stroke = currentColor) ---- */
  var SVG = {
    search: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="6.4" fill="none" stroke="currentColor" stroke-width="1.8"/><line x1="16" y1="16" x2="21" y2="21" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    external: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14 5h5v5M19 5l-8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3.5" y="5" width="17" height="16" rx="2.4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M3.5 9.5h17M8 3v4M16 3v4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    list: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    timeline: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 4v16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="5" cy="8" r="2.1" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="5" cy="16" r="2.1" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M9 8h11M9 16h7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    filter: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 6h16l-6 7v5l-4 2v-7L4 6z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.7"/><g stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><line x1="12" y1="2.5" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="21.5"/><line x1="2.5" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="21.5" y2="12"/><line x1="5.2" y1="5.2" x2="7" y2="7"/><line x1="17" y1="17" x2="18.8" y2="18.8"/><line x1="18.8" y1="5.2" x2="17" y2="7"/><line x1="7" y1="17" x2="5.2" y2="18.8"/></g></svg>',
    moon: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 13.5A8 8 0 0 1 10.5 4 8 8 0 1 0 20 13.5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    spark: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6L12 3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>'
  };

  /**
   * Ordered status metadata. `key` maps to a CSS data attribute
   * ([data-status="dev"|"rolling"|"launched"|"cancelled"]); colours live in CSS.
   */
  var STATUS = [
    { name: 'In development', key: 'dev',       label: 'In development' },
    { name: 'Rolling out',    key: 'rolling',   label: 'Rolling out' },
    { name: 'Launched',       key: 'launched',  label: 'Launched' },
    { name: 'Cancelled',      key: 'cancelled', label: 'Cancelled' }
  ];
  var STATUS_BY_NAME = {};
  for (var i = 0; i < STATUS.length; i++) STATUS_BY_NAME[STATUS[i].name] = STATUS[i];
  function statusKey(name) { return (STATUS_BY_NAME[name] && STATUS_BY_NAME[name].key) || 'other'; }

  /** Look up product display metadata from window.MCD.PRODUCTS (build output). */
  function product(name) {
    var p = (MCD.PRODUCTS && MCD.PRODUCTS[name]) || null;
    if (p) return p;
    // Fallback for a product not present in PRODUCTS (e.g. a stray MC service).
    return { label: name, color: '#5b73f0', tag: (name || '?').replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || '?' };
  }

  /*
   * Real product logos (dashboard-icons, MIT) by canonical product name (lower-
   * cased). Products without an official open logo fall back to the coloured
   * monogram tile. Several products reuse a shared brand logo on purpose.
   */
  var LOGO_BY_KEY = {
    'microsoft copilot (microsoft 365)': 'microsoft-copilot',
    'microsoft copilot studio': 'microsoft-copilot',
    'microsoft teams': 'microsoft-teams',
    'outlook': 'microsoft-outlook',
    'sharepoint': 'microsoft-sharepoint',
    'sharepoint syntex': 'microsoft-sharepoint',
    'powerpoint': 'microsoft-powerpoint',
    'word': 'microsoft-word',
    'excel': 'microsoft-excel',
    'microsoft 365': 'microsoft-365',
    'microsoft 365 app': 'microsoft-365',
    'office 365': 'microsoft-office',
    'microsoft 365 admin center': 'microsoft-365-admin-center',
    'microsoft edge': 'microsoft-edge',
    'onedrive': 'microsoft-onedrive',
    'onenote': 'microsoft-onenote',
    'microsoft intune': 'microsoft-intune',
    'microsoft defender for office 365': 'microsoft-defender',
    'exchange': 'microsoft-exchange',
    'access': 'microsoft-access',
    'power automate': 'microsoft-power-automate',
    'microsoft to do': 'microsoft-to-do',
    'windows': 'microsoft-windows',
    'windows 365': 'microsoft-windows',
    'minecraft education': 'minecraft',
    'azure': 'microsoft-azure',
    'microsoft azure': 'microsoft-azure',
    // sourced from Wikimedia Commons / svgl (no logo in dashboard-icons)
    'microsoft purview': 'microsoft-purview',
    'microsoft entra': 'microsoft-entra',
    'microsoft viva': 'microsoft-viva',
    'planner': 'microsoft-planner',
    'microsoft clipchamp': 'microsoft-clipchamp',
    'forms': 'microsoft-forms',
    'microsoft stream': 'microsoft-stream',
    'microsoft project': 'microsoft-project'
  };

  /** Return the logo URL for a product, or null if it has no official logo. */
  function logo(name) {
    var f = LOGO_BY_KEY[String(name || '').toLowerCase()];
    return f ? 'assets/icons/' + f + '.svg' : null;
  }

  /**
   * Safe HTML for a square product "tile": the real product logo on a white
   * chip when available, otherwise a coloured monogram. `size` is a CSS modifier
   * suffix: '' (default), 'sm', 'lg'.
   */
  function productTile(name, size) {
    var p = product(name);
    var sz = size ? ' prod-tile-' + size : '';
    var lg = logo(name);
    if (lg) {
      return '<span class="prod-tile prod-tile-logo' + sz + '" title="' + util.escapeAttr(p.label) +
        '" aria-hidden="true"><img src="' + util.escapeAttr(lg) + '" alt="" loading="lazy" decoding="async"></span>';
    }
    return '<span class="prod-tile' + sz + '" style="--prod:' + util.escapeAttr(p.color) + '" title="' +
      util.escapeAttr(p.label) + '" aria-hidden="true">' + util.escapeHtml(p.tag) + '</span>';
  }

  MCD.icons = {
    svg: SVG,
    STATUS: STATUS,
    statusKey: statusKey,
    product: product,
    logo: logo,
    productTile: productTile
  };
})();
