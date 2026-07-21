import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { PROMO_CAP, countTotalUsers } from '@/lib/promoCap'

export const maxDuration = 30

function normalizeUrl(raw: string) {
  try { const u = new URL(raw); return `${u.protocol}//${u.host}` } catch { return raw }
}

// Cache in memorie 60s: ruta e publica (contorul de pe landing), iar numarul de
// useri se schimba lent. Fara cache, fiecare vizitator ar declansa un countTotalUsers
// pe service-role — amplificare de cost la refresh/trafic. Cache-ul e per-instanta
// (ok pentru un contor: in cel mai rau caz cateva citiri/minut pe mai multe instante).
const CACHE_TTL_MS = 60_000
let cached: { remaining: number; cap: number; at: number } | null = null

export async function GET() {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json({ remaining: cached.remaining, cap: cached.cap })
  }

  const base = normalizeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || '')
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ remaining: PROMO_CAP, cap: PROMO_CAP })

  const admin = createClient(base, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const total = await countTotalUsers(admin)
    const remaining = Math.max(0, PROMO_CAP - total)
    cached = { remaining, cap: PROMO_CAP, at: Date.now() }
    return NextResponse.json({ remaining, cap: PROMO_CAP })
  } catch {
    return NextResponse.json({ remaining: PROMO_CAP, cap: PROMO_CAP })
  }
}
