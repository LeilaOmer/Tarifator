'use client'

import { toast } from '@/lib/toast'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { getEffectiveLimits } from '@/lib/plan'
import { getMonthlyFise, getMonthlyCalcule } from '@/lib/usage'
import { PrimaryModule, setPrimaryModule } from '@/lib/module'
import { clearAccountLocal, ensureAccountLocal } from '@/lib/session'
import { useRouter } from 'next/navigation'

// Mesaj personal (de la tine), aratat O SINGURA DATA persoanei cu acces pe viata,
// la prima logare dupa ce i-ai dat accesul. Schimba textul cu cuvintele tale.
const LIFETIME_GREETING = {
  title: 'Mulțumesc din suflet.',
  body: 'Ai acces complet la Tarifator, gratuit, pe viață — pentru că mi-ai fost alături. E felul meu de a-ți spune că nu am uitat. Sper să-ți fie de folos.',
  sign: '— Leila',
}

interface Company {
  id: string
  name: string
  cui: string | null
}

export default function Dashboard() {
  const router = useRouter()
  const [plan, setPlan] = useState<'artizan' | 'pro' | null>(null)
  const [mode, setMode] = useState<'artizan' | 'pro'>('artizan')
  const [companies, setCompanies] = useState<Company[]>([])
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [artizanName, setArtizanName] = useState('')
  // Banda de consum: doar cand exista o limita finita de aratat (nu pre-lansare,
  // nu abonament nelimitat pe ambele module).
  const [usage, setUsage] = useState<{ fise: number; fiseLimit: number; calcule: number; calculeLimit: number; freemium: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [showWelcome, setShowWelcome] = useState(false)
  const [showLifetimeGreeting, setShowLifetimeGreeting] = useState(false)
  const uidRef = useRef<string>('')
  const [primaryModule, setPrimaryModuleValue] = useState<PrimaryModule | null>(null)
  const [choosingModule, setChoosingModule] = useState(false)
  const [fbOpen, setFbOpen] = useState(false)
  const [fbText, setFbText] = useState('')
  const [fbRecording, setFbRecording] = useState(false)
  const [fbSending, setFbSending] = useState(false)
  const [fbDone, setFbDone] = useState(false)
  const fbRecorderRef = useRef<MediaRecorder | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      ensureAccountLocal(session.user.id)

      let { data: prof } = await supabase
        .from('profiles').select('account_type, company_name, email, cui, address, phone, bank, iban, vat_rate, primary_module, lifetime').eq('id', session.user.id).single()
      if (!prof) {
        const { error: profInsertErr } = await supabase.from('profiles').insert({ id: session.user.id, account_type: 'artizan' })
        if (profInsertErr) console.error('Nu s-a putut crea profilul:', profInsertErr.message)
        router.push('/settings')
        return
      }

      const dbAccountType: 'artizan' | 'pro' = prof.account_type === 'pro' ? 'pro' : 'artizan'

      // Mesaj personal, o singura data, la persoana cu acces pe viata (per browser).
      uidRef.current = session.user.id
      if (prof.lifetime && typeof window !== 'undefined' && !localStorage.getItem('lifetimeGreeting_' + session.user.id)) {
        setShowLifetimeGreeting(true)
      }

      // Banda de consum apare doar cand macar un modul are limita finita —
      // pre-lansare (toti Pro) sau abonament complet nelimitat => nu o aratam.
      const limits = await getEffectiveLimits(session.user.id, session.user.created_at)
      if (Number.isFinite(limits.fise) || Number.isFinite(limits.calcule)) {
        const [fise, calcule] = await Promise.all([
          getMonthlyFise(session.user.id),
          getMonthlyCalcule(session.user.id),
        ])
        setUsage({ fise, fiseLimit: limits.fise, calcule, calculeLimit: limits.calcule, freemium: limits.freemium })
      }

      // Comutarea Artizan/Pro ramane libera pentru toata lumea — singura
      // restrictie reala e limita de 3 fise + 3 calcule/luna (lib/usage.ts),
      // identica in ambele moduri.
      const userPlan: 'artizan' | 'pro' = 'pro'
      setPlan(userPlan)

      const savedMode = localStorage.getItem('dashboardMode') as 'artizan' | 'pro' | null
      const activeMode: 'artizan' | 'pro' = userPlan === 'pro' && (savedMode === 'pro' || (savedMode === null && dbAccountType === 'pro')) ? 'pro' : 'artizan'
      setMode(activeMode)

      setArtizanName(prof.company_name || '')

      if (userPlan === 'pro') {
        let { data: cos } = await supabase.from('companies').select('id, name, cui').order('name')

        // Auto-creare firma din profil DOAR pentru conturi efectiv Pro — altfel
        // un cont Artizan (fara TVA/firme) ar capata pe tacute o firma nedorita.
        if ((!cos || cos.length === 0) && prof?.company_name && dbAccountType === 'pro') {
          const { data: newCo, error: newCoErr } = await supabase.from('companies').insert({
            user_id: session.user.id,
            name: prof.company_name,
            cui: prof.cui || null,
            address: prof.address || null,
            phone: prof.phone || null,
            email: session.user.email || null,
            bank: prof.bank || null,
            iban: prof.iban || null,
            vat_rate: prof.vat_rate || 0,
          }).select('id, name, cui').single()
          if (newCoErr) console.error('Nu s-a putut crea firma din profil:', newCoErr.message)
          if (newCo) cos = [newCo]
        }

        setCompanies(cos || [])
        const saved = localStorage.getItem('activeCompanyId')
        const match = cos?.find(c => c.id === saved)
        const active = match || cos?.[0] || null
        if (active) {
          setActiveCompanyId(active.id)
          if (activeMode === 'pro') setDisplayName(active.name)
          localStorage.setItem('activeCompanyId', active.id)
          localStorage.setItem('activeCompanyName', active.name)
        }
      }
      const chosenModule = (prof.primary_module as PrimaryModule | null) ?? null
      setPrimaryModuleValue(chosenModule)
      // Alegerea de modul (Mercator / Fise Servicii / Amandoua) inlocuieste
      // bannerul vechi de bun-venit — e persistenta in DB (primary_module),
      // nu doar in localStorage, ca sa nu reapara pe alt dispozitiv dupa ce a
      // fost aleasa deja, si sa apara sigur pentru orice cont nou.
      if (!chosenModule) setShowWelcome(true)
      setLoading(false)
    }
    load()
  }, [])

  function switchMode(newMode: 'artizan' | 'pro') {
    if (plan !== 'pro') return
    setMode(newMode)
    localStorage.setItem('dashboardMode', newMode)
    if (newMode === 'pro') {
      const active = companies.find(c => c.id === activeCompanyId) || companies[0]
      if (active) setDisplayName(active.name)
    }
  }

  async function chooseModule(value: PrimaryModule) {
    setChoosingModule(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      const { error } = await setPrimaryModule(session.user.id, value)
      if (error) { setChoosingModule(false); toast('Nu s-a salvat alegerea: ' + error); return }
    }
    setPrimaryModuleValue(value)
    setShowWelcome(false)
    setChoosingModule(false)
  }

  function selectCompany(id: string) {
    const company = companies.find(c => c.id === id)
    if (!company) return
    setActiveCompanyId(id)
    localStorage.setItem('activeCompanyId', id)
    localStorage.setItem('activeCompanyName', company.name)
    setDisplayName(company.name)
  }

  async function startFbVoice() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const chunks: BlobPart[] = []
    const rec = new MediaRecorder(stream)
    fbRecorderRef.current = rec
    rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
    rec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop())
      const blob = new Blob(chunks, { type: 'audio/webm' })
      const form = new FormData()
      form.append('file', blob, 'audio.webm')
      const { data: { session: fbSession } } = await supabase.auth.getSession()
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: fbSession?.access_token ? { 'Authorization': `Bearer ${fbSession.access_token}` } : {},
        body: form,
      })
      const { text } = await res.json()
      if (text) setFbText(prev => prev ? prev + ' ' + text : text)
      setFbRecording(false)
    }
    rec.start()
    setFbRecording(true)
  }

  function stopFbVoice() {
    fbRecorderRef.current?.stop()
  }

  async function sendFeedback() {
    if (!fbText.trim()) return
    setFbSending(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      const { error } = await supabase.from('feedback').insert({ user_id: session.user.id, message: fbText.trim() })
      if (error) { setFbSending(false); toast('Nu s-a trimis mesajul: ' + error.message); return }
    }
    setFbText('')
    setFbDone(true)
    setFbSending(false)
    setTimeout(() => { setFbDone(false); setFbOpen(false) }, 2000)
  }

  async function handleLogout() {
    clearAccountLocal()
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500">Se incarca...</p>
    </div>
  )

  const feedbackWidget = (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      {!fbOpen ? (
        <button onClick={() => setFbOpen(true)}
          className="w-full p-4 flex items-center gap-3 hover:bg-gray-50 active:scale-95 transition-all text-left">
          <svg className="w-5 h-5 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
          </svg>
          <div>
            <p className="font-semibold text-sm text-gray-900">Feedback</p>
            <p className="text-gray-500 text-xs">Ce am putea imbunatati?</p>
          </div>
        </button>
      ) : (
        <div className="p-4 space-y-3">
          {fbDone ? (
            <p className="text-sm font-semibold text-green-600 text-center py-3">Multumim! Am primit mesajul.</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Sugestie sau problema</p>
                <button onClick={() => { setFbOpen(false); setFbText('') }}
                  className="text-gray-400 hover:text-gray-500 text-xl leading-none">×</button>
              </div>
              <textarea
                value={fbText}
                onChange={e => setFbText(e.target.value)}
                placeholder="Spune-ne ce ai vrea sa fie diferit..."
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 resize-none focus:outline-none focus:border-blue-400"
              />
              <div className="flex gap-2">
                <button
                  onClick={fbRecording ? stopFbVoice : startFbVoice}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border-2 transition-all ${
                    fbRecording ? 'border-red-400 bg-red-50 text-red-600' : 'border-gray-200 text-gray-600 hover:border-blue-300'
                  }`}>
                  {fbRecording ? (
                    <>
                      <span className="w-2 h-2 rounded-sm bg-red-500 animate-pulse" />
                      Stop
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                      </svg>
                      Dicteaza
                    </>
                  )}
                </button>
                <button
                  onClick={sendFeedback}
                  disabled={fbSending || !fbText.trim()}
                  className="flex-1 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl disabled:bg-gray-300 transition-colors">
                  {fbSending ? 'Se trimite...' : 'Trimite'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )

  // Tile-uri partajate intre modul Pro si Artizan — extrase o singura data ca
  // sa nu dublam conditia de primaryModule in ambele ramuri de mai jos.
  const fisaVoceTile = (
    <a href="/quick"
      className="bg-blue-100 p-5 rounded-2xl shadow-sm hover:bg-blue-200 active:scale-95 transition-all flex flex-col min-h-[140px]">
      <svg className="w-7 h-7 mb-2.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
      </svg>
      <h2 className="font-bold text-lg leading-tight text-gray-900">Fisa Servicii Voce</h2>
      <p className="text-blue-700 text-xs mt-1">Dicteaza si genereaza instant</p>
    </a>
  )

  const mercatorTile = (
    <a href="/pricing"
      className="bg-amber-100 p-5 rounded-2xl shadow-sm hover:bg-amber-200 active:scale-95 transition-all flex flex-col min-h-[140px]">
      <svg className="w-7 h-7 mb-2.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
      </svg>
      <h2 className="font-bold text-lg leading-tight text-gray-900">Calculator Pret</h2>
      <p className="text-amber-700 text-xs mt-1">Adaos · TVA · PDF</p>
    </a>
  )

  const calculePretTile = (
    <a href="/calcule" className="bg-white p-4 rounded-2xl shadow-sm hover:shadow active:scale-95 transition-all flex items-center gap-3">
      <span className="text-xl">💾</span>
      <div>
        <p className="font-semibold text-sm text-gray-900">Calcule Pret</p>
        <p className="text-gray-500 text-xs">Calcule salvate</p>
      </div>
    </a>
  )

  const serviciiTile = (
    <a href="/services" className="bg-white p-4 rounded-2xl shadow-sm hover:shadow active:scale-95 transition-all flex items-center gap-3">
      <span className="text-xl">🔧</span>
      <div>
        <p className="font-semibold text-sm text-gray-900">Servicii</p>
        <p className="text-gray-500 text-xs">Lista de servicii</p>
      </div>
    </a>
  )

  const clientiTile = (
    <a href="/clients" className="bg-white p-4 rounded-2xl shadow-sm hover:shadow active:scale-95 transition-all flex items-center gap-3">
      <span className="text-xl">👥</span>
      <div>
        <p className="font-semibold text-sm text-gray-900">Clienti</p>
        <p className="text-gray-500 text-xs">Lista de clienti</p>
      </div>
    </a>
  )

  const socialTile = (
    <a href="/social" className="bg-white p-4 rounded-2xl shadow-sm hover:shadow active:scale-95 transition-all flex items-center gap-3">
      <span className="text-xl">🎬</span>
      <div>
        <p className="font-semibold text-sm text-gray-900">Continut social</p>
        <p className="text-gray-500 text-xs">Idei TikTok / Reels</p>
      </div>
    </a>
  )

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {showLifetimeGreeting && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6"
          onClick={() => { localStorage.setItem('lifetimeGreeting_' + uidRef.current, '1'); setShowLifetimeGreeting(false) }}>
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 text-center space-y-4" onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" className="w-14 h-14 rounded-2xl mx-auto" />
            <h2 className="text-xl font-bold text-gray-900">{LIFETIME_GREETING.title}</h2>
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{LIFETIME_GREETING.body}</p>
            <p className="text-sm font-semibold text-gray-800">{LIFETIME_GREETING.sign}</p>
            <button onClick={() => { localStorage.setItem('lifetimeGreeting_' + uidRef.current, '1'); setShowLifetimeGreeting(false) }}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm">Mulțumesc</button>
          </div>
        </div>
      )}
      <div className="max-w-lg mx-auto px-4 space-y-3">

        {/* Header */}
        <div className="flex justify-between items-center pt-5 pb-1">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="Tarifator" className="w-11 h-11 rounded-2xl shadow-sm shrink-0" />
            <div>
              <h1 className="text-3xl font-black text-gray-900 tracking-tight leading-none">Tarifator</h1>
              {mode === 'pro' && companies.length > 0 ? (
                <select
                  value={activeCompanyId || ''}
                  onChange={e => selectCompany(e.target.value)}
                  className="text-sm font-bold text-purple-600 bg-transparent border-0 p-0 focus:ring-0 focus:outline-none cursor-pointer max-w-[220px] mt-0.5 block">
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              ) : artizanName ? (
                <p className="text-base font-bold text-gray-700 truncate max-w-[220px] mt-0.5">{artizanName}</p>
              ) : (
                <a href="/settings" className="text-xs font-semibold text-blue-500 mt-0.5 inline-block">+ Adauga numele tau →</a>
              )}
            </div>
          </div>
          <div className="flex gap-4 items-center">
            <a href="/settings" className="text-sm text-gray-500 hover:text-gray-700">Setari</a>
            <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-700">Iesi</button>
          </div>
        </div>

        {/* Consum lunar — doar cand macar un modul are limita finita (nu pre-lansare) */}
        {usage && (
          <div className="px-4 py-2 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-between gap-3">
            <div className="flex gap-4 text-xs">
              <span className="text-gray-500">Fise: <strong className={Number.isFinite(usage.fiseLimit) && usage.fise >= usage.fiseLimit ? 'text-red-600' : 'text-gray-800'}>{Number.isFinite(usage.fiseLimit) ? `${usage.fise}/${usage.fiseLimit}` : 'nelimitat'}</strong></span>
              <span className="text-gray-500">Calcule: <strong className={Number.isFinite(usage.calculeLimit) && usage.calcule >= usage.calculeLimit ? 'text-red-600' : 'text-gray-800'}>{Number.isFinite(usage.calculeLimit) ? `${usage.calcule}/${usage.calculeLimit}` : 'nelimitat'}</strong></span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {usage.freemium && <span className="text-[10px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded">Prima luna</span>}
              <a href="/upgrade" className="text-xs font-bold text-blue-600">Upgrade →</a>
            </div>
          </div>
        )}

        {/* Onboarding — prima vizita: alegere de modul, inlocuieste vechiul banner */}
        {showWelcome && (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-4 space-y-3">
            <p className="text-sm font-bold text-blue-900 flex items-center gap-1.5">
              <span className="text-lg">👋</span> Bine ai venit la Tarifator! Ce ai nevoie in primul rand?
            </p>
            <div className="space-y-2">
              <button onClick={() => chooseModule('calculator')} disabled={choosingModule}
                className="w-full text-left bg-white rounded-xl px-4 py-3 hover:bg-blue-100/50 active:scale-95 transition-all disabled:opacity-50">
                <p className="text-sm font-bold text-gray-900">🧮 Calculator de Pret</p>
                <p className="text-xs text-gray-500 mt-0.5">Calculez preturi de vanzare din facturi de furnizor</p>
              </button>
              <button onClick={() => chooseModule('fise')} disabled={choosingModule}
                className="w-full text-left bg-white rounded-xl px-4 py-3 hover:bg-blue-100/50 active:scale-95 transition-all disabled:opacity-50">
                <p className="text-sm font-bold text-gray-900">📋 Fise Servicii</p>
                <p className="text-xs text-gray-500 mt-0.5">Fac fise de servicii pentru clienti</p>
              </button>
              <button onClick={() => chooseModule('both')} disabled={choosingModule}
                className="w-full text-left text-xs font-semibold text-blue-500 hover:text-blue-700 px-4 py-1.5">
                Nu stiu inca / am nevoie de amandoua →
              </button>
            </div>
          </div>
        )}

        {(() => {
          const fiseServiciiTile = (
            <a href={mode === 'pro' && activeCompanyId ? `/companies/${activeCompanyId}/quotes` : '/quotes'}
              className="bg-white p-4 rounded-2xl shadow-sm hover:shadow active:scale-95 transition-all flex items-center gap-3">
              <span className="text-xl">📋</span>
              <div>
                <p className="font-semibold text-sm text-gray-900">Fise Servicii</p>
                <p className="text-gray-500 text-xs truncate">
                  {mode === 'pro'
                    ? (activeCompanyId ? (companies.find(c => c.id === activeCompanyId)?.name || 'Firma curenta') : 'Toate fisele')
                    : 'Creeaza si gestioneaza'}
                </p>
              </div>
            </a>
          )

          return (
            <>
              {primaryModule === 'calculator' ? (
                <>
                  {/* Modul principal: Calculator Pret. Fisele raman accesibile, dar comprimate intr-un singur link. */}
                  <div className="grid grid-cols-1 gap-3">{mercatorTile}</div>
                  <div className="grid grid-cols-2 gap-3">{calculePretTile}{socialTile}</div>
                  <a href="/quotes" className="flex items-center justify-between bg-white rounded-2xl shadow-sm px-4 py-3 hover:shadow active:scale-95 transition-all">
                    <span className="text-sm font-semibold text-gray-500">📋 Vezi si Fise Servicii</span>
                    <span className="text-gray-400">→</span>
                  </a>
                </>
              ) : primaryModule === 'fise' ? (
                <>
                  {/* Modul principal: Fise Servicii. Calculatorul ramane accesibil, comprimat intr-un singur link. */}
                  <div className="grid grid-cols-1 gap-3">{fisaVoceTile}</div>
                  <div className="grid grid-cols-2 gap-3">
                    {fiseServiciiTile}
                    {serviciiTile}
                    {clientiTile}
                    {socialTile}
                  </div>
                  <a href="/pricing" className="flex items-center justify-between bg-white rounded-2xl shadow-sm px-4 py-3 hover:shadow active:scale-95 transition-all">
                    <span className="text-sm font-semibold text-gray-500">🧮 Vezi si Calculator Pret</span>
                    <span className="text-gray-400">→</span>
                  </a>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">{fisaVoceTile}{mercatorTile}</div>
                  <div className="grid grid-cols-2 gap-3">
                    {fiseServiciiTile}
                    {calculePretTile}
                    {serviciiTile}
                    {clientiTile}
                    {socialTile}
                  </div>
                </>
              )}

              {feedbackWidget}

              {mode === 'pro' ? (
                <button onClick={() => switchMode('artizan')}
                  className="w-full py-3 rounded-2xl border border-gray-200 bg-white text-sm font-medium text-gray-500 hover:text-gray-600 hover:bg-gray-50 transition-all">
                  Comuta pe Simplu (fara TVA)
                </button>
              ) : plan === 'pro' && (
                <button onClick={() => switchMode('pro')}
                  className="w-full py-3 rounded-2xl border border-gray-200 bg-white text-sm font-medium text-gray-500 hover:text-gray-600 hover:bg-gray-50 transition-all">
                  Comuta pe Firma (cu TVA, mai multe firme)
                </button>
              )}
            </>
          )
        })()}

      </div>
    </div>
  )
}
