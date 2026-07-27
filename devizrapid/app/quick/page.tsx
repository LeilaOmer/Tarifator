'use client'
import { toast } from '@/lib/toast'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { ensureAccountLocal } from '@/lib/session'
import { getEffectiveLimits } from '@/lib/plan'
import { getMonthlyFise } from '@/lib/usage'
import { insertQuoteWithNumber, quoteInsertMessage } from '@/lib/quoteNumber'
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
  const [unmatched, setUnmatched] = useState<string[]>([]) // dictate care nu s-au potrivit cu un serviciu
  const [voiceDebug, setVoiceDebug] = useState('') // ce a propus modelul, cand rezultatul nu e cel asteptat
  // Ce a INTELES Whisper, pastrat pe ecran dupa procesare. Intr-o aplicatie pe
  // voce asta e esential: "doua" si "noua" rimeaza in romana si se confunda des,
  // iar daca transcriptul dispare, omul vede doar cantitatea gresita din fisa si
  // nu stie daca a gresit el, microfonul sau modelul.
  const [heard, setHeard] = useState('')
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

  // Serviciul e sursa pretului, nu modelul: din raspunsul serverului luam doar
  // `service_id` (deja potrivit determinist prin matchService) si cantitatea.
  function buildPreviewItems(raw: unknown): PreviewItem[] {
    return (Array.isArray(raw) ? raw : []).flatMap((i): PreviewItem[] => {
      const o = (i ?? {}) as Record<string, unknown>
      const service = services.find(s => s.id === o.service_id)
      if (!service) return []
      const quantity = Math.max(1, Math.round(Number(o.quantity)) || 1)
      return [{
        service_id: service.id,
        name: service.name,
        quantity,
        unit_price: service.price_per_unit,
        total: Math.round(quantity * service.price_per_unit * 100) / 100,
      }]
    })
  }

  // ————— Editare MANUALA a fisei, langa cea prin dictare —————
  // Dictarea e rapida, mana e sigura: cand Whisper aude "noua" in loc de "doua"
  // ("doua"/"noua" rimeaza in romana), o atingere pe cifra corecteaza instant,
  // fara alt drum la model. Cele doua cai lucreaza pe aceeasi stare, deci o
  // corectie manuala e vizibila si pentru urmatoarea comanda vocala
  // (previewRef se sincronizeaza din useEffect).
  const lineTotal = (q: number, p: number) => Math.round(q * p * 100) / 100

  function setQty(idx: number, raw: number) {
    // Acelasi plafon ca pe server (lib/services/editActions.ts), ca sa nu
    // diveargheze cele doua cai de editare.
    const quantity = Math.min(Math.max(1, Math.round(raw) || 1), 100_000)
    setPreview(prev => prev && {
      ...prev,
      items: prev.items.map((it, i) =>
        i === idx ? { ...it, quantity, total: lineTotal(quantity, it.unit_price) } : it),
    })
  }

  function removeLine(idx: number) {
    setPreview(prev => prev && { ...prev, items: prev.items.filter((_, i) => i !== idx) })
  }

  function addLine(serviceId: string) {
    const service = services.find(s => s.id === serviceId)
    if (!service) return
    setPreview(prev => {
      if (!prev) return prev
      // Serviciul exista deja => crestem cantitatea, nu duplicam randul.
      const idx = prev.items.findIndex(it => it.service_id === serviceId)
      if (idx !== -1) {
        const quantity = Math.min(prev.items[idx].quantity + 1, 100_000)
        return {
          ...prev,
          items: prev.items.map((it, i) =>
            i === idx ? { ...it, quantity, total: lineTotal(quantity, it.unit_price) } : it),
        }
      }
      return {
        ...prev,
        items: [...prev.items, {
          service_id: service.id,
          name: service.name,
          quantity: 1,
          unit_price: service.price_per_unit,
          total: lineTotal(1, service.price_per_unit),
        }],
      }
    })
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
    const data = await res.json().catch(() => ({}))
    setHeard(text)
    setPreview({ client_name: data.client_name || '', items: buildPreviewItems(data.items) })
    // ce a dictat dar nu s-a potrivit cu niciun serviciu salvat — il ARATAM, nu-l
    // aruncam tacut (asa userul stie ca "teava" n-a fost prinsa si o poate adauga).
    setUnmatched(Array.isArray(data.unmatched) ? data.unmatched : [])
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
    const data = await res.json().catch(() => ({ error: 'network' }))
    setHeard(command)

    // Daca modificarea NU s-a putut interpreta, pastram fisa asa cum era. Inainte
    // se scria `items: []` peste lista curenta => o comanda neinteleasa GOLEA
    // tacut tot ce dictase utilizatorul.
    if (!res.ok || (data.error && data.error !== 'refused_wipe')) {
      setLoading(false)
      setTranscript('')
      committedRef.current = ''
      toast(data.error === 'rate_limit'
        ? 'Limita zilnica de comenzi vocale atinsa. Revino maine.'
        : 'Nu am inteles modificarea. Fisa a ramas neschimbata — mai incearca o data.')
      return
    }

    // Serverul a refuzat sa goleasca fisa pentru o comanda care nu cerea stergere.
    if (data.error === 'refused_wipe') {
      toast('Nu am aplicat modificarea (ar fi golit fisa, desi nu ai cerut stergere).')
    }
    // `debug` = ce a propus modelul. Il aratam cand rezultatul nu e cel asteptat,
    // ca sa poata fi raportat fara acces la logurile serverului.
    if (data.debug && (data.error || data.blockedDestructive > 0)) {
      setVoiceDebug(String(data.debug))
    } else {
      setVoiceDebug('')
    }

    const items = buildPreviewItems(data.items)
    setPreview({ ...current, items })
    // Ce s-a dictat dar nu s-a potrivit cu un serviciu salvat se ARATA, nu dispare.
    const nomatch: string[] = Array.isArray(data.unmatched) ? data.unmatched : []
    setUnmatched(nomatch)
    // Comanda inteleasa, dar fara efect (ex. "scoate teava" cand nu e nicio teava):
    // spunem asta, ca sa nu para ca aplicatia a ignorat-o.
    if (data.changed === false && nomatch.length === 0) {
      toast('Comanda nu a schimbat nimic in fisa.')
    }
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
      // `%` si `_` sunt metacaractere in ilike: un nume dictat care le contine
      // ar lega fisa de un client GRESIT. Filtrul pe user_id e aparare in
      // adancime peste RLS (nu ne bazam pe un singur strat pentru izolare).
      const pattern = preview.client_name.trim().replace(/[\\%_]/g, m => '\\' + m)
      const { data: existing } = await supabase.from('clients')
        .select('id').eq('user_id', user.id).ilike('name', pattern).limit(1)
      if (existing && existing.length > 0) {
        client_id = existing[0].id
      } else {
        const { data: newClient, error: clientErr } = await supabase.from('clients').insert({ name: preview.client_name, user_id: user.id }).select().single()
        if (clientErr) { setLoading(false); toast('Nu s-a putut salva clientul: ' + clientErr.message); return }
        client_id = newClient?.id
      }
    }
    const companyId = localStorage.getItem('dashboardMode') === 'pro' ? (localStorage.getItem('activeCompanyId') || null) : null
    // Totalul se calculeaza INAINTE si se scrie din prima: nu mai e nevoie de un
    // update separat care putea esua dupa ce fisa era deja creata.
    const total = Math.round(preview.items.reduce((sum, i) => sum + i.total, 0) * 100) / 100
    const { data: quote, error: quoteErr } = await insertQuoteWithNumber(user.id, companyId, {
      title: 'Fisa Servicii ' + (preview.client_name || ''),
      user_id: user.id,
      client_id,
      status: 'draft',
      total,
      company_id: companyId
    })
    if (quoteErr || !quote) { setLoading(false); toast('Nu s-a creat fisa: ' + quoteInsertMessage(quoteErr)); return }

    // Liniile se insereaza intr-o SINGURA cerere. Inainte era o bucla care iesea
    // la prima eroare, lasand in urma o fisa cu jumatate din linii si total 0 —
    // deja numarata in limita lunara si cu un numar de fisa consumat. Daca
    // inserarea esueaza, stergem fisa ca sa nu ramana un ciot inutilizabil.
    const { error: itemsErr } = await supabase.from('quote_items').insert(
      preview.items.map(item => ({
        quote_id: quote.id,
        service_id: item.service_id,
        description: item.name,
        quantity: item.quantity,
        unit_price: item.unit_price,
      }))
    )
    if (itemsErr) {
      await supabase.from('quotes').delete().eq('id', quote.id)
      setLoading(false)
      toast('Nu s-au salvat lucrarile, fisa nu a fost creata: ' + itemsErr.message)
      return
    }

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
          <button onClick={() => { setPreview(null); setTranscript(''); setHeard(''); setUnmatched([]); setVoiceDebug(''); committedRef.current = '' }}
            className="w-full py-3 bg-gray-100 text-gray-600 rounded-xl font-semibold text-sm">
            Fisa noua
          </button>
        </div>

        {preview && (
          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
            <h2 className="font-bold text-base text-gray-800">Preview</h2>
            {heard && (
              <div className="rounded-xl px-3 py-2 text-xs" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <span className="text-gray-500">Am auzit: </span>
                <span className="text-gray-800">&bdquo;{heard}&rdquo;</span>
                <p className="text-gray-500 mt-0.5">Daca nu e ce ai spus, corecteaza direct cantitatea mai jos, sau dicteaza (ex. &bdquo;2 calorifere, nu 9&rdquo;).</p>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-sm">Client:</span>
              <input className="border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 flex-1"
                value={preview.client_name} onChange={e => setPreview({ ...preview, client_name: e.target.value })} />
            </div>
            {preview.items.length > 0 && (
              <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                {preview.items.map((item, i) => (
                  <div key={item.service_id} className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-gray-900 text-sm flex-1 min-w-0">{item.name}</span>
                      <button
                        onClick={() => removeLine(i)}
                        aria-label={`Sterge ${item.name}`}
                        className="text-red-400 text-xl leading-none shrink-0 w-9 h-9 -mt-1 -mr-1 flex items-center justify-center">
                        ×
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      {/* Tinte mari de atins: aplicatia se foloseste pe telefon, in teren. */}
                      <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden shrink-0">
                        <button
                          onClick={() => setQty(i, item.quantity - 1)}
                          disabled={item.quantity <= 1}
                          aria-label={`Scade cantitatea la ${item.name}`}
                          className="w-11 h-11 text-lg font-bold text-gray-600 disabled:text-gray-300 active:bg-gray-100">
                          −
                        </button>
                        <input
                          type="number" min="1" step="1" inputMode="numeric"
                          aria-label={`Cantitate ${item.name}`}
                          className="w-14 h-11 text-center text-sm font-bold text-gray-900 border-x border-gray-200 focus:outline-none"
                          value={item.quantity}
                          onChange={e => setQty(i, parseInt(e.target.value, 10))}
                        />
                        <button
                          onClick={() => setQty(i, item.quantity + 1)}
                          aria-label={`Creste cantitatea la ${item.name}`}
                          className="w-11 h-11 text-lg font-bold text-gray-600 active:bg-gray-100">
                          +
                        </button>
                      </div>
                      <span className="text-xs text-gray-500 text-right">
                        × {item.unit_price} lei =<br />
                        <strong className="text-gray-800 text-sm">{item.total} lei</strong>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Adaugare manuala — alternativa la dictare cand modelul nu prinde
                un serviciu, sau cand e mai rapid sa alegi din lista. */}
            {services.length > 0 && (
              <select
                aria-label="Adauga o lucrare din lista"
                className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm bg-white text-gray-900"
                value=""
                onChange={e => { if (e.target.value) addLine(e.target.value) }}>
                <option value="">+ Adauga lucrare din lista...</option>
                {services
                  .filter(s => !preview.items.some(it => it.service_id === s.id))
                  .map(s => <option key={s.id} value={s.id}>{s.name} ({s.price_per_unit} lei/{s.unit})</option>)}
              </select>
            )}
            {unmatched.length > 0 && (
              // culori amber prin hex direct: paleta remapeaza amber->verde, iar un
              // avertisment verde ar arata ca "e ok" — aici NU e ok
              <div className="rounded-xl p-3 text-sm" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
                <p className="font-semibold" style={{ color: '#b45309' }}>Nerecunoscute: {unmatched.join(', ')}</p>
                <p className="mt-0.5" style={{ color: '#92700e' }}>
                  Nu se potrivesc cu niciun serviciu salvat.{' '}
                  <button onClick={() => router.push('/services')} className="underline font-medium">Adauga-le in Servicii</button>{' '}si redicteaza.
                </p>
              </div>
            )}
            {voiceDebug && (
              <p className="text-[11px] text-gray-500 break-words">Model: {voiceDebug}</p>
            )}
            <div className="flex justify-between font-bold text-lg border-t border-gray-100 pt-3">
              <span className="text-gray-800">Total</span>
              <span className="text-blue-600">{preview.items.reduce((s, i) => s + i.total, 0)} lei</span>
            </div>
            <button onClick={handleConfirm} disabled={loading || preview.items.length === 0}
              className="w-full py-3 bg-green-600 text-white rounded-xl font-semibold text-sm disabled:bg-gray-300">
              {loading ? 'Salvez...' : 'Confirma si salveaza'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}