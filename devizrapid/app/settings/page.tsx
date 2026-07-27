'use client'

import { toast } from '@/lib/toast'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { anafLookup } from '@/lib/anaf'
import { PrimaryModule, setPrimaryModule } from '@/lib/module'
import { PlanTier, TIER_LABELS, getEffectiveLimits } from '@/lib/plan'
import { getMonthlyFise, getMonthlyCalcule } from '@/lib/usage'
import { isAdminEmail } from '@/lib/admin'
import { clearAccountLocal } from '@/lib/session'
import { myConsents } from '@/lib/consents'
import { useRouter } from 'next/navigation'

interface Company {
  id: string
  name: string
  cui: string | null
  reg_com: string | null
  address: string | null
  phone: string | null
  email: string | null
  bank: string | null
  iban: string | null
  vat_rate: number
}

const emptyCompany = (): Omit<Company, 'id'> => ({
  name: '', cui: '', reg_com: '', address: '',
  phone: '', email: '', bank: '', iban: '', vat_rate: 21
})

export default function SettingsPage() {
  const router = useRouter()
  const [companies, setCompanies] = useState<Company[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState(emptyCompany())
  const [accountType, setAccountType] = useState<'artizan' | 'pro'>('artizan')
  const [primaryModule, setPrimaryModuleState] = useState<PrimaryModule>('both')
  const [sub, setSub] = useState<{ tier: PlanTier; fise: number; fiseLimit: number; calcule: number; calculeLimit: number; prelaunch: boolean; freemium: boolean; lifetime: boolean } | null>(null)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [pendingCompanyId, setPendingCompanyId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState('')
  const [planActiveUntil, setPlanActiveUntil] = useState<string | null>(null)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [profileForm, setProfileForm] = useState({ company_name: '', cui: '', phone: '', address: '', vat_rate: 21 })
  const [profileEditing, setProfileEditing] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [profileAnafLoading, setProfileAnafLoading] = useState(false)
  const [profileAnafError, setProfileAnafError] = useState('')
  const [pwOpen, setPwOpen] = useState(false)
  const [pwValue, setPwValue] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    const user = session.user
    setUserEmail(user.email || '')
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (prof) {
      setAccountType(prof.account_type || 'artizan')
      setPrimaryModuleState((prof.primary_module as PrimaryModule | null) || 'both')
      setPlanActiveUntil(prof.plan_active_until || null)
      setProfileForm({
        company_name: prof.company_name || '',
        cui: prof.cui || '',
        phone: prof.phone || '',
        address: prof.address || '',
        vat_rate: typeof prof.vat_rate === 'number' ? prof.vat_rate : 21,
      })
    }
    const { data: cos } = await supabase.from('companies').select('*').order('name')
    setCompanies(cos || [])

    const limits = await getEffectiveLimits(user.id, user.created_at)
    const [fise, calcule] = await Promise.all([getMonthlyFise(user.id), getMonthlyCalcule(user.id)])
    setSub({ tier: limits.tier, fise, fiseLimit: limits.fise, calcule, calculeLimit: limits.calcule, prelaunch: limits.prelaunch, freemium: limits.freemium, lifetime: limits.lifetime })

    setLoading(false)
  }

  async function saveProfile() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { error } = await supabase.from('profiles').update(profileForm).eq('id', session.user.id)
    if (error) { toast('Nu s-a salvat: ' + error.message); return }
    setProfileSaved(true)
    setProfileEditing(false)
    setTimeout(() => setProfileSaved(false), 2000)
  }

  async function lookupAnafProfile() {
    if (!profileForm.cui) return
    setProfileAnafLoading(true)
    setProfileAnafError('')
    try {
      const cui = profileForm.cui.replace(/[^0-9]/g, '')
      const { ok, data } = await anafLookup(cui)
      if (!ok) { setProfileAnafError(data.error || 'Eroare ANAF'); return }
      setProfileForm(f => ({
        ...f,
        company_name: data.name || f.company_name,
        address: data.address || f.address,
        vat_rate: typeof data.scpTva === 'boolean' ? (data.scpTva ? (f.vat_rate || 21) : 0) : f.vat_rate,
      }))
    } catch {
      setProfileAnafError('Eroare conexiune')
    } finally {
      setProfileAnafLoading(false)
    }
  }

  // Export GDPR: toate datele userului intr-un JSON descarcabil. Query-urile trec
  // prin RLS, deci ies DOAR randurile contului curent.
  async function exportMyData() {
    setExporting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const [profile, cos, clients, services, quotes, drafts, consents] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', session.user.id).single(),
        supabase.from('companies').select('*'),
        supabase.from('clients').select('*'),
        supabase.from('services').select('*'),
        supabase.from('quotes').select('*, quote_items(*)'),
        supabase.from('pricing_drafts').select('*'),
        myConsents(session.user.id),
      ])
      const payload = {
        exportat_la: new Date().toISOString(),
        cont: { email: session.user.email, creat_la: session.user.created_at },
        profil: profile.data ?? null,
        firme: cos.data ?? [],
        clienti: clients.data ?? [],
        servicii: services.data ?? [],
        fise: quotes.data ?? [],
        calcule_salvate: drafts.data ?? [],
        // Dreptul de acces acopera si dovada consimtamintelor date.
        consimtaminte: consents,
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `tarifator-datele-mele-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(a.href)
      toast('Datele au fost exportate.', 'success')
    } catch {
      toast('Nu s-a putut genera exportul. Incearca din nou.')
    } finally {
      setExporting(false)
    }
  }

  async function changePassword() {
    setPwError('')
    if (pwValue.length < 6) { setPwError('Parola trebuie sa aiba minim 6 caractere.'); return }
    setPwSaving(true)
    const { error } = await supabase.auth.updateUser({ password: pwValue })
    setPwSaving(false)
    if (error) { setPwError('Nu s-a putut schimba parola: ' + error.message); return }
    setPwOpen(false); setPwValue('')
    toast('Parola a fost schimbata.', 'success')
  }

  async function saveAccountType(type: 'artizan' | 'pro') {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { error } = await supabase.from('profiles').update({ account_type: type }).eq('id', session.user.id)
    if (error) { toast('Nu s-a putut schimba tipul de cont: ' + error.message); return }
    setAccountType(type)
    localStorage.setItem('dashboardMode', type)
    if (type === 'artizan') {
      localStorage.removeItem('activeCompanyId')
      localStorage.removeItem('activeCompanyName')
    }
  }

  async function saveModule(value: PrimaryModule) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { error } = await setPrimaryModule(session.user.id, value)
    if (error) { toast('Nu s-a putut schimba modulul principal: ' + error); return }
    setPrimaryModuleState(value)
  }

  async function saveCompany() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session || !form.name.trim()) return
    const user = session.user
    if (editing === 'new') {
      const { data: newCompany, error } = await supabase.from('companies').insert({ ...form, user_id: user.id }).select().single()
      if (error) { toast('Nu s-a putut adauga firma: ' + error.message); return }
      if (newCompany) {
        const { data: existingServices } = await supabase.from('services').select('*').eq('user_id', user.id).is('company_id', null)
        if (existingServices && existingServices.length > 0) {
          setPendingCompanyId(newCompany.id)
          setEditing(null)
          setSaved(true)
          setTimeout(() => setSaved(false), 2000)
          load()
          return
        }
      }
    } else {
      const { error } = await supabase.from('companies').update(form).eq('id', editing!)
      if (error) { toast('Nu s-a salvat firma: ' + error.message); return }
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    setEditing(null)
    load()
  }

  async function handleCopyServices(copy: boolean) {
    if (copy && pendingCompanyId) {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: existingServices } = await supabase.from('services').select('*').eq('user_id', session.user.id).is('company_id', null)
      if (existingServices && existingServices.length > 0) {
        const { error } = await supabase.from('services').insert(existingServices.map(s => ({
          user_id: session.user.id,
          company_id: pendingCompanyId,
          name: s.name,
          unit: s.unit,
          price_per_unit: s.price_per_unit
        })))
        if (error) toast('Firma s-a creat, dar nu s-au putut copia serviciile: ' + error.message)
      }
    }
    setPendingCompanyId(null)
  }

  async function createCompanyFromProfile() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session || !profileForm.company_name.trim()) return
    const { error } = await supabase.from('companies').insert({
      user_id: session.user.id,
      name: profileForm.company_name,
      cui: profileForm.cui || null,
      address: profileForm.address || null,
      phone: profileForm.phone || null,
      email: userEmail || null,
      vat_rate: profileForm.vat_rate || 0,
    })
    if (error) { toast('Nu s-a putut adauga firma: ' + error.message); return }
    load()
  }

  async function deleteCompany(id: string) {
    if (!confirm('Stergi firma? Fisele asociate raman dar fara firma.')) return
    const { error } = await supabase.from('companies').delete().eq('id', id)
    if (error) { toast('Nu s-a putut sterge firma: ' + error.message); return }
    load()
  }

  async function handleDeleteAccount() {
    setDeletingAccount(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setDeletingAccount(false); return }
    const res = await fetch('/api/delete-account', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (res.ok) {
      clearAccountLocal()
      await supabase.auth.signOut()
      router.push('/login')
    } else {
      const { error } = await res.json()
      toast('Eroare la stergere: ' + (error || 'necunoscuta'))
      setDeletingAccount(false)
      setShowDeleteModal(false)
    }
  }

  function startEdit(c: Company) {
    setForm({ name: c.name, cui: c.cui||'', reg_com: c.reg_com||'', address: c.address||'',
      phone: c.phone||'', email: c.email||'', bank: c.bank||'', iban: c.iban||'', vat_rate: c.vat_rate })
    setEditing(c.id)
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">Se incarca...</p></div>

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <button aria-label="Inapoi" onClick={() => router.push('/dashboard')} className="flex items-center gap-2 text-blue-600 font-medium text-base py-1 px-2 -ml-2 rounded-lg">
          <span className="text-xl">‹</span> Dashboard
        </button>
        <h1 className="text-base font-bold text-gray-800">Setari</h1>
        <div className="w-20" />
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-5">

        {/* Abonament — card clar, sus */}
        {sub && (
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Abonament</p>
                <p className="text-lg font-black text-gray-900 mt-0.5">
                  {sub.lifetime ? 'Pro' : sub.prelaunch ? 'Pro' : TIER_LABELS[sub.tier]}
                  {sub.lifetime && <span className="text-xs font-semibold text-green-600 ml-2">acces gratuit pe viata</span>}
                  {!sub.lifetime && sub.prelaunch && <span className="text-xs font-semibold text-green-600 ml-2">gratuit · perioada de lansare</span>}
                  {!sub.lifetime && !sub.prelaunch && sub.freemium && <span className="text-xs font-semibold text-green-600 ml-2">prima luna gratuita</span>}
                </p>
                {planActiveUntil && new Date(planActiveUntil) > new Date() && sub.tier !== 'free' && !sub.prelaunch && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Activ pana la {new Date(planActiveUntil).toLocaleDateString('ro-RO')}
                    <button onClick={() => setShowCancelModal(true)} className="text-amber-600 hover:text-amber-800 font-semibold ml-2">Anuleaza</button>
                  </p>
                )}
              </div>
              <a href="/upgrade" className="text-xs font-bold text-blue-600 shrink-0 bg-blue-50 px-3 py-2 rounded-xl whitespace-nowrap">Schimba abonament</a>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="bg-gray-50 rounded-xl px-3 py-2.5">
                <p className="text-xs text-gray-500">Fise Servicii (luna asta)</p>
                <p className={`text-sm font-bold ${Number.isFinite(sub.fiseLimit) && sub.fise >= sub.fiseLimit ? 'text-red-600' : 'text-gray-800'}`}>
                  {Number.isFinite(sub.fiseLimit) ? `${sub.fise} / ${sub.fiseLimit}` : 'Nelimitat'}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl px-3 py-2.5">
                <p className="text-xs text-gray-500">Calcule Pret (luna asta)</p>
                <p className={`text-sm font-bold ${Number.isFinite(sub.calculeLimit) && sub.calcule >= sub.calculeLimit ? 'text-red-600' : 'text-gray-800'}`}>
                  {Number.isFinite(sub.calculeLimit) ? `${sub.calcule} / ${sub.calculeLimit}` : 'Nelimitat'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Mod de lucru — comutatorul TVA/firme (NU abonamentul) */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Mod de lucru</p>
          <p className="text-xs text-gray-500 mb-3">Nu tine de abonament — poate fi schimbat oricand.</p>
          <div className="grid grid-cols-2 gap-3">
            {([
              { type: 'artizan' as const, icon: '🔨', label: 'Simplu', desc: 'Fara TVA · o firma' },
              { type: 'pro' as const, icon: '🏢', label: 'Firma', desc: 'Cu TVA · mai multe firme' },
            ]).map(o => (
              <button key={o.type} onClick={() => saveAccountType(o.type)}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  accountType === o.type
                    ? o.type === 'pro' ? 'border-purple-500 bg-purple-50' : 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white'
                }`}>
                <span className="text-2xl">{o.icon}</span>
                <span className={`text-sm font-bold ${accountType === o.type ? (o.type === 'pro' ? 'text-purple-700' : 'text-blue-700') : 'text-gray-700'}`}>
                  {o.label}
                </span>
                <span className="text-xs text-gray-500 text-center">{o.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Modul principal */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Modul principal pe dashboard</p>
          <div className="grid grid-cols-3 gap-2">
            {([
              { value: 'calculator', icon: '🧮', label: 'Calculator Pret' },
              { value: 'fise', icon: '📋', label: 'Fise Servicii' },
              { value: 'both', icon: '✨', label: 'Amandoua' },
            ] as const).map(opt => (
              <button key={opt.value} onClick={() => saveModule(opt.value)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                  primaryModule === opt.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'
                }`}>
                <span className="text-xl">{opt.icon}</span>
                <span className={`text-xs font-bold text-center ${primaryModule === opt.value ? 'text-blue-700' : 'text-gray-700'}`}>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Firme — doar Pro */}
        {accountType === 'pro' && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Firmele mele</p>
              {editing !== 'new' && (
                <button onClick={() => { setForm(emptyCompany()); setEditing('new') }}
                  className="text-sm font-semibold text-blue-600">+ Adauga</button>
              )}
            </div>
            {companies.map(c => (
              <div key={c.id}>
                <div className="px-5 py-4 flex items-center justify-between border-b border-gray-50">
                  <div>
                    <a href={`/companies/${c.id}/quotes`} className="text-sm font-bold text-gray-900 hover:text-blue-600">{c.name}</a>
                    {c.cui && <p className="text-xs text-gray-500">CUI: {c.cui}</p>}
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => startEdit(c)} className="text-sm text-blue-600">Editeaza</button>
                    <button onClick={() => deleteCompany(c.id)} className="text-sm text-red-400">Sterge</button>
                  </div>
                </div>
                {editing === c.id && <CompanyForm form={form} setForm={setForm} onSave={saveCompany} onCancel={() => setEditing(null)} saved={saved} />}
              </div>
            ))}
            {companies.length === 0 && editing !== 'new' && (
              <p className="px-5 py-4 text-sm text-gray-500">Nicio firma adaugata.</p>
            )}
            {editing !== 'new' && profileForm.company_name.trim() &&
              !companies.some(c => c.cui && profileForm.cui && c.cui === profileForm.cui) && (
              <div className="px-5 py-3 border-b border-gray-50 border-t border-gray-50 bg-blue-50/50">
                <button onClick={createCompanyFromProfile} className="text-sm font-semibold text-blue-600">
                  + Adauga „{profileForm.company_name}" (firma contului) in lista
                </button>
                <p className="text-xs text-gray-500 mt-0.5">Ca sa poti emite fise pe firma cu care ti-ai creat contul.</p>
              </div>
            )}
            {editing === 'new' && (
              <CompanyForm form={form} setForm={setForm} onSave={saveCompany} onCancel={() => setEditing(null)} saved={saved} />
            )}
          </div>
        )}

        {/* Contul meu */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Contul meu</p>
            {!profileEditing && (
              <button onClick={() => setProfileEditing(true)} className="text-sm font-semibold text-blue-600">
                Editeaza
              </button>
            )}
          </div>

          <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Email cont</p>
              <p className="text-sm font-semibold text-gray-800">{userEmail}</p>
            </div>
            <button onClick={() => { setPwOpen(v => !v); setPwValue(''); setPwError('') }}
              className="text-sm font-semibold text-blue-600 shrink-0">
              Schimba parola
            </button>
          </div>

          {pwOpen && (
            <div className="px-5 py-3 border-b border-gray-50 space-y-2">
              <input type="password" autoComplete="new-password" placeholder="Parola noua (minim 6 caractere)"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900"
                value={pwValue} onChange={e => setPwValue(e.target.value)} />
              {pwError && <p className="text-xs text-red-500">{pwError}</p>}
              <button onClick={changePassword} disabled={pwSaving}
                className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold disabled:bg-gray-300">
                {pwSaving ? 'Se salveaza...' : 'Salveaza parola noua'}
              </button>
            </div>
          )}

          {isAdminEmail(userEmail) && (
            <div className="px-5 py-3 border-b border-gray-50">
              <button onClick={() => router.push('/admin')} className="text-sm font-semibold text-blue-600">
                Administrare acces pe viata →
              </button>
            </div>
          )}

          {!profileEditing ? (
            <div className="divide-y divide-gray-50">
              {[
                { label: 'Nume / Brand', value: profileForm.company_name },
                { label: 'CUI / CIF', value: profileForm.cui },
                { label: 'Telefon', value: profileForm.phone },
                { label: 'Adresa', value: profileForm.address },
              ].map(({ label, value }) => (
                <div key={label} className="px-5 py-3">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="text-sm font-semibold text-gray-800">{value || <span className="text-gray-400 font-normal">—</span>}</p>
                </div>
              ))}
              <div className="px-5 py-3">
                <p className="text-xs text-gray-500">Regim TVA</p>
                <p className="text-sm font-semibold text-gray-800">
                  {profileForm.vat_rate === 0 ? 'Non-platitor TVA' : `Platitor TVA (${profileForm.vat_rate}%)`}
                </p>
              </div>
              {profileSaved && <p className="px-5 py-2 text-xs text-green-600 font-semibold">✓ Salvat!</p>}
            </div>
          ) : (
            <div className="px-5 py-4 space-y-3 bg-gray-50">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">CUI / CIF</label>
                <div className="flex gap-2">
                  <input
                    className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white"
                    placeholder="RO12345678"
                    value={profileForm.cui}
                    onChange={e => { setProfileForm({ ...profileForm, cui: e.target.value }); setProfileAnafError('') }}
                  />
                  <button onClick={lookupAnafProfile} disabled={profileAnafLoading || !profileForm.cui}
                    className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold disabled:bg-gray-300 shrink-0 whitespace-nowrap">
                    {profileAnafLoading ? '...' : 'Cauta ANAF'}
                  </button>
                </div>
                {profileAnafError && <p className="text-xs text-red-500 mt-1">{profileAnafError}</p>}
              </div>
              {[
                { key: 'company_name', label: 'Nume / Brand', placeholder: 'Ex: Ion Instalatii', type: 'text', inputMode: 'text' },
                { key: 'phone', label: 'Telefon', placeholder: '07xx xxx xxx', type: 'tel', inputMode: 'tel' },
                { key: 'address', label: 'Adresa', placeholder: 'Str. Exemplu nr. 1', type: 'text', inputMode: 'text' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">{f.label}</label>
                  <input
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white"
                    placeholder={f.placeholder}
                    type={f.type}
                    inputMode={f.inputMode as React.HTMLAttributes<HTMLInputElement>['inputMode']}
                    autoCapitalize={f.type === 'email' || f.type === 'tel' ? 'none' : 'sentences'}
                    autoCorrect="off"
                    value={profileForm[f.key as keyof Omit<typeof profileForm, 'vat_rate' | 'cui'>] as string}
                    onChange={e => setProfileForm({ ...profileForm, [f.key]: e.target.value })}
                  />
                </div>
              ))}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Regim TVA</label>
                <div className="flex rounded-xl overflow-hidden border border-gray-200">
                  <button onClick={() => setProfileForm({ ...profileForm, vat_rate: 21 })}
                    className={`flex-1 py-2.5 text-sm font-bold transition-all ${profileForm.vat_rate !== 0 ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>
                    Platitor TVA
                  </button>
                  <button onClick={() => setProfileForm({ ...profileForm, vat_rate: 0 })}
                    className={`flex-1 py-2.5 text-sm font-bold transition-all ${profileForm.vat_rate === 0 ? 'bg-orange-500 text-white' : 'bg-white text-gray-600'}`}>
                    Non-platitor
                  </button>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setProfileEditing(false)}
                  className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600">
                  Anuleaza
                </button>
                <button onClick={saveProfile}
                  className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold">
                  Salveaza
                </button>
              </div>
            </div>
          )}

          <div className="px-5 py-3 border-b border-gray-50">
            <p className="text-xs text-gray-500 mb-2">Documente legale</p>
            <div className="space-y-2">
              {[
                { href: '/termeni', label: 'Termeni si Conditii' },
                { href: '/confidentialitate', label: 'Politica de Confidentialitate (GDPR)' },
                { href: '/retragere', label: 'Drept de Retragere · Rambursare · Anulare' },
              ].map(({ href, label }) => (
                <a key={href} href={href}
                  className="flex items-center justify-between text-sm text-blue-600 hover:text-blue-800 py-0.5">
                  {label}
                  <span className="text-gray-400 ml-2">→</span>
                </a>
              ))}
            </div>
          </div>

          <div className="px-5 py-3 border-b border-gray-50">
            <button onClick={exportMyData} disabled={exporting}
              className="text-sm font-semibold text-blue-600 disabled:text-gray-400">
              {exporting ? 'Se pregateste exportul...' : 'Exporta datele mele'}
            </button>
            <p className="text-xs text-gray-500 mt-0.5">Descarci un fisier JSON cu toate datele tale (GDPR).</p>
          </div>

          <div className="px-5 py-3">
            <button onClick={() => setShowDeleteModal(true)}
              className="text-sm font-semibold text-red-500 hover:text-red-700">
              Sterge contul
            </button>
            <p className="text-xs text-gray-500 mt-0.5">Toate datele tale vor fi sterse definitiv.</p>
          </div>
        </div>

      </div>

      {/* Modal copiere servicii */}
      {pendingCompanyId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl p-6 shadow-xl max-w-sm w-full mx-4 space-y-4">
            <p className="text-sm font-semibold text-gray-800">Copiez nomenclatorul de servicii existent pentru aceasta firma?</p>
            <div className="flex gap-3">
              <button onClick={() => handleCopyServices(false)} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600">Nu</button>
              <button onClick={() => handleCopyServices(true)} className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-semibold">Da</button>
            </div>
          </div>
        </div>
      )}

      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl p-6 shadow-xl max-w-sm w-full space-y-4">
            <h2 className="font-bold text-gray-900">Anulare abonament</h2>
            <p className="text-sm text-gray-600">Trimite un email la adresa de mai jos cu subiectul <strong>"Anulare abonament"</strong>. Accesul continua pana la expirarea perioadei platite.</p>
            <a href={`mailto:contact.tarifator@gmail.com?subject=Anulare%20abonament&body=Doresc%20anularea%20abonamentului%20pentru%20contul%3A%20${encodeURIComponent(userEmail)}`}
              className="block w-full py-3 bg-amber-500 text-white font-bold rounded-xl text-sm text-center">
              Deschide email
            </a>
            <button onClick={() => setShowCancelModal(false)}
              className="w-full py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600">
              Inchide
            </button>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl p-6 shadow-xl max-w-sm w-full space-y-4">
            <div className="text-center">
              <div className="text-4xl mb-2">⚠️</div>
              <h2 className="font-bold text-gray-900">Stergi contul?</h2>
              <p className="text-sm text-gray-500 mt-1">Aceasta actiune este <strong>ireversibila</strong>. Fisele, clientii, serviciile si toate datele tale vor fi sterse definitiv.</p>
            </div>
            <button onClick={handleDeleteAccount} disabled={deletingAccount}
              className="w-full py-3 bg-red-600 text-white font-bold rounded-xl text-sm disabled:bg-red-300">
              {deletingAccount ? 'Se sterge...' : 'Da, sterge contul definitiv'}
            </button>
            <button onClick={() => setShowDeleteModal(false)} disabled={deletingAccount}
              className="w-full py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600">
              Anuleaza
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function CompanyForm({ form, setForm, onSave, onCancel, saved }: {
  form: ReturnType<typeof emptyCompany>
  setForm: (f: ReturnType<typeof emptyCompany>) => void
  onSave: () => void
  onCancel: () => void
  saved: boolean
}) {
  const [lookingUp, setLookingUp] = useState(false)
  const [anafError, setAnafError] = useState('')

  async function lookupAnaf() {
    if (!form.cui) return
    setLookingUp(true)
    setAnafError('')
    try {
      const cui = form.cui.replace(/[^0-9]/g, '')
      const { ok, data } = await anafLookup(cui)
      if (!ok) { setAnafError(data.error || 'Eroare ANAF'); return }
      setForm({
        ...form,
        name: data.name || form.name,
        address: data.address || form.address,
        reg_com: data.reg_com || form.reg_com,
        vat_rate: typeof data.scpTva === 'boolean' ? (data.scpTva ? (form.vat_rate || 21) : 0) : form.vat_rate,
      })
    } catch {
      setAnafError('Eroare conexiune')
    } finally {
      setLookingUp(false)
    }
  }

  const otherFields = [
    { key: 'name', label: 'Nume firma *', placeholder: 'Ex: Instalatii Nord SRL' },
    { key: 'reg_com', label: 'Reg. Com.', placeholder: 'J40/1234/2020' },
    { key: 'address', label: 'Adresa', placeholder: 'Str. Exemplu nr. 1, oras' },
    { key: 'phone', label: 'Telefon', placeholder: '07xx xxx xxx' },
    { key: 'email', label: 'Email', placeholder: 'contact@firma.ro' },
    { key: 'bank', label: 'Banca', placeholder: 'BCR' },
    { key: 'iban', label: 'IBAN', placeholder: 'RO49 AAAA...' },
  ]
  return (
    <div className="px-5 py-4 space-y-3 bg-gray-50 border-b border-gray-100">
      <div>
        <label className="text-xs font-medium text-gray-600 mb-1 block">CUI / CIF</label>
        <div className="flex gap-2">
          <input
            className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white"
            placeholder="RO12345678"
            value={form.cui as string}
            onChange={e => { setForm({ ...form, cui: e.target.value }); setAnafError('') }}
          />
          <button onClick={lookupAnaf} disabled={lookingUp || !form.cui}
            className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold disabled:bg-gray-300 shrink-0 whitespace-nowrap">
            {lookingUp ? '...' : 'Cauta ANAF'}
          </button>
        </div>
        {anafError && <p className="text-xs text-red-500 mt-1">{anafError}</p>}
      </div>
      {otherFields.map(f => (
        <div key={f.key}>
          <label className="text-xs font-medium text-gray-600 mb-1 block">{f.label}</label>
          <input
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white"
            placeholder={f.placeholder}
            value={form[f.key as keyof typeof form] as string}
            onChange={e => setForm({ ...form, [f.key]: e.target.value })}
          />
        </div>
      ))}
      <div>
        <label className="text-xs font-medium text-gray-600 mb-1 block">Cota TVA implicita</label>
        <div className="flex gap-2">
          {[0, 11, 21].map(r => (
            <button key={r} onClick={() => setForm({ ...form, vat_rate: r })}
              className={`flex-1 py-2 rounded-xl border-2 text-sm font-bold ${form.vat_rate === r ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-600'}`}>
              {r === 0 ? 'Fara TVA' : `${r}%`}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={onCancel} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600">Anuleaza</button>
        <button onClick={onSave} className={`flex-1 py-3 rounded-xl text-sm font-semibold text-white ${saved ? 'bg-green-500' : 'bg-purple-600'}`}>
          {saved ? '✓ Salvat!' : 'Salveaza firma'}
        </button>
      </div>
    </div>
  )
}

