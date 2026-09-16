const CACHE='hearth-shell-v5';
const ASSETS=['/','/index.html','/styles.css','/warm.css','/app.js','/pocketbase.js','/household-store.js','/quick-add.js','/cooking-mode.js','/calendar-model.js','/recipes.js','/planning.js','/offline.js','/household-ui.js','/household-model.js','/icon.svg','/manifest.json','/icon-192.png','/icon-512.png','/icon-maskable.png','/apple-touch-icon.png','/favicon.ico','/images/hearth-emblem.jpg','/images/empty-tasks.jpg','/images/empty-kitchen.jpg','/images/recipes/chicken-and-broccoli-rice-bowls.jpg','/images/recipes/tomato-and-spinach-pasta.jpg','/images/recipes/vegetable-omelet.jpg','/images/recipes/bean-and-rice-bowls.jpg','/images/recipes/lentil-vegetable-soup.jpg','/images/recipes/chickpea-cucumber-salad.jpg','/images/recipes/peanut-oat-breakfast.jpg','/images/recipes/baked-salmon-and-potatoes.jpg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('hearth-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const url=new URL(e.request.url);
 if(e.request.method!=='GET'||url.origin!==location.origin||url.search||!ASSETS.includes(url.pathname))return;
 e.respondWith(fetch(e.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return response;}).catch(()=>caches.match(e.request)));
});
