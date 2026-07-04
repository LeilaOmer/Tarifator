'use client'
import { toast } from '@/lib/toast'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { ensureAccountLocal } from '@/lib/session'
import { getEffectiveLimits } from '@/lib/plan'
import { getMonthlyFise } from '@/lib/usage'
import { nextQuoteNumber } from '@/lib/quoteNumber'
import { useRouter } from 'next/navigation'

type Service = { id: string; name: string; unit: string; price_per_unit: number }
type PreviewItem = { service_id: string; name: string; quantity: number; unit_price: number; total: number }

function playSuccessSound() {
  const audio = new Audio('/success.wav')
  audio.volume = 0.5
  audio.play().catch(() => {})
}

export default function QuickPage() {
  const [services, setServices] = useState<Service[]>([])
  const [transcript, setTranscript] = useState('')
  const [listening, setListening] = useState(false)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<{ client_name: string; items: PreviewItem[] } | null>(null)
  const router = useRouter()
  const committedRef = useRef('')
  const previewRef = useRef<{ client_name: string; items: PreviewItem[] } | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  useEffect(() => { previewRef.current = preview }, [preview])

  useEffect(() => {
    async function loadServices() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      ensureAccountLocal(session.user.id)
      const { data: prof } = await supabase.from('profiles').select('account_type').eq('id', session.user.id).single()
      const isPro = prof?.account_type === 'pro' && localStorage.getItem('dashboardMode') === 'pro'
      const companyId = isPro ? localStorage.getItem('activeCompanyId') : null
      const { data } = companyId
        ? await supabase.from('services').select('*').eq('company_id', companyId).order('name')
        : await supabase.from('services').select('*').is('company_id', null).order('name')
      if (data) setServices(data)
    }
    loadServices()
  }, [])

  async function handleVoice() {
    if (listening) {
      mediaRecorderRef.current?.stop()
      return
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      toast('Nu am acces la microfon.')
      return
    }

    const mediaRecorder = new MediaRecorder(stream)
    mediaRecorderRef.current = mediaRecorder
    chunksRef.current = []

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop())
      setListening(false)
      setLoading(true)

      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      const form = new FormData()
      form.append('file', blob, 'audio.webm')

      const { data: { session: voiceSession } } = await supabase.auth.getSession()
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: voiceSession?.access_token ? { 'Authorization': `Bearer ${voiceSession.access_token}` } : {},
        body: form,
      })
      const { text } = await res.json()

      if (!text) { setLoading(false); return }

      const full = (committedRef.current ? committedRef.current + ' ' + text : text).trim()
      setTranscript(full)

      if (previewRef.current) {
        handleEdit(full)
      } else {
        handleParse(full)
      }
    }

    mediaRecorder.start()
    setListening(true)
  }

  async function handleParse(input?: string) {
    const text = input || transcript
    if (!text) return
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/parse-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}) },
      body: JSON.stringify({ text, services })
    })
    const data = await res.json()
    const items: PreviewItem[] = (data.items || []).map((item: any) => {
      const service = services.find(s => s.id === item.service_id)
      if (!service) return null
      return {
        service_id: service.id,
        name: service.name,
        quantity: item.quantity,
        unit_price: service.price_per_unit,
        total: item.quantity * service.price_per_unit
      }
    }).filter(Boolean)
    setPreview({ client_name: data.client_name || '', items })
    setTranscript('')
    committedRef.current = ''
    setLoading(false)
  }

  async function handleEdit(input?: string) {
    const command = input || transcript
    const current = previewRef.current
    if (!command || !current) return
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/edit-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}) },
      body: JSON.stringify({ command, items: current.items, services })
    })
    const data = await res.json()
    const items: PreviewItem[] = (data.items || []).map((item: any) => {
      const service = services.find(s => s.id === item.service_id)
      if (!service) return null
      return {
        service_id: service.id,
        name: service.name,
        quantity: item.quantity,
        unit_price: service.price_per_unit,
        total: item.quantity * service.price_per_unit
      }
    }).filter(Boolean)
    setPreview({ ...current, items })
    setTranscript('')
    committedRef.current = ''
    setLoading(false)
  }

  async function handleConfirm() {
    if (!preview) return
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) { setLoading(false); return }

    const [{ fise: fiseLimit }, fise] = await Promise.all([
      getEffectiveLimits(user.id, user.created_at),
      getMonthlyFise(user.id),
    ])
    if (fise >= fiseLimit) {
      setLoading(false)
      router.push('/upgrade?type=fise')
      return
    }
    let client_id = null
    if (preview.client_name) {
      const { data: existing } = await supabase.from('clients').select('id').ilike('name', preview.client_name).limit(1)
      if (existing && existing.length > 0) {
        client_id = existing[0].id
      } else {
        const { data: newClient, error: clientErr } = await supabase.from('clients').insert({ name: preview.client_name, user_id: user?.id }).select().single()
        if (clientErr) { setLoading(false); toast('Nu s-a putut salva clientul: ' + clientErr.message); return }
        client_id = newClient?.id
      }
    }
    const companyId = localStorage.getItem('dashboardMode') === 'pro' ? (localStorage.getItem('activeCompanyId') || null) : null
    const quote_number = await nextQuoteNumber(user.id, companyId)
    const { data: quote, error: quoteErr } = await supabase.from('quotes').insert({
      title: 'Fisa Servicii ' + (preview.client_name || ''),
      user_id: user?.id,
      client_id,
      status: 'draft',
      total: 0,
      quote_number,
      company_id: companyId
    }).select().single()
    if (quoteErr || !quote) { setLoading(false); toast('Nu s-a creat fisa: ' + (quoteErr?.message || 'eroare necunoscuta')); return }
    for (const item of preview.items) {
      const { error: itemErr } = await supabase.from('quote_items').insert({
        quote_id: quote.id,
        service_id: item.service_id,
        description: item.name,
        quantity: item.quantity,
        unit_price: item.unit_price
      })
      if (itemErr) { setLoading(false); toast('Nu s-a salvat o linie din fisa: ' + itemErr.message); return }
    }
    const total = preview.items.reduce((sum, i) => sum + i.total, 0)
    const { error: totalErr } = await supabase.from('quotes').update({ total }).eq('id', quote.id)
    if (totalErr) { setLoading(false); toast('Nu s-a actualizat totalul: ' + totalErr.message); return }
    playSuccessSound()
    router.push('/quotes/' + quote.id)
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <style>{`.fixed.bottom-24 { display: none; }`}</style>
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <button aria-label="Inapoi" onClick={() => router.push('/dashboard')} className="flex items-center text-blue-600 font-medium text-base py-1 px-2 -ml-2 rounded-lg">
          <span className="text-2xl leading-none">‹</span>
        </button>
        <h1 className="text-base font-bold text-gray-800">Fisa Servicii Voce</h1>
        <div className="w-8" />
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-4">
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <button onClick={handleVoice}
            className={`w-full py-4 rounded-2xl font-bold text-base text-white transition-all ${listening ? 'bg-red-500' : 'bg-purple-600 hover:bg-purple-700'}`}>
            {listening ? '🔴 Ascult...' : preview ? '✏️ Modifica prin voce' : '🎤 Dicteaza'}
          </button>
          {transcript && (
            <div className="border border-gray-200 rounded-xl p-3 text-gray-700 text-sm">{transcript}</div>
          )}
          {loading && (
            <p className="text-center text-sm text-gray-500">Procesez...</p>
          )}
          <button onClick={() => { setPreview(null); setTranscript(''); committedRef.current = '' }}
            className="w-full py-3 bg-gray-100 text-gray-600 rounded-xl font-semibold text-sm">
            Fisa noua
          </button>
        </div>

        {preview && (
          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
            <h2 className="font-bold text-base text-gray-800">Preview</h2>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-sm">Client:</span>
              <input className="border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 flex-1"
                value={preview.client_name} onChange={e => setPreview({ ...preview, client_name: e.target.value })} />
            </div>
            <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
              {preview.items.map((item, i) => (
                <div key={i} className="flex justify-between items-center p-3 text-sm">
                  <span className="font-medium text-gray-900">{item.name}</span>
                  <span className="text-gray-500">x{item.quantity} × {item.unit_price} lei = <strong className="text-gray-800">{item.total} lei</strong></span>
                </div>
              ))}
            </div>
            <div className="flex justify-between font-bold text-lg border-t border-gray-100 pt-3">
              <span className="text-gray-800">Total</span>
              <span className="text-blue-600">{preview.items.reduce((s, i) => s + i.total, 0)} lei</span>
            </div>
            <button onClick={handleConfirm} disabled={loading}
              className="w-full py-3 bg-green-600 text-white rounded-xl font-semibold text-sm disabled:bg-gray-300">
              {loading ? 'Salvez...' : 'Confirma si salveaza'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}