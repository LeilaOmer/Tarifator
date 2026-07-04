'use client'
import { toast } from '@/lib/toast'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getEffectiveLimits } from '@/lib/plan'
import { getMonthlyFise } from '@/lib/usage'
import { nextQuoteNumber } from '@/lib/quoteNumber'
import { useRouter } from 'next/navigation'

type Quote = { id: string; title: string; status: string; total: number; created_at: string; client_id: string | null; company_id: string | null }
type Client = { id: string; name: string }
type Company = { id: string; name: string }

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null)
  const [filterCompanyId, setFilterCompanyId] = useState<string>('all')
  const [title, setTitle] = useState('')
  const [clientId, setClientId] = useState('')
  const [loading, setLoading] = useState(false)
  const [showClientModal, setShowClientModal] = useState(false)
  const [clientForm, setClientForm] = useState({ name: '', cui: '', address: '', contact_person: '', phone: '', email: '' })
  const [savingClient, setSavingClient] = useState(false)
  const [lookingUp, setLookingUp] = useState(false)
  const [anafError, setAnafError] = useState('')
  const router = useRouter()

  useEffect(() => {
  const mode = localStorage.getItem('dashboardMode')
  const saved = mode === 'pro' ? localStorage.getItem('activeCompanyId') : null
  setActiveCompanyId(saved)
  setFilterCompanyId(saved || 'all')
  fetchData()
}, [])

async function fetchData() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return

  const { data: prof } = await supabase.from('profiles').select('account_type').eq('id', session.user.id).single()
  const isPro = prof?.account_type === 'pro' && localStorage.getItem('dashboardMode') === 'pro'

  const [{ data: q }, { data: c }, { data: cos }] = await Promise.all([
    supabase.from('quotes').select('*').order('created_at', { ascending: false }),
    supabase.from('clients').select('*').order('name'),
    isPro ? supabase.from('companies').select('id, name').order('name') : Promise.resolve({ data: [] }),
  ])
  if (q) setQuotes(q)
  if (c) setClients(c)
  if (cos) setCompanies(cos)
}
  async function handleCreate() {
    if (!title) return
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setLoading(false); return }

    const [{ fise: fiseLimit }, fise] = await Promise.all([
      getEffectiveLimits(session.user.id, session.user.created_at),
      getMonthlyFise(session.user.id),
    ])
    if (fise >= fiseLimit) {
      setLoading(false)
      router.push('/upgrade?type=fise')
      return
    }

    const user = session.user
    const quote_number = await nextQuoteNumber(user.id, activeCompanyId || null)
    const { data, error } = await supabase.from('quotes').insert({
      title, user_id: user.id, status: 'draft', total: 0,
      client_id: clientId || null, quote_number,
      company_id: activeCompanyId || null
    }).select().single()
    setLoading(false)
    if (error || !data) { toast('Nu s-a creat fisa: ' + (error?.message || 'eroare necunoscuta')); return }
    setTitle(''); setClientId('')
    router.push(`/quotes/${data.id}`)
  }

  async function lookupAnaf(cui: string) {
    const cuiNum = cui.replace(/[^0-9]/g, '')
    if (!cuiNum) return
    setLookingUp(true)
    setAnafError('')
    try {
      const res = await fetch(`/api/anaf-lookup?cui=${cuiNum}`)
      const data = await res.json()
      if (!res.ok) { setAnafError(data.error || 'Eroare ANAF'); return }
      setClientForm(f => ({ ...f, name: data.name || f.name, address: data.address || f.address }))
    } catch {
      setAnafError('Eroare conexiune')
    } finally {
      setLookingUp(false)
    }
  }

  async function handleAddClient() {
    if (!clientForm.name) return
    setSavingClient(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSavingClient(false); return }
    const { data, error } = await supabase.from('clients').insert({ ...clientForm, user_id: session.user.id }).select().single()
    setSavingClient(false)
    if (error || !data) { toast('Nu s-a adaugat beneficiarul: ' + (error?.message || 'eroare necunoscuta')); return }
    setClients(prev => [...prev, { id: data.id, name: data.name }].sort((a, b) => a.name.localeCompare(b.name)))
    setClientId(data.id)
    setClientForm({ name: '', cui: '', address: '', contact_person: '', phone: '', email: '' })
    setAnafError('')
    setShowClientModal(false)
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('quotes').delete().eq('id', id)
    if (error) { toast('Nu s-a sters fisa: ' + error.message); return }
    await fetchData()
  }

  const clientName = (id: string | null) => id ? clients.find(c => c.id === id)?.name : null
  const companyName = (id: string | null) => id ? companies.find(c => c.id === id)?.name : null

