/* ============================================================================
 * MCD (M365 Change Digest) — js/util.js
 * Shared, dependency-free helpers on window.MCD.util.
 * ES5-style IIFE ('use strict', var) to match the cmtrace / MSFinder house
 * style. Every value that ever reaches the DOM must pass through escapeHtml /
 * escapeAttr (or the highlight helper, which escapes for you) — nothing here
 * uses innerHTML on raw, untrusted data.
 * ==========================================================================*/
window.MCD = window.MCD || {};

(function () {
  'use strict';

  /** Escape a string for safe insertion into HTML text content. */
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Escape a string for safe use inside a double-quoted HTML attribute. */
  function escapeAttr(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /** Debounce: fire fn after `ms` of inactivity. */
  function debounce(fn, ms) {
    var timer = null;
    return function () {
      var self = this, args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { timer = null; fn.apply(self, args); }, ms);
    };
  }

  /** Clamp n into [lo, hi]. */
  function clamp(n, lo, hi) { return n < lo ? lo : n > hi ? hi : n; }

  /** Merge [start,end) ranges into a sorted, non-overlapping set. */
  function mergeRanges(ranges) {
    if (!ranges || ranges.length === 0) return [];
    var sorted = ranges.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var out = [sorted[0].slice()];
    for (var i = 1; i < sorted.length; i++) {
      var last = out[out.length - 1], cur = sorted[i];
      if (cur[0] <= last[1]) { if (cur[1] > last[1]) last[1] = cur[1]; }
      else { out.push(cur.slice()); }
    }
    return out;
  }

  /**
   * HTML-escape `text`, then wrap the [start,end) ranges with <mark>…</mark>.
   * Output is safe even though it contains literal markup: every non-tag
   * character is escaped. Overlapping ranges are merged so marks never nest.
   */
  function highlight(text, ranges) {
    var str = text == null ? '' : String(text);
    if (!ranges || ranges.length === 0) return escapeHtml(str);
    var merged = mergeRanges(ranges), out = '', cursor = 0, len = str.length;
    for (var i = 0; i < merged.length; i++) {
      var start = clamp(merged[i][0], 0, len), end = clamp(merged[i][1], 0, len);
      if (end <= start) continue;
      if (start > cursor) out += escapeHtml(str.slice(cursor, start));
      out += '<mark>' + escapeHtml(str.slice(start, end)) + '</mark>';
      cursor = end;
    }
    if (cursor < len) out += escapeHtml(str.slice(cursor));
    return out;
  }

  /** Read a JSON value from localStorage; return `fallback` on any error. */
  function lsGet(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (e) { return fallback; }
  }

  /** Write a JSON value to localStorage; swallow any error. */
  function lsSet(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  var MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /** Format an ISO date string (YYYY-MM-DD) as "15 Jun 2026". '' when unparseable. */
  function fmtDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return '';
    var mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    return d + ' ' + MONTHS_SHORT[mo - 1] + ' ' + m[1];
  }

  /**
   * Relative time from an ISO date to today: "today", "3 days ago",
   * "2 months ago", "in 4 days". Coarse but human. '' when unparseable.
   */
  function fmtRel(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return '';
    var then = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    var now = new Date();
    var today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    var days = Math.round((then - today) / 86400000);
    var fut = days > 0, n = Math.abs(days);
    if (n === 0) return 'today';
    var unit, val;
    if (n < 7) { val = n; unit = 'day'; }
    else if (n < 30) { val = Math.round(n / 7); unit = 'week'; }
    else if (n < 365) { val = Math.round(n / 30); unit = 'month'; }
    else { val = Math.round(n / 365); unit = 'year'; }
    var label = val + ' ' + unit + (val === 1 ? '' : 's');
    return fut ? 'in ' + label : label + ' ago';
  }

  /** Prettify a roadmap availability string: "August CY2026" -> "Aug 2026". */
  function fmtGa(s) {
    if (!s) return '';
    var str = String(s);
    var year = (str.match(/CY\s*(\d{4})/i) || [])[1];
    var monthIdx = -1;
    var lower = str.toLowerCase();
    var full = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    for (var i = 0; i < full.length; i++) { if (lower.indexOf(full[i]) !== -1) { monthIdx = i; break; } }
    var q = (str.match(/Q([1-4])/i) || [])[1];
    if (!year) return str;
    if (monthIdx >= 0) return MONTHS_SHORT[monthIdx] + ' ' + year;
    if (q) return 'Q' + q + ' ' + year;
    return year;
  }

  MCD.util = {
    escapeHtml: escapeHtml,
    escapeAttr: escapeAttr,
    debounce: debounce,
    clamp: clamp,
    mergeRanges: mergeRanges,
    highlight: highlight,
    lsGet: lsGet,
    lsSet: lsSet,
    fmtDate: fmtDate,
    fmtRel: fmtRel,
    fmtGa: fmtGa,
    MONTHS_SHORT: MONTHS_SHORT
  };
})();
