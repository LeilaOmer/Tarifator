// Versiunea cache-ului. BUMP-UIE-O LA FIECARE SCHIMBARE care trebuie sa ajunga
// sigur pe telefoanele cu aplicatia instalata (PWA): la `activate`, orice cache
// cu ALT nume e sters, deci un nume nou = curatenie completa.
//
// De ce conteaza: handler-ul de `fetch` e network-first, dar cade pe cache la
// orice hopa de retea — obisnuit pe mobil. Cum numele nu s-a schimbat de la
// scrierea lui, in cache stateau bucati din TOATE deploy-urile anterioare, iar
// un singur fallback servea un shell vechi care apoi cerea chunk-uri vechi.
// Rezultat: utilizatorul rula cod vechi si vedea bug-uri deja reparate.
const CACHE = 'tarifator-v3'

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
