'use client'
import { toast } from '@/lib/toast'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Draft = {
  id: string
  title: string
  supplier: string
  adaos: number
  items: { name: string }[]
  updated_at: string
}

export default function CalculePage() {
  const router = useRouter()
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data } = await supabase
        .from('pricing_drafts')
        .select('id, title, supplier, adaos, items, updated_at')
        .order('updated_at', { ascending: false })
      setDrafts(data || [])
      setLoading(false)
    }
    load()
  }, [router])

  async function handleDelete(id: string) {
    const { error } = await supabase.from('pricing_drafts').delete().eq('id', id)
    if (error) { toast('Nu s-a putut sterge calculul: ' + error.message); return }
    setDrafts(prev => prev.filter(d => d.id !== id))
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <button aria-label="Inapoi" onClick={() => router.push('/dashboard')} className="flex items-center text-blue-600 font-medium text-base py-1 px-2 -ml-2 rounded-lg">
          <span className="text-2xl leading-none">‹</span>
        </button>
        <h1 className="text-base font-bold text-gray-800">Calcule salvate</h1>
        <button onClick={() => router.push('/pricing')} className="text-xs font-semibold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-xl">
          + Nou
        </button>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-3">
        {loading ? (
          <p className="text-center text-gray-500 py-10">Se incarca...</p>
        ) : drafts.length === 0 ? (
          <div className="text-center py-14 space-y-3">
            <p className="text-gray-500 text-sm">Niciun calcul salvat inca.</p>
            <button onClick={() => router.push('/pricing')}
              className="text-blue-600 text-sm font-semibold bg-blue-50 px-4 py-2 rounded-xl">
              + Calcul nou
            </button>
          </div>
        ) : (
          drafts.map(d => (
            <div key={d.id} className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => router.push('/pricing?draft=' + d.id)}>
                <p className="font-semibold text-gray-900 truncate">{d.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {d.items?.length || 0} produse · adaos {d.adaos}% · {new Date(d.updated_at).toLocaleDateString('ro-RO')}
                </p>
              </div>
              <button onClick={() => router.push('/pricing?draft=' + d.id)}
                className="text-xs font-bold text-blue-600 px-3 py-1.5 rounded-xl bg-blue-50 whitespace-nowrap">
                Deschide
              </button>
              <button aria-label="Inchide" onClick={() => handleDelete(d.id)}
                className="text-red-400 text-xl leading-none px-1">×</button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
