import { NextRequest, NextResponse } from 'next/server'
import { verifyBearer } from '@/lib/apiAuth'
import { allowDaily } from '@/lib/rateLimit'
import { matchService, type MatchableService } from '@/lib/services/matchService'

// Modificarea prin voce a unei fise in curs ("mai adauga doua prize", "scoate
// teava"). Modelul intoarce lista REZULTATA, dar doar ca ETICHETE auzite —
// potrivirea eticheta -> serviciu salvat se face DETERMINIST in cod, exact ca la
// /api/parse-quote (matchService).
//
// DE CE s-a schimbat contractul: inainte modelul trebuia sa echo-eze `service_id`
// (UUID) exact. E fix lucrul la care modelele gresesc — iar clientul filtra tacut
// orice id necunoscut, deci linia DISPAREA fara niciun mesaj. Aceeasi problema
// fusese deja rezolvata corect in parse-quote; aici ramasese nealiniata.

type EditItem = { service_id: string; quantity: number }

export async function POST(req: NextRequest) {
  const userId = await verifyBearer(req.headers.get('authorization'))
  if (!userId) return NextResponse.json({ items: [], unmatched: [], error: 'unauthorized' }, { status: 401 })
  if (!(await allowDaily(userId, 'edit-quote', 300))) {
    return NextResponse.json({ items: [], unmatched: [], error: 'rate_limit' }, { status: 429 })
  }

  let body: { command?: unknown; items?: unknown; services?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ items: [], unmatched: [], error: 'invalid_body' }, { status: 400 })
  }

  const command = typeof body.command === 'string' ? body.command.trim() : ''
  // `services` venea nevalidat direct in .map() => TypeError si 500 daca lipsea.
  const svcList: MatchableService[] = Array.isArray(body.services)
    ? (body.services as unknown[]).flatMap(s => {
        const o = (s ?? {}) as Record<string, unknown>
        return typeof o.id === 'string' && typeof o.name === 'string'
          ? [{ id: o.id, name: o.name }]
          : []
      })
    : []
  if (!command || svcList.length === 0) {
    return NextResponse.json({ items: [], unmatched: [], error: 'invalid_body' }, { status: 400 })
  }

  // Lista curenta, redusa la ce ajuta modelul sa inteleaga comanda (nume +
  // cantitate). Id-urile nu-i mai trebuie, pentru ca nu le mai intoarce.
  const current = Array.isArray(body.items)
    ? (body.items as unknown[]).map(i => {
        const o = (i ?? {}) as Record<string, unknown>
        return { nume: String(o.name ?? ''), cantitate: Number(o.quantity) || 1 }
      })
    : []

  let raw = '{}'
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.GROQ_API_KEY,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'Esti asistent pentru mesteri romani. Primesti o lista curenta de lucrari si o comanda de modificare prin voce. Raspunzi DOAR cu JSON, fara text, fara markdown. Format: {"items":[{"label":"priza","quantity":2}]}\n' +
              '- Intoarce lista COMPLETA rezultata dupa aplicarea comenzii, nu doar ce s-a schimbat.\n' +
              '- label = DOAR substantivul serviciului, FARA cantitate si FARA unitate ("inca 3 m de teava" => "teava"). Daca se potriveste cu unul din serviciile disponibile, foloseste formularea de acolo.\n' +
              '- quantity = numar intreg. Implicit 1.\n' +
              '- Daca comanda cere stergerea a tot, intoarce {"items":[]}. Nu inventa lucrari care nu au fost cerute.',
          },
          {
            role: 'user',
            content: 'Servicii disponibile: ' + JSON.stringify(svcList.map(s => s.name)) +
              '\nLista curenta: ' + JSON.stringify(current) +
              '\nComanda: ' + command,
          },
        ],
        temperature: 0.1,
      }),
    })
    const data = await res.json()
    raw = data.choices?.[0]?.message?.content || '{}'
  } catch {
    return NextResponse.json({ items: [], unmatched: [], error: 'ai_unavailable' }, { status: 503 })
  }

  // Parsarea esuata NU inseamna "lista goala". Clientul trebuie sa poata distinge
  // "modelul a raspuns si rezultatul e o lista goala" (comanda de stergere, corect)
  // de "n-am inteles raspunsul" — altfel golea fisa utilizatorului in tacere.
  let parsed: { items?: unknown }
  try {
    const m = raw.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('no json')
    parsed = JSON.parse(m[0])
    if (!Array.isArray(parsed.items)) throw new Error('no items')
  } catch {
    return NextResponse.json({ items: [], unmatched: [], error: 'parse_failed' }, { status: 502 })
  }

  const items: EditItem[] = []
  const unmatched: string[] = []
  for (const it of parsed.items as unknown[]) {
    const o = (it ?? {}) as Record<string, unknown>
    const label = String(o.label ?? o.name ?? '').trim()
    if (!label) continue
    const qty = Math.min(Math.max(1, Math.round(Number(o.quantity)) || 1), 100_000)
    const svc = matchService(label, svcList)
    // Ce nu se potriveste se ARATA, nu dispare (aceeasi regula ca la parse-quote).
    if (svc) items.push({ service_id: svc.id, quantity: qty })
    else unmatched.push(label)
  }

  return NextResponse.json({ items, unmatched })
}
