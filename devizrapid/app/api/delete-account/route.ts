import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createHash } from 'crypto'

function normalizeUrl(raw: string) {
  try { const u = new URL(raw); return `${u.protocol}//${u.host}` } catch { return raw }
}

export async function POST(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = authHeader.replace('Bearer ', '')
  const base = normalizeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || '')

  // Verify caller
  const userClient = createClient(base, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '', {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error } = await userClient.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Server config missing' }, { status: 500 })

  const admin = createClient(base, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Salveaza hash email inainte de stergere (anti-abuz re-inregistrare)
  if (user.email) {
    const emailHash = createHash('md5').update(user.email.toLowerCase().trim()).digest('hex')
    const { data: existing } = await admin.from('deleted_accounts').select('email_hash').eq('email_hash', emailHash).maybeSingle()
    if (!existing) {
      await admin.from('deleted_accounts').insert({ email_hash: emailHash })
    }
  }

  // Sterge TOATE datele userului (copiii intai). Colectam erorile in loc sa le
  // ignoram: daca o stergere esueaza NU mai stergem contul de auth (altfel ar
  // ramane date orfane cu userul disparut), ci raportam esecul.
  const errors: string[] = []
  const del = async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await fn()
    if (error) errors.push(error.message)
  }

  const { data: quoteIds } = await admin.from('quotes').select('id').eq('user_id', user.id)
  await del(() => admin.from('quote_items').delete().in('quote_id', quoteIds?.map(q => q.id) || []))
  await del(() => admin.from('quotes').delete().eq('user_id', user.id))
  await del(() => admin.from('pricing_usage').delete().eq('user_id', user.id))
  await del(() => admin.from('pricing_drafts').delete().eq('user_id', user.id))
  await del(() => admin.from('invoice_scan_logs').delete().eq('user_id', user.id))
  await del(() => admin.from('feedback').delete().eq('user_id', user.id))
  await del(() => admin.from('services').delete().eq('user_id', user.id))
  await del(() => admin.from('clients').delete().eq('user_id', user.id))
  await del(() => admin.from('companies').delete().eq('user_id', user.id))
  await del(() => admin.from('profiles').delete().eq('id', user.id))

  if (errors.length > 0) {
    // Erorile brute de Postgres numesc tabele, coloane si constrangeri. Raman
    // in log (unde chiar avem nevoie de ele ca sa reparam o stergere blocata),
    // nu in raspunsul catre browser.
    console.error('[delete-account] stergeri esuate:', errors.join('; '))
    return NextResponse.json(
      { error: 'Nu s-au putut sterge toate datele. Contul NU a fost sters — scrie-ne si rezolvam.' },
      { status: 500 },
    )
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(user.id)
  if (delErr) {
    console.error('[delete-account] stergerea contului de auth a esuat:', delErr.message)
    return NextResponse.json({ error: 'Datele s-au sters, dar contul a ramas. Scrie-ne si il stergem.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
