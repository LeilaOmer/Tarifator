import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { verifyBearer } from '@/lib/apiAuth'
import { allowDaily } from '@/lib/rateLimit'
import { generateTikTokVariants, GROQ_MODEL } from '@/lib/tiktok/generate'
import { variantSetToRows } from '@/lib/tiktok/store'

// Agent TikTok — pasul 2 (persistenta). Pentru ACEEASI idee genereaza 3 variante,
// fiecare definita de doua axe: content_type (formatul creativ) si goal
// (obiectivul de marketing). Salveaza fiecare varianta ca rand in `tiktok_ideas`
// cu metadate (schema: supabase/tiktok-ideas.sql), ca sa poti invata ce a mers.
//
// Acelasi tipar ca celelalte rute AI: auth cu Bearer token + limita zilnica.
export async function POST(req: NextRequest) {
  const userId = await verifyBearer(req.headers.get('authorization'))
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (!(await allowDaily(userId, 'tiktok-agent', 50))) {
    return NextResponse.json(
      { error: 'rate_limit', message: 'Limita zilnica atinsa. Revino maine.' },
      { status: 429 },
    )
  }

  let topic: string | undefined
  try {
    const body = await req.json().catch(() => ({}))
    if (typeof body?.topic === 'string') topic = body.topic
  } catch {
    // corp gol / invalid -> agentul alege singur unghiul
  }

  let set
  try {
    set = await generateTikTokVariants({ topic })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'eroare necunoscuta'
    return NextResponse.json({ error: 'generation_failed', message }, { status: 500 })
  }

  // Salvare. Generarea a reusit deja, deci un esec la salvare NU trebuie sa
  // ascunda rezultatul: intoarcem continutul si semnalam saved:false + eroarea
  // (ex: tabelul lipseste -> ruleaza supabase/tiktok-ideas.sql).
  const setId = randomUUID()
  let saved = false
  let saveError: string | null = null

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    saveError = 'SUPABASE_SERVICE_ROLE_KEY lipseste'
  } else {
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const rows = variantSetToRows(set, { userId, setId, model: GROQ_MODEL })
    const { error } = await admin.from('tiktok_ideas').insert(rows)
    if (error) saveError = error.message
    else saved = true
  }

  return NextResponse.json({ setId, saved, saveError, ...set })
}
