import { NextRequest, NextResponse } from 'next/server'
import { verifyBearer } from '@/lib/apiAuth'
import { allowDaily } from '@/lib/rateLimit'
import { matchService } from '@/lib/services/matchService'

export async function POST(req: NextRequest) {
  const userId = await verifyBearer(req.headers.get('authorization'))
  if (!userId) return NextResponse.json({ client_name: '', items: [], unmatched: [] }, { status: 401 })
  if (!(await allowDaily(userId, 'parse-quote', 300))) {
    return NextResponse.json({ client_name: '', items: [], unmatched: [], error: 'rate_limit' }, { status: 429 })
  }

  const { text, services } = await req.json()
  const svcList: { id: string; name: string }[] = Array.isArray(services) ? services : []
  const names = svcList.map(s => s.name)

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + process.env.GROQ_API_KEY
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          // Modelul DOAR citeste ce s-a spus (eticheta + cantitate). Potrivirea cu
          // serviciul salvat o face codul (matchService), tolerant la diacritice/
          // plural/"de" — modelul greseste des cand incearca sa echo-eze un id exact.
          content: 'Esti asistent pentru mesteri romani. Primesti text dictat cu posibile corectii (ba nu, mai bine, de fapt, nu vreau) — tine cont de ele si returneaza doar rezultatul final; ce e anulat NU apare. Raspunzi DOAR cu JSON, fara text, fara markdown. Format: {"client_name":"nume","items":[{"label":"teava","quantity":3}]}\n' +
            '- label = DOAR substantivul serviciului/materialului spus, FARA cantitate si FARA unitate ("3 m de teava" => "teava"; "doua prize" => "priza"; "am schimbat bateria" => "schimbat baterie"). Daca se potriveste cu unul din serviciile disponibile, foloseste formularea de acolo.\n' +
            '- quantity = numar intreg, extras din orice forma ("3 m","3 metri","trei metri","2 bucati","o priza" => 3,3,3,2,1). Implicit 1.\n' +
            '- cate un articol pentru fiecare lucru distinct. Nu inventa.'
        },
        {
          role: 'user',
          content: 'Servicii disponibile (context): ' + JSON.stringify(names) + '\nText: ' + text
        }
      ],
      temperature: 0.1
    })
  })

  const data = await res.json()
  const raw = data.choices?.[0]?.message?.content || '{}'
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(match ? match[0] : '{}')
    const rawItems: unknown[] = Array.isArray(parsed.items) ? parsed.items : []

    // Potrivirea DETERMINISTA in cod: eticheta -> serviciu salvat. Ce nu se
    // potriveste rezonabil se intoarce in `unmatched` (se ARATA userului, nu dispare).
    const items: { service_id: string; quantity: number }[] = []
    const unmatched: string[] = []
    for (const it of rawItems) {
      const o = (it || {}) as Record<string, unknown>
      const label = String(o.label ?? o.name ?? '').trim()
      if (!label) continue
      const qty = Math.max(1, Math.round(Number(o.quantity)) || 1)
      const svc = matchService(label, svcList)
      if (svc) items.push({ service_id: svc.id, quantity: qty })
      else unmatched.push(label)
    }
    return NextResponse.json({ client_name: parsed.client_name || '', items, unmatched })
  } catch {
    return NextResponse.json({ client_name: '', items: [], unmatched: [], raw })
  }
}