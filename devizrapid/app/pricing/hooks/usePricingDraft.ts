'use client'
import { toast } from '@/lib/toast'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Item, RoundStep, RoundMode, emptyItem } from '@/lib/pricing/calc'

export function usePricingDraft() {
  const [supplier, setSupplier] = useState('')
  const [adaos, setAdaos] = useState('30')
  const [roundStep, setRoundStep] = useState<RoundStep>('0.50')
  const [roundMode, setRoundMode] = useState<RoundMode>('nearest')
  const [vatPayer, setVatPayerState] = useState(true)
  const [defaultVat, setDefaultVat] = useState<11 | 21>(21)
  const [items, setItems] = useState<Item[]>([emptyItem(21)])
  const [draftId, setDraftId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [draftSaved, setDraftSaved] = useState(false)

  // Load round settings and draft from URL or localStorage
  useEffect(() => {
    const draftParam = new URLSearchParams(window.location.search).get('draft')
    if (draftParam) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) return
        supabase.from('pricing_drafts').select('*').eq('id', draftParam).single()
          .then(({ data }) => {
            if (!data) return
            setDraftId(data.id)
            setSupplier(data.supplier || '')
            setAdaos(String(data.adaos ?? 30))
            setRoundStep((data.round_step as RoundStep) || '0.50')
            setRoundMode((data.round_mode as RoundMode) || 'nearest')
            setItems(data.items?.length ? data.items.map((i: Item) => ({ ...i, sgr: i.sgr ?? '0' })) : [emptyItem(21)])
          })
      })
    } else {
      try {
        const saved = localStorage.getItem('pricing_settings')
        if (saved) {
          const s = JSON.parse(saved)
          if (s.roundStep) setRoundStep(s.roundStep)
          if (s.roundMode) setRoundMode(s.roundMode)
          if (s.adaos !== undefined && s.adaos !== null && s.adaos !== '') setAdaos(String(s.adaos))
        }
      } catch {}
    }
  }, [])

  // Load vatPayer from profile or active company
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      const isPro = localStorage.getItem('dashboardMode') === 'pro'
      const companyId = isPro ? localStorage.getItem('activeCompanyId') : null
      if (companyId) {
        supabase.from('companies').select('vat_rate').eq('id', companyId).single()
          .then(({ data }) => {
            if (!data) return
            const rate = data.vat_rate ?? 21
            setVatPayerState(rate !== 0)
            setDefaultVat(rate === 11 ? 11 : 21)
          })
      } else {
        supabase.from('profiles').select('vat_rate').eq('id', session.user.id).single()
          .then(({ data }) => {
            if (!data) return
            const rate = data.vat_rate ?? 21
            setVatPayerState(rate !== 0)
            setDefaultVat(rate === 11 ? 11 : 21)
          })
      }
    })
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('pricing_settings', JSON.stringify({ roundStep, roundMode, adaos }))
    } catch {}
  }, [roundStep, roundMode, adaos])

  // Auto-salveaza calculul cat timp are cel putin un produs valid, ca sa nu se piarda
  // lucrul daca utilizatorul pleaca din pagina fara sa exporte un PDF.
  useEffect(() => {
    const hasContent = items.some(i => i.name.trim() && parseFloat(i.supplierPrice) > 0)
    if (!hasContent) return
    const timer = setTimeout(() => { saveDraft() }, 2500)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, adaos, supplier, roundStep, roundMode])

  async function setVatPayer(v: boolean) {
    const previous = vatPayer
    setVatPayerState(v)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const isPro = localStorage.getItem('dashboardMode') === 'pro'
    const companyId = isPro ? localStorage.getItem('activeCompanyId') : null
    if (companyId) {
      if (!v) {
        const { error } = await supabase.from('companies').update({ vat_rate: 0 }).eq('id', companyId)
        if (error) { setVatPayerState(previous); toast('Nu s-a salvat regimul TVA: ' + error.message) }
      } else {
        // Restore to 21 only if currently non-platitor (0)
        const { data } = await supabase.from('companies').select('vat_rate').eq('id', companyId).single()
        if (data && data.vat_rate === 0) {
          const { error } = await supabase.from('companies').update({ vat_rate: 21 }).eq('id', companyId)
          if (error) { setVatPayerState(previous); toast('Nu s-a salvat regimul TVA: ' + error.message) }
        }
      }
    } else {
      const { error } = await supabase.from('profiles').update({ vat_rate: v ? 21 : 0 }).eq('id', session.user.id)
      if (error) { setVatPayerState(previous); toast('Nu s-a salvat regimul TVA: ' + error.message) }
    }
  }

  async function saveDraft() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    setSaving(true)
    const title = supplier.trim() || ('Calcul ' + new Date().toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' }))
    const payload = {
      user_id: session.user.id,
      title, supplier,
      adaos: parseFloat(adaos) || 0,
      round_step: roundStep,
      round_mode: roundMode,
      items,
      updated_at: new Date().toISOString(),
    }
    if (draftId) {
      const { error } = await supabase.from('pricing_drafts').update(payload).eq('id', draftId)
      if (error) { setSaving(false); toast('Nu s-a salvat calculul: ' + error.message); return }
    } else {
      const { data, error } = await supabase.from('pricing_drafts').insert(payload).select('id').single()
      if (error) { setSaving(false); toast('Nu s-a salvat calculul: ' + error.message); return }
      if (data) setDraftId(data.id)
    }
    setSaving(false)
    setDraftSaved(true)
    setTimeout(() => setDraftSaved(false), 2000)
  }

  function updateItem(id: string, field: keyof Item, value: string) {
    setItems(prev => prev.map(i => {
      if (i.id !== id) return i
      if (field === 'vat') return { ...i, vat: (parseInt(value) === 11 ? 11 : 21) as 11 | 21 }
      return { ...i, [field]: value }
    }))
  }

  function removeItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
  }

  return {
    supplier, setSupplier,
    adaos, setAdaos,
    roundStep, setRoundStep,
    roundMode, setRoundMode,
    vatPayer, setVatPayer,
    defaultVat,
    items, setItems,
    saving, draftSaved,
    saveDraft, updateItem, removeItem,
  }
}
