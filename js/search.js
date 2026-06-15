/* ============================================================================
 * MCD — js/search.js
 * window.MCD.search — a small, dependency-free ranking engine over the change
 * index (window.MCD.DATA). It builds a lightweight in-memory index once, then
 * answers ranked text queries with a fast linear scan: exact / prefix / phrase
 * / per-term token matches across title, products, description and id, with
 * AND semantics (every query term must match somewhere). Faceted filtering
 * (status, product, cloud, …) and sorting live in app.js — this module only
 * ranks by text relevance and returns title highlight ranges.
 * ==========================================================================*/
window.MCD = window.MCD || {};

(function () {
  'use strict';

  var DATA = MCD.DATA || [];

  /** Split a string into lowercase alphanumeric terms. */
  function terms(s) {
    return String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  }

  // ---- build the index once -------------------------------------------------
  var INDEX = DATA.map(function (e) {
    var prod = (e.products || []).join(' ');
    return {
      e: e,
      tl: (e.title || '').toLowerCase(),
      dl: (e.desc || '').toLowerCase(),
      pl: prod.toLowerCase(),
      rid: (e.id || '').replace(/^[a-z]+-/i, '').toLowerCase(),
      tokens: terms(e.title + ' ' + prod)
    };
  });

  /** Collect [start,end) ranges of all occurrences of `needle` in `hay`. */
  function rangesOf(hay, needle) {
    var out = [], from = 0, idx;
    if (!needle) return out;
    while ((idx = hay.indexOf(needle, from)) !== -1) {
      out.push([idx, idx + needle.length]);
      from = idx + needle.length;
    }
    return out;
  }

  /** True if every char of `q` appears in order within `s` (subsequence). */
  function isSubsequence(q, s) {
    var i = 0;
    for (var j = 0; j < s.length && i < q.length; j++) if (s[j] === q[i]) i++;
    return i === q.length;
  }

  /**
   * Rank the full data set against `text`.
   * @returns {Array.<{e:Object, score:number, ranges:Array}>}
   *          When `text` is empty, returns every entry (score 0, no ranges) in
   *          the index's natural order (most recently modified first).
   */
  function query(text) {
    var q = String(text || '').trim().toLowerCase();
    if (!q) return INDEX.map(function (it) { return { e: it.e, score: 0, ranges: [] }; });

    var qt = terms(q);
    var out = [];

    for (var i = 0; i < INDEX.length; i++) {
      var it = INDEX[i];
      var score = 0;
      var ranges = [];

      // Whole-query signals on the title.
      if (it.tl === q) score += 1000;
      else if (it.tl.indexOf(q) === 0) score += 400;
      if (q.indexOf(' ') !== -1 && it.tl.indexOf(q) !== -1) {
        score += 200;
        ranges = ranges.concat(rangesOf(it.tl, q));
      }
      // Id match (e.g. typing a roadmap feature id).
      if (it.rid && it.rid === q.replace(/[^a-z0-9]/g, '')) score += 800;

      // Per-term AND semantics: every term must hit somewhere.
      var allMatched = true;
      for (var t = 0; t < qt.length; t++) {
        var term = qt[t];
        var hit = false;
        var inTitle = it.tl.indexOf(term);
        if (inTitle !== -1) { score += 60; ranges = ranges.concat(rangesOf(it.tl, term)); hit = true; }
        if (it.pl.indexOf(term) !== -1) { score += 50; hit = true; }
        // token prefix bonus
        for (var k = 0; k < it.tokens.length; k++) {
          if (it.tokens[k].indexOf(term) === 0) { score += 18; hit = true; break; }
        }
        if (it.dl.indexOf(term) !== -1) { score += 10; hit = true; }
        if (it.rid && it.rid.indexOf(term) !== -1) { score += 8; hit = true; } // numeric id term
        if (!hit && term.length >= 4 && isSubsequence(term, it.tl)) { score += 6; hit = true; }
        if (!hit) { allMatched = false; break; }
      }
      if (!allMatched || score <= 0) continue;

      // Light recency nudge so equally-relevant items show freshest first.
      out.push({ e: it.e, score: score, ranges: ranges });
    }

    out.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return (b.e.modified || '').localeCompare(a.e.modified || '');
    });
    return out;
  }

  MCD.search = {
    query: query,
    /** Total number of indexed entries. */
    size: INDEX.length
  };
})();
