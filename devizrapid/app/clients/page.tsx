'use client'
import { toast } from '@/lib/toast'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { anafLookup } from '@/lib/anaf'
import { useRouter } from 'next/navigation'

type Client = { id: string; name: string; phone: string; email: string; cui: string; address: string; contact_person: string }

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [form, setForm] = useState({ name: '', phone: '', email: '', cui: '', address: '', contact_person: '' })
  const [editing, setEditing] = useState<Client | null>(null)
  const [loading, setLoading] = useState(false)
  const [lookingUp, setLookingUp] = useState(false)
  const [anafError, setAnafError] = useState('')
  const router = useRouter()

  async function lookupAnaf(cui: string, onResult: (name: string, address: string) => void) {
    const cuiNum = cui.replace(/[^0-9]/g, '')
    if (!cuiNum) return
    setLookingUp(true)
    setAnafError('')
    try {
      const { ok, data } = await anafLookup(cuiNum)
      if (!ok) { setAnafError(data.error || 'Eroare ANAF'); return }
      onResult(data.name || '', data.address || '')
    } catch {
      setAnafError('Eroare conexiune')
    } finally {
      setLookingUp(false)
    }
  }

  useEffect(() => { fetchClients() }, [])

  async function fetchClients() {
    const { data } = await supabase.from('clients').select('*').order('name')
    if (data) setClients(data)
  }

  async function handleAdd() {
    if (!form.name) return
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('clients').insert({ ...form, user_id: user?.id })
    setLoading(false)
    if (error) { toast('Nu s-a adaugat clientul: ' + error.message); return }
    setForm({ name: '', phone: '', email: '', cui: '', address: '', contact_person: '' })
    await fetchClients()
  }

  async function handleSaveEdit() {
    if (!editing) return
    setLoading(true)
    const { error } = await supabase.from('clients').update({
      name: editing.name, phone: editing.phone, email: editing.email,
      cui: editing.cui, address: editing.address, contact_person: editing.contact_person
    }).eq('id', editing.id)
    setLoading(false)
    if (error) { toast('Nu s-a salvat clientul: ' + error.message); return }
    setEditing(null)
    await fetchClients()
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('clients').delete().eq('id', id)
    if (error) { toast('Nu s-a sters clientul: ' + error.message); return }
    await fetchClients()
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <button aria-label="Inapoi" onClick={() => router.push('/dashboard')} className="flex items-center gap-2 text-blue-600 font-medium text-base py-1 px-2 -ml-2 rounded-lg">
          <span className="text-xl">‹</span> Dashboard
        </button>
        <h1 className="text-base font-bold text-gray-800">Clienti</h1>
        <div className="w-20" />
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-4">

        {/* Form adaugare */}
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Client nou</p>
          <div className="flex gap-2">
            <input className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
              placeholder="CUI (optional)" value={form.cui} onChange={e => { setForm({ ...form, cui: e.target.value }); setAnafError('') }} />
            <button onClick={() => lookupAnaf(form.cui, (name, address) => setForm(f => ({ ...f, name: name || f.name, address: address || f.address })))}
              disabled={lookingUp || !form.cui}
              className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold disabled:bg-gray-300 shrink-0 whitespace-nowrap">
              {lookingUp ? '...' : 'Cauta ANAF'}
            </button>
          </div>
          {anafError && <p className="text-xs text-red-500 -mt-1">{anafError}</p>}
          <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
            placeholder="Nume / Denumire firma *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
            placeholder="Adresa" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
          <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
            placeholder="Persoana de contact" value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })} />
          <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
            placeholder="Telefon" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
            placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <button onClick={handleAdd} disabled={loading || !form.name}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm disabled:bg-gray-300">
            {loading ? 'Se adauga...' : '+ Adauga client'}
          </button>
        </div>

        {/* Lista clienti */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {clients.length === 0 && <p className="p-5 text-sm text-gray-500">Niciun client.</p>}
          <div className="divide-y divide-gray-50">
            {clients.map(c => (
              <div key={c.id}>
                {editing?.id === c.id ? (
                  <div className="p-4 space-y-3">
                    <div className="flex gap-2">
                      <input className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
                        placeholder="CUI (optional)" value={editing.cui || ''} onChange={e => { setEditing({ ...editing, cui: e.target.value }); setAnafError('') }} />
                      <button onClick={() => lookupAnaf(editing.cui || '', (name, address) => setEditing(ed => ed ? { ...ed, name: name || ed.name, address: address || ed.address } : ed))}
                        disabled={lookingUp || !editing.cui}
                        className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold disabled:bg-gray-300 shrink-0 whitespace-nowrap">
                        {lookingUp ? '...' : 'Cauta ANAF'}
                      </button>
                    </div>
                    {anafError && <p className="text-xs text-red-500 -mt-1">{anafError}</p>}
                    <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
                      placeholder="Nume *" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
                    <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
                      placeholder="Adresa" value={editing.address || ''} onChange={e => setEditing({ ...editing, address: e.target.value })} />
                    <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
                      placeholder="Persoana de contact" value={editing.contact_person || ''} onChange={e => setEditing({ ...editing, contact_person: e.target.value })} />
                    <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
                      placeholder="Telefon" value={editing.phone || ''} onChange={e => setEditing({ ...editing, phone: e.target.value })} />
                    <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
                      placeholder="Email" value={editing.email || ''} onChange={e => setEditing({ ...editing, email: e.target.value })} />
                    <div className="flex gap-2 pt-1">
                      <button onClick={handleSaveEdit} disabled={loading}
                        className="flex-1 py-2.5 bg-green-600 text-white rounded-xl font-semibold text-sm disabled:bg-gray-300">
                        Salveaza
                      </button>
                      <button onClick={() => setEditing(null)}
                        className="px-5 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium">
                        Anuleaza
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-center px-5 py-4 gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-900">{c.name}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                        {c.cui && <span className="text-xs text-gray-500">CUI {c.cui}</span>}
                        {c.phone && <span className="text-xs text-gray-500">{c.phone}</span>}
                        {c.email && <span className="text-xs text-gray-500">{c.email}</span>}
                        {c.address && <span className="text-xs text-gray-500 w-full truncate">{c.address}</span>}
                        {c.contact_person && <span className="text-xs text-gray-500">Contact: {c.contact_person}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <button onClick={() => setEditing(c)} className="text-blue-500 text-sm font-medium">Editeaza</button>
                      <button aria-label="Inchide" onClick={() => handleDelete(c.id)} className="text-red-400 text-xl leading-none">×</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
