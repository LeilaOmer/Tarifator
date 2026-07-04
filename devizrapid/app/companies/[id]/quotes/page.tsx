'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'

type Quote = { id: string; title: string; status: string; total: number; created_at: string; client_id: string | null }
type Client = { id: string; name: string }
type Company = { id: string; name: string }

export default function CompanyQuotesPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [company, setCompany] = useState<Company | null>(null)
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [id])

  async function load() {
    const [{ data: co }, { data: q }, { data: c }] = await Promise.all([
      supabase.from('companies').select('id, name').eq('id', id).single(),
      supabase.from('quotes').select('*').eq('company_id', id).order('created_at', { ascending: false }),
      supabase.from('clients').select('id, name'),
    ])
    if (co) {
      setCompany(co)
      localStorage.setItem('activeCompanyId', id)
      localStorage.setItem('activeCompanyName', co.name)
    }
    if (q) setQuotes(q)
    if (c) setClients(c)
    setLoading(false)
  }

  async function handleDelete(qid: string) {
    const { error } = await supabase.from('quotes').delete().eq('id', qid)
    if (error) { alert('Nu s-a putut sterge fisa: ' + error.message); return }
    load()
  }

  const clientName = (cid: string | null) => cid ? clients.find(c => c.id === cid)?.name : null

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">Se incarca...</p></div>

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <button onClick={() => router.push('/dashboard')} className="flex items-center text-blue-600 font-medium text-base py-1 px-2 -ml-2 rounded-lg">
          <span className="text-2xl leading-none">‹</span>
        </button>
        <h1 className="text-base font-bold text-gray-800 truncate max-w-[200px]">{company?.name}</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/pricing')} className="text-sm font-semibold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-xl">
            🧮
          </button>
          <button onClick={() => {
            localStorage.setItem('activeCompanyId', id)
            router.push('/quotes')
          }} className="text-sm font-semibold text-purple-600 bg-purple-50 px-3 py-1.5 rounded-xl">
            + Fisa
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5">
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {quotes.length === 0 && <p className="p-5 text-sm text-gray-500">Niciun fisa pentru aceasta firma.</p>}
          <div className="divide-y divide-gray-50">
            {quotes.map(q => (
              <div key={q.id} className="flex justify-between items-center px-5 py-4 gap-3">
                <div className="flex-1 min-w-0">
                  <a href={`/quotes/${q.id}`} className="text-sm font-semibold text-gray-900 hover:text-blue-600">{q.title}</a>
                  <div className="flex items-center gap-2 mt-0.5">
                    {clientName(q.client_id) && <span className="text-xs text-gray-500">{clientName(q.client_id)}</span>}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${q.status === 'draft' ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}`}>
                      {q.status === 'draft' ? 'Ciorna' : 'Finalizat'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-semibold text-gray-700">{q.total} lei</span>
                  <button onClick={() => handleDelete(q.id)} className="text-red-400 text-lg">×</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}