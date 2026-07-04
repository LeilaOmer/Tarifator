'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Service = {
  id: string
  name: string
  unit: string
  price_per_unit: number
}

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([])
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [price, setPrice] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null)
  const [activeCompanyName, setActiveCompanyName] = useState<string | null>(null)
  const [isPro, setIsPro] = useState(false)
  const router = useRouter()

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: prof } = await supabase.from('profiles').select('account_type').eq('id', session.user.id).single()
      const pro = prof?.account_type === 'pro' && localStorage.getItem('dashboardMode') === 'pro'
      setIsPro(pro)

      if (pro) {
        const compId = localStorage.getItem('activeCompanyId') || null
        const compName = localStorage.getItem('activeCompanyName') || null
        setActiveCompanyId(compId)
        setActiveCompanyName(compName)
        fetchServices(compId)
      } else {
        fetchServices(null)
      }
    }
    init()
  }, [])

  async function fetchServices(companyId: string | null) {
    let query = supabase.from('services').select('*').order('name')
    if (companyId) {
      query = query.eq('company_id', companyId)
    } else {
      query = query.is('company_id', null)
    }
    const { data } = await query
    if (data) setServices(data)
  }

  async function handleAdd() {
    if (!name || !unit || !price) return
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const payload: Record<string, unknown> = {
      name, unit, price_per_unit: parseFloat(price), user_id: user?.id
    }
    if (isPro && activeCompanyId) {
      payload.company_id = activeCompanyId
    }
    const { error } = await supabase.from('services').insert(payload)
    setLoading(false)
    if (error) { alert('Nu s-a adaugat serviciul: ' + error.message); return }
    setName(''); setUnit(''); setPrice('')
    await fetchServices(isPro ? activeCompanyId : null)
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('services').delete().eq('id', id)
    if (error) { alert('Nu s-a sters serviciul: ' + error.message); return }
    await fetchServices(isPro ? activeCompanyId : null)
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <button onClick={() => router.push('/dashboard')} className="flex items-center gap-2 text-blue-600 font-medium text-base py-1 px-2 -ml-2 rounded-lg">
          <span className="text-xl">‹</span> Dashboard
        </button>
        <h1 className="text-base font-bold text-gray-800">Servicii</h1>
        <div className="w-20" />
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-4">

        {isPro && (
          <div className="flex items-center gap-2 px-1">
            <span className="text-xs font-semibold text-purple-500 uppercase tracking-wide">
              {activeCompanyName ? `Firma: ${activeCompanyName}` : 'Nicio firma activa'}
            </span>
          </div>
        )}

        {/* Form adaugare */}
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Serviciu nou</p>
          <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
            placeholder="Nume serviciu *" value={name} onChange={e => setName(e.target.value)} />
          <div className="flex gap-3">
            <input className="border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 w-32"
              placeholder="UM (buc, h, mp)" value={unit} onChange={e => setUnit(e.target.value)} />
            <input className="border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 flex-1"
              placeholder="Pret / UM (lei)" type="number" value={price} onChange={e => setPrice(e.target.value)} />
          </div>
          <button onClick={handleAdd} disabled={loading || !name || !unit || !price}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm disabled:bg-gray-300">
            {loading ? 'Se adauga...' : '+ Adauga serviciu'}
          </button>
        </div>

        {/* Lista servicii */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {services.length === 0 && (
            <p className="p-5 text-sm text-gray-500">Niciun serviciu adaugat.</p>
          )}
          <div className="divide-y divide-gray-50">
            {services.map(s => (
              <div key={s.id} className="flex items-center justify-between px-5 py-4 gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-900 truncate">{s.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.unit}</p>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-sm font-bold text-gray-700">{s.price_per_unit} lei/{s.unit}</span>
                  <button onClick={() => handleDelete(s.id)} className="text-red-400 text-xl leading-none">×</button>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
