import { NextRequest, NextResponse } from 'next/server'
import { verifyBearer } from '@/lib/apiAuth'
import { allowDaily } from '@/lib/rateLimit'
import { type MatchableService } from '@/lib/services/matchService'
import { applyEditActions, normalizeOp, type EditAction } from '@/lib/services/editActions'

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

  // Lista curenta, in doua forme:
  //  - `currentLines`: starea REALA peste care aplicam actiunile (in cod);
  //  - `current`: doar nume+cantitate, ca CONTEXT pentru model ("scoate teava"
  //    are nevoie sa stie ca exista o teava). Modelul o citeste, nu o rescrie.
  const rawItems = Array.isArray(body.items) ? (body.items as unknown[]) : []
  const currentLines: EditItem[] = rawItems.flatMap(i => {
    const o = (i ?? {}) as Record<string, unknown>
    return typeof o.service_id === 'string'
      ? [{ service_id: o.service_id, quantity: Math.max(1, Math.round(Number(o.quantity)) || 1) }]
      : []
  })
  const current = rawItems.map(i => {
    const o = (i ?? {}) as Record<string, unknown>
    return { nume: String(o.name ?? ''), cantitate: Number(o.quantity) || 1 }
  })

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
            content: 'Esti asistent pentru mesteri romani. Primesti o lista curenta de lucrari si o comanda de modificare prin voce. Raspunzi DOAR cu JSON, fara text, fara markdown.\n' +
              'Format: {"actions":[{"op":"add","label":"priza","quantity":2}]}\n' +
              'Intorci DOAR ce trebuie SCHIMBAT. NU repeta lista curenta — de ea se ocupa aplicatia.\n' +
              'op poate fi:\n' +
              '- "add"    = se adauga la cat exista deja ("mai pune doua prize", "inca 3 m de teava")\n' +
              '- "set"    = cantitate exacta, inlocuieste ("fa 5 prize", "schimba la 2 ore")\n' +
              '- "remove" = scoate lucrarea de tot ("scoate teava", "sterge priza"); fara quantity\n' +
              '- "clear"  = goleste toata lista ("sterge tot", "o iau de la capat"); fara label\n' +
              'label = DOAR substantivul serviciului, FARA cantitate si FARA unitate ("inca 3 m de teava" => "teava"). Daca se potriveste cu unul din serviciile disponibile, foloseste formularea de acolo.\n' +
              'quantity = numar intreg. Implicit 1.\n' +
              'Mai multe schimbari intr-o comanda => mai multe actiuni. Daca nu se cere nicio schimbare, intoarce {"actions":[]}.',
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

  // Parsarea esuata NU inseamna "nicio actiune". Clientul trebuie sa poata
  // distinge "am inteles si nu e nimic de schimbat" de "n-am inteles" — altfel
  // ar putea aplica peste fisa un rezultat pe care nimeni nu l-a cerut.
  let parsed: { actions?: unknown }
  try {
    const m = raw.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('no json')
    parsed = JSON.parse(m[0])
    if (!Array.isArray(parsed.actions)) throw new Error('no actions')
  } catch {
    return NextResponse.json({ items: [], unmatched: [], error: 'parse_failed' }, { status: 502 })
  }

  const actions: EditAction[] = (parsed.actions as unknown[]).map(a => {
    const o = (a ?? {}) as Record<string, unknown>
    return { op: normalizeOp(o.op), label: String(o.label ?? o.name ?? ''), quantity: Number(o.quantity) }
  })

  // Aplicarea e DETERMINISTA, in cod, peste lista trimisa de client. Lista
  // curenta nu trece prin model, deci o linie nu poate disparea decat daca
  // utilizatorul a cerut explicit stergerea ei.
  const { items, unmatched, changed } = applyEditActions(
    currentLines,
    actions,
    svcList,
    (service_id, quantity) => ({ service_id, quantity }),
  )

  return NextResponse.json({ items, unmatched, changed })
}
