'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// Pagina pe care aterizeaza userul din linkul de resetare primit pe email.
// supabase-js detecteaza automat tokenul de recovery din URL si creeaza o
// sesiune temporara; aici doar setam parola noua cu updateUser.
export default function ResetParolaPage() {
  const router = useRouter()
  const [ready, setReady] = useState<'checking' | 'ok' | 'invalid'>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Tokenul din hash e procesat asincron de supabase-js la incarcarea paginii;
    // ascultam evenimentul si verificam si sesiunea direct (daca a fost deja procesat).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady('ok')
    })
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady('ok')
      // fara sesiune dupa 3s => link invalid/expirat
      else setTimeout(() => setReady(prev => (prev === 'checking' ? 'invalid' : prev)), 3000)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSave() {
    setError('')
    if (password.length < 6) { setError('Parola trebuie sa aiba minim 6 caractere.'); return }
    if (password !== confirm) { setError('Parolele nu coincid.'); return }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (error) { setError('Nu s-a putut schimba parola: ' + error.message); return }
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow-sm w-full max-w-sm p-8 space-y-5">
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Tarifator" className="w-16 h-16 mx-auto mb-3 rounded-2xl shadow-sm" />
          <h1 className="text-2xl font-bold text-gray-900">Parola noua</h1>
        </div>

        {ready === 'checking' && <p className="text-sm text-gray-500 text-center">Se verifica linkul...</p>}

        {ready === 'invalid' && (
          <div className="space-y-4 text-center">
            <p className="text-sm text-red-500">Linkul de resetare e invalid sau a expirat.</p>
            <button onClick={() => router.push('/login')} className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl text-sm">
              Inapoi la autentificare
            </button>
          </div>
        )}

        {ready === 'ok' && (
          <>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Parola noua</label>
              <input type="password" autoComplete="new-password" placeholder="minim 6 caractere"
                className="w-full border border-gray-200 rounded-xl px-4 py-3.5 text-base text-gray-900"
                value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Repeta parola</label>
              <input type="password" autoComplete="new-password" placeholder="aceeasi parola"
                className="w-full border border-gray-200 rounded-xl px-4 py-3.5 text-base text-gray-900"
                value={confirm} onChange={e => setConfirm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()} />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button onClick={handleSave} disabled={saving}
              className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl text-base disabled:bg-gray-300">
              {saving ? 'Se salveaza...' : 'Salveaza parola noua'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
