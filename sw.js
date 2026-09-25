/* Service worker — MedTech Quick Reference
   ใช้งานออฟไลน์ได้หลังเปิดเว็บครั้งแรก · เมื่ออัปเดตไฟล์บน GitHub ให้เปลี่ยนเลข VERSION เพื่อบังคับโหลดใหม่ */
const VERSION = 'mtq-v2.1.0';
const CORE = ['./', './index.html', './atlas.js', './flow.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
/* stale-while-revalidate: ตอบจากแคชทันที (เร็ว/ออฟไลน์) แล้วอัปเดตแคชเบื้องหลัง */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const cacheable = url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com/.test(url.host);
  if (!cacheable) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const cached = await cache.match(req, { ignoreSearch: url.origin === location.origin });
    const network = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => cached || (req.mode === 'navigate' ? cache.match('./index.html') : undefined));
    return cached || network;
  }));
});
