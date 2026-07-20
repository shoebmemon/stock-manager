// Stockline service worker — caches the app shell so the app can open
// (and show whatever was last cached) even without a network connection.
// Item/supplier/order data itself is already handled offline separately,
// in-page, via localStorage (see the app's own offline-first sync code).

const CACHE_NAME = 'stockline-shell-v4';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Third-party assets the page needs on first paint. Fetched with no-cors so
// a CDN hiccup during install can't fail the whole service worker install.
const THIRD_PARTY = [
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
];

self.addEventListener('install', (event)=>{
  event.waitUntil((async ()=>{
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    await Promise.all(THIRD_PARTY.map(async (url)=>{
      try{
        const res = await fetch(url, { mode: 'no-cors' });
        await cache.put(url, res);
      }catch(e){
        // Offline during install, or the CDN is unreachable — the app
        // shell itself still installs fine without these.
      }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event)=>{
  event.waitUntil((async ()=>{
    const names = await caches.keys();
    await Promise.all(names.filter(n=> n !== CACHE_NAME).map(n=> caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event)=>{
  const req = event.request;
  if(req.method !== 'GET') return;

  // Page navigations: try the network first so updates show up right away,
  // fall back to the cached shell when offline.
  if(req.mode === 'navigate'){
    event.respondWith((async ()=>{
      try{
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put('./index.html', fresh.clone());
        return fresh;
      }catch(e){
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('./index.html')) || (await cache.match('./'));
      }
    })());
    return;
  }

  // Everything else (icons, manifest, fonts, CDN libraries): cache-first,
  // refreshing the cache in the background when a network is available.
  event.respondWith((async ()=>{
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    const networkFetch = fetch(req).then(res=>{
      cache.put(req, res.clone());
      return res;
    }).catch(()=> null);
    return cached || (await networkFetch) || Response.error();
  })());
});
