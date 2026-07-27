import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { allowDaily } from '@/lib/rateLimit'

function normalizeUrl(raw: string) {
  try { const u = new URL(raw); return `${u.protocol}//${u.host}` } catch { return raw }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const base = normalizeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || '')
  const userClient = createClient(base, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '', {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Singura ruta care scrie intr-un tabel PARTAJAT intre toti utilizatorii
  // (ADR-024: corectia unui user se aplica la scanarile celorlalti) — si singura
  // ramasa fara plafon. Fara el, un cont putea insera oricate raporturi gresite
  // si strica preturile tuturor clientilor aceluiasi furnizor.
  // 30/zi acopera lejer corectiile reale ale unui comerciant intr-o zi de lucru.
  if (!(await allowDaily(user.id, 'box-ratio', 30))) {
    return NextResponse.json(
      { error: 'Prea multe corectii de cutie/bucata azi. Revino maine.' },
      { status: 429 },
    )
  }

  const body = await req.json().catch(() => ({}))
  const supplierName = typeof body.supplier_name === 'string' ? body.supplier_name.trim() : ''
  const productName = typeof body.product_name === 'string' ? body.product_name.trim() : ''
  const piecesPerBox = Math.round(Number(body.pieces_per_box))

  // Plafon superior + lungime minima nume: o cutie reala are un numar rezonabil
  // de bucati; fara plafon, o valoare absurda (ex 999) ar strica preturile.
  if (!supplierName || supplierName.length > 120 || !productName || productName.length > 200
    || !Number.isFinite(piecesPerBox) || piecesPerBox <= 1 || piecesPerBox > 500) {
    return NextResponse.json({ error: 'Date invalide: furnizor, produs si numar de bucati (intre 2 si 500) sunt obligatorii.' }, { status: 400 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Server config missing' }, { status: 500 })
  const admin = createClient(base, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Identitatea userului e deja verificata mai sus (userClient.auth.getUser);
  // scrierea foloseste service role ca sa nu mai depinda de politici RLS
  // separate pe tabelul acesta partajat intre toti userii.
  const { error } = await admin.from('product_box_ratios').insert({
    supplier_name: supplierName,
    product_name: productName,
    pieces_per_box: piecesPerBox,
    created_by: user.id,
  })
  if (error) {
    // Mesajul brut de Postgres numeste tabelul, coloanele si constrangerile —
    // harta schemei, oferita oricui are un cont. Ramane in log, nu in raspuns.
    console.error('[box-ratio] insert esuat:', error.message)
    return NextResponse.json({ error: 'Nu s-a putut salva corectia. Incearca din nou.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
