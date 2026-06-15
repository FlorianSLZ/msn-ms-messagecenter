/*
 * sw.js — MCD (M365 Change Digest) service worker.
 *
 * Strategy:
 *   install  : precache the full app shell; skipWaiting so a new SW takes
 *              control immediately after the tab refreshes.
 *   activate : delete stale versioned caches; claim all existing clients.
 *   fetch    : network-first for navigations (always-fresh HTML, host-level
 *              clean-URL redirects work, offline falls back to cache);
 *              cache-first for other same-origin GET requests with runtime
 *              caching. Cross-origin and non-GET requests pass straight through.
 *
 * Bump CACHE_VERSION whenever the precache list changes. The generated data file
 * (data/changes.js) is precached too, so the dashboard works fully offline; a
 * new daily build ships a new file which the network-first nav + runtime cache
 * pick up on the next online visit.
 */
'use strict';

var CACHE_VERSION = 'mcd-v3';

var PRECACHE_URLS = [
  './',
  './index.html',
  './app.html',
  './css/landing.css',
  './css/app.css',
  './assets/fonts/manrope.woff2',
  './data/changes.js',
  './js/util.js',
  './js/icons.js',
  './js/search.js',
  './js/app.js',
  './js/landing.js',
  './manifest.webmanifest',
  './icon.svg',
  './favicon.svg'
];

self.addEventListener('install', function (evt) {
  evt.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      // Add each URL individually so one missing optional asset does not abort install.
      var adds = PRECACHE_URLS.map(function (url) {
        return cache.add(url).catch(function (err) {
          if (typeof console !== 'undefined' && console.warn) console.warn('[SW] precache miss:', url, err);
        });
      });
      return Promise.all(adds);
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (evt) {
  evt.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE_VERSION) return caches.delete(key);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (evt) {
  var req = evt.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first (fresh HTML, host clean-URL redirects, offline fallback).
  if (req.mode === 'navigate') {
    evt.respondWith(
      fetch(req).catch(function () {
        return caches.match(req).then(function (cached) {
          return cached || caches.match('./index.html') || caches.match('./');
        });
      })
    );
    return;
  }

  // The generated data file changes daily — serve it network-first so returning
  // visitors get the latest digest when online, with the cache as offline fallback.
  if (/\/data\/changes\.js$/.test(url.pathname)) {
    evt.respondWith(
      fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var clone = res.clone();
          caches.open(CACHE_VERSION).then(function (cache) { cache.put(req, clone); });
        }
        return res;
      }).catch(function () { return caches.match(req); })
    );
    return;
  }

  // Other same-origin GET (app shell): cache-first with runtime caching.
  evt.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var clone = res.clone();
          caches.open(CACHE_VERSION).then(function (cache) { cache.put(req, clone); });
        }
        return res;
      }).catch(function () { /* offline and uncached — let the browser handle it */ });
    })
  );
});
