import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { isDisposableEmail, canonicalEmail } from '@/lib/emailGuard'
import { allowDailyByIp, clientIp } from '@/lib/rateLimit'

// Verificare inainte de inregistrare (anti-abuz freemium):
//  - respinge emailuri temporare (temp-mail),
//  - respinge un email al carui "canonical" (fara +tag / puncte la Gmail)
//    are deja cont => nu se pot face conturi multiple cu acelasi Gmail.
// Fail-open: daca lipseste config sau listUsers da eroare, NU blocam inregistrarea.

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest) {
  // Ruta e PUBLICA (pre-signup). Throttle pe IP ca sa nu fie folosita la nesfarsit
  // pentru enumerare de conturi / apeluri repetate de listUsers de la un singur IP.
  if (!(await allowDailyByIp(clientIp(req), 'check-signup', 60))) {
    return NextResponse.json({ ok: true }) // fail-open, nu blocam inregistrarea reala
  }

  const body = await req.json().catch(() => ({}))
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'Email invalid.' }, { status: 400 })
  }
  if (isDisposableEmail(email)) {
    return NextResponse.json({ ok: false, error: 'Foloseste o adresa de email reala (nu una temporara).' }, { status: 400 })
  }

  const admin = adminClient()
  if (!admin) return NextResponse.json({ ok: true })

  const target = canonicalEmail(email)
  try {
    for (let page = 1; page <= 50; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
      if (error || !data) break
      if (data.users.some(u => u.email && canonicalEmail(u.email) === target)) {
        return NextResponse.json({ ok: false, error: 'Acest email are deja cont. Autentifica-te.' }, { status: 409 })
      }
      if (data.users.length < 1000) break
    }
  } catch {
    return NextResponse.json({ ok: true }) // fail-open
  }
  return NextResponse.json({ ok: true })
}
