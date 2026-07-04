'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { toast } from '@/lib/toast'

type LifetimeUser = { id: string; email: string }

export default function AdminPage() {
  const router = useRouter()
  const [state, setState] = useState<'loading' | 'ok' | 'denied'>('loading')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [users, setUsers] = useState<LifetimeUser[]>([])

  const token = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token
  }, [])

  const load = useCallback(async () => {
    const t = await token()
    if (!t) { router.push('/login'); return }
    const res = await fetch('/api/admin/lifetime', { headers: { Authorization: `Bearer ${t}` } })
    if (!res.ok) { setState('denied'); return }
    const data = await res.json()
    setUsers(data.users || [])
    setState('ok')
  }, [router, token])

  useEffect(() => { load() }, [load])

  async function setLifetime(grant: boolean, targetEmail?: string) {
    const em = (targetEmail ?? email).trim()
    if (!em) return
    setBusy(true)
    const t = await token()
    const res = await fetch('/api/admin/lifetime', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ email: em, grant }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { toast(data.error || 'Eroare'); return }
    toast(grant ? `Acces pe viata dat lui ${data.email}` : `Acces retras de la ${data.email}`, 'success')
    if (!targetEmail) setEmail('')
    load()
  }

  if (state === 'loading') {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">Se incarca...</p></div>
  }
  if (state === 'denied') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-gray-700 font-semibold">Nu ai acces la aceasta pagina.</p>
        <button onClick={() => router.push('/dashboard')} className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold">Inapoi</button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="max-w-lg mx-auto px-4 pt-6 space-y-5">
        <div>
          <button aria-label="Inapoi" onClick={() => router.push('/settings')} className="text-sm text-blue-600 font-medium">‹ Inapoi</button>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">Acces pe viata</h1>
          <p className="text-sm text-gray-500 mt-1">Da acces Pro gratuit, permanent, unor persoane — dupa email.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
          <label className="text-xs font-medium text-gray-700 block">Email persoana</label>
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="persoana@example.com"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900" />
          <button onClick={() => setLifetime(true)} disabled={busy || !email}
            className="w-full py-3 rounded-xl bg-green-600 text-white font-semibold text-sm disabled:bg-gray-300">
            {busy ? 'Se proceseaza...' : 'Da acces pe viata'}
          </button>
          <p className="text-xs text-gray-500">Persoana trebuie sa-si fi facut deja cont in aplicatie cu acest email.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Au acces pe viata ({users.length})</p>
          {users.length === 0 ? (
            <p className="text-sm text-gray-500">Nimeni inca.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {users.map(u => (
                <li key={u.id} className="flex items-center justify-between py-2.5 gap-3">
                  <span className="text-sm text-gray-800 truncate">{u.email || u.id}</span>
                  <button onClick={() => setLifetime(false, u.email)} disabled={busy}
                    className="text-xs font-semibold text-red-500 shrink-0">Retrage</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
