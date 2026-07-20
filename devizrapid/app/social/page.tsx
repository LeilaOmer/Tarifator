'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ensureAccountLocal } from '@/lib/session'
import { toast } from '@/lib/toast'
import {
  PLATFORM_IDS,
  PLATFORMS,
  CONTENT_TYPES,
  GOALS,
  type SocialPlatform,
  type SocialContentType,
  type SocialGoal,
  type SocialVariant,
  type SocialVariantSet,
} from '@/lib/social/generate'

// Raspunsul rutei /api/social-agent = setul + metadate de salvare.
type AgentResponse = SocialVariantSet & {
  setId: string
  saved: boolean
  saveError: string | null
}

// Un rand din istoric (tabelul social_content), doar campurile afisate.
type HistoryRow = {
  set_id: string
  platform: SocialPlatform
  content_type: SocialContentType
  goal: SocialGoal
  idea: string
  hook: string | null
  created_at: string
}

// Buton mic de copiere, refolosit peste tot.
function CopyBtn({ text, label }: { text: string; label: string }) {
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(
          () => toast('Copiat: ' + label),
          () => toast('Nu s-a putut copia'),
        )
      }}
      className="text-xs font-semibold text-blue-600 shrink-0 py-1 px-2 rounded-lg hover:bg-blue-50"
    >
      Copiaza
    </button>
  )
}

// O sectiune dintr-un card de varianta (titlu + continut + copiere).
function Section({ title, text }: { title: string; text: string }) {
  if (!text) return null
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
        <CopyBtn text={text} label={title} />
      </div>
      <p className="text-sm text-gray-800 whitespace-pre-wrap">{text}</p>
    </div>
  )
}

function VariantCard({ v }: { v: SocialVariant }) {
  const ct = CONTENT_TYPES[v.contentType]
  const g = GOALS[v.goal]
  const hashtagsLine = v.hashtags.join(' ')
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full">
          {ct.label}
        </span>
        <span className="text-xs font-bold text-orange-700 bg-orange-50 px-2.5 py-1 rounded-full">
          {g.label}
        </span>
        <span className="text-[11px] text-gray-400 ml-auto">KPI: {g.kpi}</span>
      </div>

      <Section title="Hook" text={v.hook} />
      <Section title="Scenariu" text={v.script} />
      <Section title="Descriere" text={v.description} />
      <Section title="Hashtaguri" text={hashtagsLine} />
      <Section title="Call to action" text={v.cta} />
      <Section title="Prompt video (Veo / Kling / CapCut)" text={v.videoPrompt} />
    </div>
  )
}

export default function SocialPage() {
  const [ready, setReady] = useState(false)
  const [topic, setTopic] = useState('')
  const [platform, setPlatform] = useState<SocialPlatform>('tiktok')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AgentResponse | null>(null)
  const [history, setHistory] = useState<HistoryRow[]>([])
  const router = useRouter()

  useEffect(() => {
    async function init() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }
      ensureAccountLocal(session.user.id)
      setReady(true)
      loadHistory()
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadHistory() {
    const { data } = await supabase
      .from('social_content')
      .select('set_id, platform, content_type, goal, idea, hook, created_at')
      .order('created_at', { ascending: false })
      .limit(30)
    if (data) setHistory(data as HistoryRow[])
  }

  async function handleGenerate() {
    setLoading(true)
    setResult(null)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }
      const res = await fetch('/api/social-agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ topic: topic.trim() || undefined, platform }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast(data.message || 'Generarea a esuat. Incearca din nou.')
        return
      }
      setResult(data as AgentResponse)
      if (data.saved) {
        toast('Generat si salvat')
        loadHistory()
      } else {
        toast('Generat (nesalvat)')
      }
    } catch {
      toast('Eroare de retea. Incearca din nou.')
    } finally {
      setLoading(false)
    }
  }

  if (!ready) return null

  // Grupeaza istoricul pe set_id, pastrand ordinea (recent-intai).
  const historyGroups: { setId: string; idea: string; rows: HistoryRow[] }[] = []
  for (const row of history) {
    const last = historyGroups[historyGroups.length - 1]
    if (last && last.setId === row.set_id) last.rows.push(row)
    else historyGroups.push({ setId: row.set_id, idea: row.idea, rows: [row] })
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <button
          aria-label="Inapoi"
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-2 text-blue-600 font-medium text-base py-1 px-2 -ml-2 rounded-lg"
        >
          <span className="text-xl">‹</span> Dashboard
        </button>
        <h1 className="text-base font-bold text-gray-800">Continut social</h1>
        <div className="w-20" />
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-4">
        {/* Formular generare */}
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Platforma</p>
          <div className="flex gap-2">
            {PLATFORM_IDS.map((p) => (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                className={
                  'flex-1 py-2.5 rounded-xl text-sm font-semibold border ' +
                  (platform === p
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200')
                }
              >
                {PLATFORMS[p].label}
              </button>
            ))}
          </div>

          <input
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
            placeholder="Tema (optional) — ex: scanare factura, pret din burta"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !loading) handleGenerate()
            }}
          />

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm disabled:bg-gray-300"
          >
            {loading ? 'Se genereaza...' : 'Genereaza 3 variante'}
          </button>
          <p className="text-[11px] text-gray-400 text-center">
            3 variante pentru aceeasi idee: educativ, amuzant, controversat.
          </p>
        </div>

        {/* Rezultat */}
        {result && (
          <div className="space-y-4">
            <div className="bg-blue-50 rounded-2xl p-4">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                Idee ({PLATFORMS[result.platform].label})
              </p>
              <p className="text-sm text-gray-900 mt-1 font-medium">{result.idea}</p>
              {!result.saved && (
                <p className="text-[11px] text-orange-600 mt-2">
                  Nesalvat: {result.saveError || 'verifica tabelul social_content'}
                </p>
              )}
            </div>
            {result.variants.map((v) => (
              <VariantCard key={v.contentType} v={v} />
            ))}
          </div>
        )}

        {/* Istoric */}
        {historyGroups.length > 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">
              Istoric
            </p>
            {historyGroups.map((grp) => (
              <div key={grp.setId} className="bg-white rounded-2xl shadow-sm p-4 space-y-2">
                <p className="text-sm font-medium text-gray-900">{grp.idea}</p>
                <div className="flex flex-wrap gap-1.5">
                  {grp.rows.map((r, i) => (
                    <span
                      key={i}
                      className="text-[11px] text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full"
                    >
                      {PLATFORMS[r.platform]?.label} · {CONTENT_TYPES[r.content_type]?.label} ·{' '}
                      {GOALS[r.goal]?.label}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
