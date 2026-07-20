import { NextRequest, NextResponse } from 'next/server'
import { verifyBearer } from '@/lib/apiAuth'
import { allowDaily } from '@/lib/rateLimit'
import { generateTikTokVariants } from '@/lib/tiktok/generate'

// Agent TikTok — pasul 1 (nucleu). Pentru ACEEASI idee genereaza 3 variante
// (educational, amuzant, controversat), fiecare cu hook, scenariu, descriere,
// hashtaguri si un prompt pentru generatoare video. Deocamdata DOAR intoarce
// rezultatul (fara salvare, fara UI) — acelea vin la pasii urmatori.
//
// Acelasi tipar ca celelalte rute AI (parse-pricing, parse-quote):
// auth cu Bearer token + limita zilnica anti-abuz.
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

  try {
    const result = await generateTikTokVariants({ topic })
    return NextResponse.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'eroare necunoscuta'
    return NextResponse.json(
      { error: 'generation_failed', message },
      { status: 500 },
    )
  }
}
