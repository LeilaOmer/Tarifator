const CACHE = 'tarifator-v2'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)
  // Doar http(s): Cache API nu suporta scheme ca chrome-extension:// (cereri
  // venite de la extensiile din browser) — altfel cache.put arunca eroare.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return
  // Nu intercepam API-urile si supabase
  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase')) return

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok && res.type === 'basic') {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
        }
        return res
      })
      .catch(async () => (await caches.match(e.request)) || Response.error())
  )
})