const filteredQuotes = filterCompanyId === 'all' || !filterCompanyId
  ? quotes
  : quotes.filter(q => q.company_id === filterCompanyId)

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between">
          <button aria-label="Inapoi" onClick={() => router.push('/dashboard')} className="flex items-center text-blue-600 font-medium text-base py-1 px-2 -ml-2 rounded-lg">
            <span className="text-2xl leading-none">‹</span>
          </button>
          <h1 className="text-base font-bold text-gray-800">Fise Servicii</h1>
          <div className="w-8" />
        </div>
        {companies.length > 0 && (
          <div className="flex overflow-x-auto gap-0 border-t border-gray-100 scrollbar-hide">
            {companies.map(c => (
              <button key={c.id} onClick={() => setFilterCompanyId(c.id)}
                className={`flex-shrink-0 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${
                  filterCompanyId === c.id
                    ? 'border-purple-500 text-purple-700'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}>
                {c.name}
              </button>
            ))}
            <button onClick={() => setFilterCompanyId('all')}
              className={`flex-shrink-0 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${
                filterCompanyId === 'all'
                  ? 'border-blue-500 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-600'
              }`}>
              Toate
            </button>
          </div>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-4">

        {/* Creare fisa nou */}
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fisa Servicii Noua</p>
          {activeCompanyId && companyName(activeCompanyId) && (
            <p className="text-xs text-purple-600 font-medium">Firma: {companyName(activeCompanyId)}</p>
          )}
          <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
            placeholder="Titlu fisa" value={title} onChange={e => setTitle(e.target.value)} />
          <div className="flex gap-2">
            <select className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
              value={clientId} onChange={e => setClientId(e.target.value)}>
              <option value="">Fara client</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={() => setShowClientModal(true)}
              className="px-4 py-3 bg-purple-100 text-purple-700 rounded-xl text-sm font-semibold shrink-0 whitespace-nowrap">
              + Beneficiar nou
            </button>
          </div>
          <button onClick={handleCreate} disabled={loading || !title}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm disabled:bg-gray-300">
            {loading ? 'Se creeaza...' : '+ Creeaza fisa'}
          </button>
        </div>

        {/* Lista fise de servicii */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {filteredQuotes.length === 0 && (
            <p className="p-5 text-sm text-gray-500">Niciun fisa{filterCompanyId !== 'all' ? ' pentru firma selectata' : ''}.</p>
          )}
          <div className="divide-y divide-gray-50">
            {filteredQuotes.map(q => (
              <div key={q.id} className="flex justify-between items-center px-5 py-4 gap-3">
                <div className="flex-1 min-w-0">
                  <a href={`/quotes/${q.id}`} className="text-sm font-semibold text-gray-900 hover:text-blue-600">{q.title}</a>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {clientName(q.client_id) && <span className="text-xs text-gray-500">{clientName(q.client_id)}</span>}
                    {q.company_id && companyName(q.company_id) && (
                      <span className="text-xs text-purple-500 font-medium">{companyName(q.company_id)}</span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${q.status === 'draft' ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}`}>
                      {q.status === 'draft' ? 'Ciorna' : 'Finalizat'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-semibold text-gray-700">{q.total} lei</span>
                  <button aria-label="Inchide" onClick={() => handleDelete(q.id)} className="text-red-400 text-lg leading-none">×</button>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {showClientModal && (
        <div className="fixed inset-0 bg-black/40 z-30 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-gray-800">Beneficiar nou</p>
              <button onClick={() => { setShowClientModal(false); setAnafError('') }} className="text-gray-500 text-xl leading-none">×</button>
            </div>
            <div className="flex gap-2">
              <input className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
                placeholder="CUI (optional)" value={clientForm.cui} onChange={e => { setClientForm({ ...clientForm, cui: e.target.value }); setAnafError('') }} />
              <button onClick={() => lookupAnaf(clientForm.cui)}
                disabled={lookingUp || !clientForm.cui}
                className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold disabled:bg-gray-300 shrink-0 whitespace-nowrap">
                {lookingUp ? '...' : 'Cauta ANAF'}
              </button>
            </div>
            {anafError && <p className="text-xs text-red-500 -mt-1">{anafError}</p>}
            <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
              placeholder="Nume / Denumire firma *" value={clientForm.name} onChange={e => setClientForm({ ...clientForm, name: e.target.value })} />
            <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
              placeholder="Adresa" value={clientForm.address} onChange={e => setClientForm({ ...clientForm, address: e.target.value })} />
            <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
              placeholder="Persoana de contact" value={clientForm.contact_person} onChange={e => setClientForm({ ...clientForm, contact_person: e.target.value })} />
            <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
              placeholder="Telefon" value={clientForm.phone} onChange={e => setClientForm({ ...clientForm, phone: e.target.value })} />
            <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
              placeholder="Email" value={clientForm.email} onChange={e => setClientForm({ ...clientForm, email: e.target.value })} />
            <button onClick={handleAddClient} disabled={savingClient || !clientForm.name}
              className="w-full py-3 bg-green-600 text-white rounded-xl font-semibold text-sm disabled:bg-gray-300">
              {savingClient ? 'Se adauga...' : '+ Adauga beneficiar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}