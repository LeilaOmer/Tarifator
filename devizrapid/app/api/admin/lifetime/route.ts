import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { verifyBearerUser } from '@/lib/apiAuth'
import { isAdminEmail } from '@/lib/admin'

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// Cauta userul dupa email in auth.users (sursa sigura — profiles.email poate fi gol).
async function findUserByEmail(admin: SupabaseClient, email: string): Promise<{ id: string; email: string } | null> {
  const target = email.trim().toLowerCase()
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error || !data) return null
    const found = data.users.find(u => (u.email || '').toLowerCase() === target)
    if (found) return { id: found.id, email: found.email || '' }
    if (data.users.length < 1000) break
  }
  return null
}

async function listLifetime(admin: SupabaseClient): Promise<{ id: string; email: string }[]> {
  const { data: rows } = await admin.from('profiles').select('id').eq('lifetime', true)
  if (!rows || rows.length === 0) return []
  const ids = new Set(rows.map(r => r.id))
  const out: { id: string; email: string }[] = []
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error || !data) break
    for (const u of data.users) if (ids.has(u.id)) out.push({ id: u.id, email: u.email || '' })
    if (data.users.length < 1000) break
  }
  return out
}

async function requireAdmin(req: NextRequest): Promise<{ error: NextResponse } | { admin: SupabaseClient }> {
  const user = await verifyBearerUser(req.headers.get('authorization'))
  if (!user) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  if (!isAdminEmail(user.email)) return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  const admin = adminClient()
  if (!admin) return { error: NextResponse.json({ error: 'server_config' }, { status: 500 }) }
  return { admin }
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req)
  if ('error' in gate) return gate.error
  const users = await listLifetime(gate.admin)
  return NextResponse.json({ admin: true, users })
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req)
  if ('error' in gate) return gate.error
  const admin = gate.admin

  const body = await req.json().catch(() => ({}))
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const grant = body.grant !== false // implicit true
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Email invalid.' }, { status: 400 })
  }

  const target = await findUserByEmail(admin, email)
  if (!target) {
    return NextResponse.json({ error: 'Nu exista cont cu acest email. Persoana trebuie sa-si faca intai cont.' }, { status: 404 })
  }

  // Nu suprascriem alte coloane: update daca profilul exista, altfel insert minimal.
  const { data: existing } = await admin.from('profiles').select('id').eq('id', target.id).maybeSingle()
  const res = existing
    ? await admin.from('profiles').update({ lifetime: grant }).eq('id', target.id)
    : await admin.from('profiles').insert({ id: target.id, account_type: 'artizan', lifetime: grant })
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 })

  return NextResponse.json({ success: true, email: target.email, grant })
}
