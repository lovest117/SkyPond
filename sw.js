'use strict';
// 只缓存池塘本身（同源静态资源）。天气接口和第三方请求一律不缓存。
const CACHE = 'skypond-shell-v1';
const CORE = [
  '/', '/index.html', '/style.css', '/core.js', '/art.js', '/gl.js', '/scene.js',
  '/now.js', '/audio.js', '/app.js', '/project.json', '/manifest.json',
  '/assets/pond.webp', '/assets/pond-spring.webp', '/assets/pond-summer.webp',
  '/assets/pond-autumn.webp', '/assets/pond-winter.webp',
  '/assets/favicon.svg', '/assets/app-icon-192.png', '/assets/app-icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 页面、脚本、样式优先走网络，离线时回退到缓存；图片等静态资源优先用缓存。
  if (request.mode === 'navigate' || ['script', 'style', 'document'].includes(request.destination)) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(request).then(hit => hit || caches.match('/index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(hit => hit || fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
      return response;
    }))
  );
});
