'use client'
import { RoundStep, RoundMode } from '@/lib/pricing/calc'

type Props = {
  supplier: string; onSupplier: (v: string) => void
  adaos: string; onAdaos: (v: string) => void
  roundStep: RoundStep; onRoundStep: (v: RoundStep) => void
  roundMode: RoundMode; onRoundMode: (v: RoundMode) => void
}

export default function SettingsPanel({ supplier, onSupplier, adaos, onAdaos, roundStep, onRoundStep, roundMode, onRoundMode }: Props) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-2.5 space-y-2.5">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Setari calcul</p>

      <div>
        <label className="text-xs font-medium text-gray-700 mb-1 block">Furnizor (optional)</label>
        <input className="w-full border border-gray-200 rounded-xl px-2.5 py-2 text-sm text-gray-900"
          placeholder="Ex: Metro, Selgros..." value={supplier} onChange={e => onSupplier(e.target.value)} />
      </div>

      <div>
        <label className="text-xs font-medium text-gray-700 mb-1 block">Adaos comercial %</label>
        <input type="number" min="0" step="1"
          className="w-full border border-gray-200 rounded-xl px-2.5 py-2 text-sm font-bold text-gray-900"
          value={adaos} onChange={e => onAdaos(e.target.value)} />
      </div>


      <div>
        <label className="text-xs font-medium text-gray-700 mb-1 block">Rotunjire pret final</label>
        <div className="flex gap-2 flex-wrap">
          {(['none', '0.10', '0.50', '1.00'] as RoundStep[]).map(s => (
            <button key={s} onClick={() => onRoundStep(s)}
              className={`px-3 py-1.5 rounded-xl text-sm font-semibold border-2 transition-all ${roundStep === s ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}>
              {s === 'none' ? 'Fara' : s + ' lei'}
            </button>
          ))}
        </div>
        {roundStep !== 'none' && (
          <div className="flex gap-2 mt-2">
            {([['nearest', 'La cel mai apropiat'], ['up', 'Intotdeauna in sus']] as [RoundMode, string][]).map(([m, label]) => (
              <button key={m} onClick={() => onRoundMode(m as RoundMode)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold border-2 transition-all ${roundMode === m ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-600'}`}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
