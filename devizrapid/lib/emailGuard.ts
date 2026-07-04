// Domenii de email "de unica folosinta" (temp-mail) — folosite pentru conturi de
// aruncat (abuz freemium). Lista comuna; se completeaza in timp, nu e exhaustiva.
export const DISPOSABLE_DOMAINS = new Set<string>([
  '10minutemail.com', '10minutemail.net', '20minutemail.com', 'temp-mail.org', 'tempmail.com',
  'tempmailo.com', 'tempmail.net', 'tempmailaddress.com', 'guerrillamail.com', 'guerrillamail.net',
  'guerrillamail.org', 'guerrillamail.biz', 'guerrillamailblock.com', 'sharklasers.com', 'grr.la',
  'mailinator.com', 'mailinator.net', 'yopmail.com', 'yopmail.net', 'yopmail.fr', 'getnada.com',
  'nada.email', 'dispostable.com', 'trashmail.com', 'trashmail.net', 'fakeinbox.com', 'maildrop.cc',
  'mohmal.com', 'moakt.com', 'emailondeck.com', 'mintemail.com', 'tempinbox.com', 'throwawaymail.com',
  'mailnesia.com', 'discard.email', 'spamgourmet.com', 'spam4.me', 'mytemp.email', 'tmpmail.org',
  'burnermail.io', '33mail.com', 'anonaddy.me', 'mailsac.com', 'inboxkitten.com', 'mailcatch.com',
  'tempr.email', 'luxusmail.org', 'wegwerfemail.de', 'trbvm.com', 'cuvox.de', 'einrot.com',
])

export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@')
  return at === -1 ? '' : email.slice(at + 1).trim().toLowerCase()
}

export function isDisposableEmail(email: string): boolean {
  return DISPOSABLE_DOMAINS.has(emailDomain(email))
}

// Forma "reala" a unei adrese, pentru deduplicare: scoate `+tag` (alias catre
// aceeasi cutie la majoritatea furnizorilor) si, la Gmail, punctele (Gmail le
// ignora). Astfel `ana+1@gmail.com`, `a.n.a@gmail.com`, `ana@googlemail.com`
// devin toate `ana@gmail.com` => nu se pot face conturi multiple cu acelasi Gmail.
export function canonicalEmail(email: string): string {
  const e = email.trim().toLowerCase()
  const at = e.lastIndexOf('@')
  if (at === -1) return e
  let local = e.slice(0, at)
  let domain = e.slice(at + 1)
  const plus = local.indexOf('+')
  if (plus !== -1) local = local.slice(0, plus)
  if (domain === 'googlemail.com') domain = 'gmail.com'
  if (domain === 'gmail.com') local = local.replace(/\./g, '')
  return `${local}@${domain}`
}
