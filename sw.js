/* Offline support. Network first for the app shell so edits show up right away,
   cache first for icons. Bump CACHE on every deploy that changes the shell. */
const CACHE = 'money-v1';
const ASSETS = ['./', './index.html', './app.js', './seed.js', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys()
    .then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim()));
});
self.addEventListener('fetch', e=>{
  if(e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const shell = e.request.mode === 'navigate' || /\.(html|js|json)$/.test(url.pathname) || url.pathname.endsWith('/');
  if(shell){
    e.respondWith(fetch(e.request).then(res=>{
      const copy = res.clone(); caches.open(CACHE).then(c=>c.put(e.request, copy)).catch(()=>{});
      return res;
    }).catch(()=>caches.match(e.request).then(h=>h || caches.match('./index.html'))));
  } else {
    e.respondWith(caches.match(e.request).then(h=>h || fetch(e.request).then(res=>{
      const copy = res.clone(); caches.open(CACHE).then(c=>c.put(e.request, copy)).catch(()=>{});
      return res;
    })));
  }
});
