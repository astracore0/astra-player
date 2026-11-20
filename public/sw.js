'use strict';
const CACHE = 'astra-player-shell-v1.22.4-transcode';
const SHELL = ['/', '/style.css?v=347', '/script.js?v=347', '/manifest.webmanifest', '/icons/astra-192.png', '/icons/astra-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('astra-player-shell-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never intercept API calls, media streams, subtitles, or range requests.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/subs_static/') || req.headers.has('range')) return;
  if (req.destination === 'video' || req.destination === 'audio') return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(res => {
      if (res.ok) caches.open(CACHE).then(c => c.put('/', res.clone()));
      return res;
    }).catch(() => caches.match('/')));
    return;
  }
  if (/\.(?:css|js|png|svg|webmanifest)$/.test(url.pathname) || url.pathname === '/') {
    event.respondWith(caches.match(req).then(hit => {
      const fresh = fetch(req).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()));
        return res;
      }).catch(() => hit);
      return hit || fresh;
    }));
  }
});
