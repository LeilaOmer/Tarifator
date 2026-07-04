'use client'
import { useState, useEffect, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showResend, setShowResend] = useState(false)
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [acceptGdpr, setAcceptGdpr] = useState(false)
  const [acceptRetragere, setAcceptRetragere] = useState(false)
  const [acceptMarketing, setAcceptMarketing] = useState(false)
  const [promoRemaining, setPromoRemaining] = useState<number | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (mode !== 'signup') return
    fetch('/api/promo-status')
      .then(res => res.json())
      .then(data => { if (typeof data.remaining === 'number') setPromoRemaining(data.remaining) })
      .catch(() => {})
  }, [mode])

  async function forgotPassword() {
    setError(''); setSuccess('')
    if (!email) { setError('Introdu emailul intai, apoi apasa din nou.'); return }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-parola`,
    })
    if (error) setError('Nu s-a putut trimite emailul de resetare. Mai incearca in cateva minute.')
    else setSuccess('Ti-am trimis un email cu linkul de resetare a parolei. Verifica si folderul Spam.')
  }

  async function resendConfirmation() {
    setError(''); setSuccess('')
    if (!email) { setError('Introdu emailul intai.'); return }
    const { error } = await supabase.auth.resend({ type: 'signup', email })
    if (error) setError('Nu s-a putut retrimite emailul. Mai incearca in cateva minute.')
    else setSuccess('Am retrimis emailul de confirmare. Verifica inbox-ul (si folderul Spam).')
  }

  async function handleSubmit() {
    setError(''); setSuccess(''); setShowResend(false)
    if (!email || !password) { setError('Completeaza email si parola.'); return }
    if (password.length < 6) { setError('Parola trebuie sa aiba minim 6 caractere.'); return }
    if (mode === 'signup' && (!acceptTerms || !acceptGdpr || !acceptRetragere)) {
      setError('Trebuie sa accepti toate documentele obligatorii pentru a crea un cont.')
      return
    }
    setLoading(true)

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      setLoading(false)
      if (error) {
        if (error.message.toLowerCase().includes('confirm')) {
          setError('Emailul nu e confirmat inca. Verifica inbox-ul sau retrimite mai jos.')
          setShowResend(true)
        } else setError('Email sau parola incorecte.')
        return
      }
      router.push('/dashboard')
    } else {
      // Anti-abuz freemium: respinge emailuri temporare + acelasi Gmail cu +tag/puncte.
      const chk = await fetch('/api/check-signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
      }).then(r => r.json()).catch(() => ({ ok: true }))
      if (!chk.ok) { setLoading(false); setError(chk.error || 'Email invalid.'); return }

      const { data, error } = await supabase.auth.signUp({ email, password })
      setLoading(false)
      if (error) {
        if (error.message.includes('already registered') || error.message.includes('already exists')) {
          setError('Acest email este deja inregistrat. Incearca sa te autentifici.')
        } else if (error.message.includes('Invalid') || error.message.includes('path') || error.message.includes('URL')) {
          setError('Eroare de configurare server. Contacteaza administratorul.')
        } else {
          setError(error.message)
        }
        return
      }
      if (data.session) {
        router.push('/dashboard')
      } else {
        setSuccess('Cont creat! Verifica emailul pentru confirmare, apoi autentifica-te.')
        setShowResend(true)
        setMode('login')
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow-sm w-full max-w-sm p-8 space-y-5">

        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Tarifator" className="w-16 h-16 mx-auto mb-3 rounded-2xl shadow-sm" />
          <h1 className="text-3xl font-bold text-gray-900">Tarifator</h1>
          <p className="text-sm text-gray-500 mt-1">
            {mode === 'login' ? 'Autentificare' : 'Creare cont nou'}
          </p>
        </div>

        {mode === 'signup' && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-center space-y-0.5">
            <p className="text-xs font-bold text-green-600 uppercase tracking-wide">Oferta Early Adopter</p>
            <p className="text-sm font-semibold text-green-900">Primii 50 · abonament la pret redus</p>
            <p className="text-xs text-green-600">Prima luna gratuita, fara card la inscriere</p>
            {promoRemaining !== null && (
              <p className="text-xs font-bold text-green-700 pt-1">
                {promoRemaining > 0 ? `Mai sunt ${promoRemaining} locuri la pret redus` : 'Oferta s-a incheiat'}
              </p>
            )}
          </div>
        )}

        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Email</label>
          <input
            className="w-full border border-gray-200 rounded-xl px-4 py-3.5 text-base text-gray-900"
            placeholder="adresa@email.com"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Parola</label>
          <input
            className="w-full border border-gray-200 rounded-xl px-4 py-3.5 text-base text-gray-900"
            placeholder="minim 6 caractere"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          />
          {mode === 'login' && (
            <button onClick={forgotPassword} className="text-xs text-blue-600 font-medium mt-1.5">
              Ai uitat parola?
            </button>
          )}
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}
        {success && <p className="text-green-600 text-sm">{success}</p>}
        {showResend && (
          <button onClick={resendConfirmation} className="w-full py-2 text-sm font-semibold text-blue-600">
            Retrimite emailul de confirmare
          </button>
        )}

        <button onClick={handleSubmit} disabled={loading}
          className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl text-base disabled:bg-gray-300">
          {loading ? 'Se proceseaza...' : mode === 'login' ? 'Autentificare' : 'Creeaza cont'}
        </button>

        {mode === 'signup' && (
          <div className="space-y-3 pt-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Acorduri obligatorii</p>

            <ConsentCheck
              checked={acceptTerms}
              onChange={setAcceptTerms}
              required
              label={<>Am citit si accept <a href="/termeni" target="_blank" className="text-blue-600 underline">Termenii si Conditiile</a></>}
            />
            <ConsentCheck
              checked={acceptGdpr}
              onChange={setAcceptGdpr}
              required
              label={<>Am citit si accept <a href="/confidentialitate" target="_blank" className="text-blue-600 underline">Politica de Confidentialitate (GDPR)</a> si sunt de acord cu prelucrarea datelor mele personale in scopul furnizarii serviciului</>}
            />
            <ConsentCheck
              checked={acceptRetragere}
              onChange={setAcceptRetragere}
              required
              label={<>Am luat la cunostinta <a href="/retragere" target="_blank" className="text-blue-600 underline">Politica de Retragere si Rambursare</a>, inclusiv exceptia pentru servicii digitale cu executie imediata</>}
            />

            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-1">Optional</p>
            <ConsentCheck
              checked={acceptMarketing}
              onChange={setAcceptMarketing}
              label="Sunt de acord sa primesc comunicari comerciale despre Tarifator (noutati, oferte)"
            />
          </div>
        )}

        <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setSuccess(''); setShowResend(false) }}
          className="w-full py-2 text-sm text-gray-500 hover:text-gray-600">
          {mode === 'login' ? 'Nu ai cont? Creeaza unul' : 'Ai deja cont? Autentifica-te'}
        </button>

      </div>
    </div>
  )
}

function ConsentCheck({ checked, onChange, label, required }: {
  checked: boolean
  onChange: (v: boolean) => void
  label: ReactNode
  required?: boolean
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className={`mt-0.5 w-5 h-5 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
        checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300 group-hover:border-blue-400'
      }`} onClick={() => onChange(!checked)}>
        {checked && <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>}
      </div>
      <span className="text-xs text-gray-600 leading-relaxed">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
    </label>
  )
}
