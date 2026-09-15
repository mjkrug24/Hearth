const CACHE='hearth-shell-v3';
const ASSETS=['/','/index.html','/styles.css','/warm.css','/app.js','/pocketbase.js','/calendar-model.js','/recipes.js','/planning.js','/offline.js','/household-ui.js','/household-model.js','/icon.svg','/manifest.json','/icon-192.png','/icon-512.png','/icon-maskable.png','/apple-touch-icon.png','/favicon.ico'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('hearth-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const url=new URL(e.request.url);
 if(e.request.method!=='GET'||url.origin!==location.origin||url.search||!ASSETS.includes(url.pathname))return;
 e.respondWith(fetch(e.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return response;}).catch(()=>caches.match(e.request)));
});
