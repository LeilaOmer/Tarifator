'use client'
import { toast } from '@/lib/toast'
import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Item } from '@/lib/pricing/calc'

export function useVoiceInput(onItemsAdded: (items: Item[]) => void) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioCtxRef = useRef<AudioContext | null>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [listening, setListening] = useState(false)
  const [loading, setLoading] = useState(false)
  const [voiceMsg, setVoiceMsg] = useState('')

  function stopVoice() {
    if (silenceTimerRef.current) { clearInterval(silenceTimerRef.current); silenceTimerRef.current = null }
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null }
    mediaRecorderRef.current?.stop()
  }

  async function handleVoice() {
    if (listening) { stopVoice(); return }
    setVoiceMsg('')
    let stream: MediaStream
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }) }
    catch { toast('Nu am acces la microfon.'); return }

    const mediaRecorder = new MediaRecorder(stream)
    mediaRecorderRef.current = mediaRecorder
    chunksRef.current = []
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop())
      setListening(false); setLoading(true)

      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      const form = new FormData()
      form.append('file', blob, 'audio.webm')

      const { data: { session } } = await supabase.auth.getSession()
      const authHeader: HeadersInit = session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}

      const tr = await fetch('/api/transcribe', { method: 'POST', headers: authHeader, body: form })
      const { text } = await tr.json()
      if (!text) { setLoading(false); setVoiceMsg('Nu am prins nimic. Vorbeste mai tare sau mai aproape de microfon.'); return }
      setVoiceMsg(`Am auzit: "${text}"`)

      const res = await fetch('/api/parse-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authHeader as Record<string, string>) },
        body: JSON.stringify({ text }),
      })
      const data = await res.json()
      const parsed: Item[] = (data.items || [])
        .map((i: { name: string; unit: string; supplier_price: number; discount: number; vat: number }) => ({
          id: crypto.randomUUID(),
          name: i.name || '',
          unit: i.unit || 'buc',
          supplierPrice: i.supplier_price != null && i.supplier_price !== 0 ? String(i.supplier_price) : '',
          discount: String(i.discount ?? 0),
          vat: (i.vat === 11 ? 11 : 21) as 11 | 21,
          sgr: '0',
        }))
        .filter((i: Item) => i.name)

      if (parsed.length > 0) {
        onItemsAdded(parsed)
        setVoiceMsg(`${parsed.length} produs${parsed.length !== 1 ? 'e' : ''} adaugat${parsed.length !== 1 ? 'e' : ''}.`)
      } else {
        setVoiceMsg('Nu am gasit produse in inregistrare. Incearca din nou.')
      }
      setLoading(false)
    }

    const audioCtx = new AudioContext()
    audioCtxRef.current = audioCtx
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256
    audioCtx.createMediaStreamSource(stream).connect(analyser)
    const recordStart = Date.now()
    let silenceSince: number | null = null
    silenceTimerRef.current = setInterval(() => {
      const data = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(data)
      const avg = data.reduce((a, b) => a + b, 0) / data.length
      if (avg < 5) {
        if (!silenceSince) silenceSince = Date.now()
        else if (Date.now() - silenceSince > 2000 && Date.now() - recordStart > 1500) stopVoice()
      } else {
        silenceSince = null
      }
    }, 100)

    mediaRecorder.start(); setListening(true)
  }

  return { listening, loading, voiceMsg, handleVoice }
}
