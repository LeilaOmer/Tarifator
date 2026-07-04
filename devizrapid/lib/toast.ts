// Toast simplu, fara dependinte si fara provider: inlocuieste alert()-urile
// native (bruste, blocante, urate pe mobil). Injecteaza un element in <body>,
// il animeaza si il scoate automat. Se poate apela din orice componenta client
// sau hook: toast('mesaj') pentru eroare, toast('gata', 'success') pentru succes.
export function toast(message: string, type: 'error' | 'success' = 'error') {
  if (typeof document === 'undefined') return

  let host = document.getElementById('toast-host')
  if (!host) {
    host = document.createElement('div')
    host.id = 'toast-host'
    host.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;z-index:99999;display:flex;' +
      'flex-direction:column;align-items:center;gap:8px;padding:16px;pointer-events:none'
    document.body.appendChild(host)
  }

  const el = document.createElement('div')
  const bg = type === 'success' ? '#2d6a4f' : '#b3261e'
  el.setAttribute('role', 'status')
  el.style.cssText =
    `max-width:min(92vw,440px);background:${bg};color:#fff;` +
    'font:600 14px/1.45 system-ui,-apple-system,sans-serif;padding:12px 16px;' +
    'border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.18);opacity:0;' +
    'transform:translateY(10px);transition:opacity .18s ease,transform .18s ease;pointer-events:auto'
  el.textContent = message
  host.appendChild(el)

  requestAnimationFrame(() => {
    el.style.opacity = '1'
    el.style.transform = 'translateY(0)'
  })

  const dismiss = () => {
    el.style.opacity = '0'
    el.style.transform = 'translateY(10px)'
    setTimeout(() => el.remove(), 200)
  }
  el.addEventListener('click', dismiss)
  setTimeout(dismiss, 3800)
}
