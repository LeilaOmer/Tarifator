import { NextRequest, NextResponse } from 'next/server'
import { verifyBearer } from '@/lib/apiAuth'
import { allowDaily } from '@/lib/rateLimit'

export const maxDuration = 30

export async function GET(req: NextRequest) {
  // Fara auth + limita, ruta ar fi un proxy ANAF deschis oricui de pe internet
  // (consum pe serverul nostru + risc de blocare a IP-ului de catre ANAF).
  const userId = await verifyBearer(req.headers.get('authorization'))
  if (!userId) return NextResponse.json({ error: 'Trebuie sa fii autentificat.' }, { status: 401 })
  if (!(await allowDaily(userId, 'anaf-lookup', 100))) {
    return NextResponse.json({ error: 'Limita zilnica de cautari ANAF atinsa. Revino maine.' }, { status: 429 })
  }

  const cui = req.nextUrl.searchParams.get('cui')
  if (!cui) return NextResponse.json({ error: 'CUI lipsa' }, { status: 400 })

  const cuiNum = parseInt(cui.replace(/[^0-9]/g, ''), 10)
  if (!cuiNum) return NextResponse.json({ error: 'CUI invalid' }, { status: 400 })

  const today = new Date().toISOString().split('T')[0]

  try {
    const anafRes = await fetch('https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify([{ cui: cuiNum, data: today }]),
    })

    const raw = await anafRes.text()

    if (!anafRes.ok) {
      return NextResponse.json({ error: `ANAF HTTP ${anafRes.status}`, detail: raw.slice(0, 300) }, { status: 502 })
    }

    let data: Record<string, unknown>
    try { data = JSON.parse(raw) } catch {
      return NextResponse.json({ error: 'Raspuns invalid ANAF', detail: raw.slice(0, 300) }, { status: 502 })
    }

    const entry = (data?.found as Array<{
      date_generale?: Record<string, string>
      inregistrare_scop_Tva?: { scpTVA?: boolean }
    }>)?.[0]
    const found = entry?.date_generale
    if (!found) {
      return NextResponse.json({ error: 'CUI negasit', detail: JSON.stringify(data).slice(0, 300) }, { status: 404 })
    }

    return NextResponse.json({
      name: found.denumire || '',
      address: found.adresa || '',
      reg_com: found.nrRegCom || '',
      scpTva: typeof entry?.inregistrare_scop_Tva?.scpTVA === 'boolean' ? entry.inregistrare_scop_Tva.scpTVA : null,
    })
  } catch (err: unknown) {
    // Mesajul exceptiei NU pleaca spre client: la un `fetch` esuat el contine
    // adresa interna incercata, proxy-ul, uneori tokenul din URL. Ramane in
    // logurile serverului, unde e util si unde il vedem doar noi.
    console.error('[anaf-lookup] apel esuat:', err)
    return NextResponse.json({ error: 'Nu s-a putut contacta ANAF. Incearca din nou.' }, { status: 502 })
  }
}
