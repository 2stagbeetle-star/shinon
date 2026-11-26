/* 心音 — keeps what has been loaded, so the game plays without a connection.
   The page is fetched from the network first (so a new version arrives at once) and falls back to the kept copy offline.
   Pictures, voices and films are kept the first time they load; a voice or a film asked for in pieces (Range) is
   fetched whole once, kept, and the piece is cut from the kept copy. */
const PAGE = 'shinon-page-v5.12.10';
const ASSETS = 'shinon-assets-1';   /* bump when a picture, a voice or a film changes under the same name */
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'favicon-32.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(PAGE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== PAGE && k !== ASSETS).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function page(req) {
  try {
    const r = await fetch(req);
    if (r.ok) { const c = await caches.open(PAGE); c.put('index.html', r.clone()); }
    return r;
  } catch (e) {
    return (await caches.match('index.html')) || (await caches.match('./')) || Response.error();
  }
}
async function asset(req) {
  const c = await caches.open(ASSETS);
  const hit = await c.match(req.url);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok && r.status === 200) c.put(req.url, r.clone());
  return r;
}
async function ranged(req) {
  const c = await caches.open(ASSETS);
  let full = await c.match(req.url);
  if (!full) {
    try {
      const r = await fetch(req.url);
      if (!r.ok || r.status !== 200) return fetch(req);
      await c.put(req.url, r.clone()); full = r;
    } catch (e) { return fetch(req); }
  }
  const buf = await full.arrayBuffer(), size = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  let start = m && m[1] ? +m[1] : 0, end = m && m[2] ? +m[2] : size - 1;
  if (!m || !m[1]) { if (m && m[2]) { start = Math.max(0, size - +m[2]); end = size - 1; } }
  end = Math.min(end, size - 1);
  if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
  return new Response(buf.slice(start, end + 1), { status: 206, statusText: 'Partial Content', headers: {
    'Content-Type': full.headers.get('Content-Type') || 'application/octet-stream',
    'Content-Range': 'bytes ' + start + '-' + end + '/' + size, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' } });
}
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate' || /\/(index\.html)?$/.test(url.pathname)) { e.respondWith(page(req)); return; }
  if (/\/(img|mv|voice)\//.test(url.pathname) || /\.(png|jpg|webp|webmanifest)$/.test(url.pathname)) {
    e.respondWith(req.headers.has('range') ? ranged(req) : asset(req));
  }
});
