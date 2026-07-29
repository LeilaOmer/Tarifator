'use client'
import { useState } from 'react'
import Link from 'next/link'
import { calcItem, fmt2, type RoundMode, type RoundStep } from '@/lib/pricing/calc'
import { DEMO_LINES, DEMO_SUPPLIER, pieceCount, piecePrice, toItem } from '@/lib/demo/invoice'

// Demo PRECALCULAT: nu pleaca NICIO cerere de retea de aici. Ruta reala de
// scanare (`/api/parse-invoice`) e autentificata si plafonata la 50 de scanari pe
// zi tocmai fiindca fiecare apel consuma din cota Groq gratuita. O varianta
// publica, fara cont, ar putea fi golita de oricine — throttle-ul pe IP din
// `lib/rateLimit.ts` e fail-open prin decizie, deci nu poate apara singur o ruta
// care arde bani. Aici "scanarea" doar dezvaluie date care sunt deja in pagina.
//
// Ce NU e fals: preturile. Toate ies din `calcItem`, aceeasi functie ca `/pricing`.

// Nu se reutilizeaza `app/pricing/ItemCard.tsx`: acela importa `@/lib/supabase` si
// scrie rapoarte cutie/bucata sub sesiune autentificata. Aici e doar afisare.

const ADAOS_PRESETS = [15, 25, 35, 50]

export default function DemoScan() {
  const [stage, setStage] = useState<'idle' | 'scanning' | 'done'>('idle')
  const [adaos, setAdaos] = useState(25)
  const [roundStep, setRoundStep] = useState<RoundStep>('0.10')
  const [roundMode] = useState<RoundMode>('nearest')
  const [vatPayer, setVatPayer] = useState(true)

  function scan() {
    setStage('scanning')
    // Intarziere pur cosmetica, ca dezvaluirea sa nu para un simplu toggle.
    setTimeout(() => setStage('done'), 900)
  }

  return (
    <div className="space-y-8">
      {/* Factura */}
      <div className="relative">
        <div className={`rounded-xl border border-gray-200 bg-white overflow-hidden transition-opacity ${stage === 'scanning' ? 'opacity-60' : ''}`}>
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-500">Factura furnizor · exemplu</p>
            <p className="font-semibold text-gray-900 text-sm">{DEMO_SUPPLIER}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-100">
                  <th className="text-left font-medium px-4 py-2">Denumire</th>
                  <th className="text-left font-medium px-2 py-2">TVA</th>
                  <th className="text-left font-medium px-2 py-2">UM</th>
                  <th className="text-right font-medium px-2 py-2">Cant.</th>
                  <th className="text-right font-medium px-4 py-2">Pret</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {DEMO_LINES.map((line, i) => (
                  <tr key={i} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2 text-gray-900">{line.name}</td>
                    <td className="px-2 py-2 text-gray-500">{line.vat}%</td>
                    <td className="px-2 py-2 text-gray-500">{line.um}</td>
                    <td className="px-2 py-2 text-right text-gray-500">{line.qty}</td>
                    <td className="px-4 py-2 text-right text-gray-900">{fmt2(line.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {stage === 'scanning' && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/40">
            <span className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium animate-pulse">
              Se citeste factura…
            </span>
          </div>
        )}
      </div>

      {stage === 'idle' && (
        <div>
          <button onClick={scan}
            className="w-full sm:w-auto px-8 py-3.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors">
            Scaneaza factura
          </button>
          <p className="text-xs text-gray-500 mt-3">
            Exemplu gata pregatit — nu trebuie sa incarci nimic si nu-ti cerem niciun cont.
          </p>
        </div>
      )}

      {stage === 'done' && (
        <>
          {/* Reglaje */}
          <div className="rounded-xl border border-gray-200 p-4 space-y-4">
            <div>
              <label htmlFor="demo-adaos" className="block text-sm font-medium text-gray-900 mb-2">
                Adaosul tau: <span className="text-blue-600">{adaos}%</span>
              </label>
              <input id="demo-adaos" type="range" min={0} max={100} step={1} value={adaos}
                onChange={e => setAdaos(parseInt(e.target.value, 10))}
                className="w-full accent-blue-600" />
              <div className="flex gap-2 mt-2">
                {ADAOS_PRESETS.map(p => (
                  <button key={p} onClick={() => setAdaos(p)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      adaos === p ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}>
                    {p}%
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-6">
              <div>
                <label htmlFor="demo-round" className="block text-xs font-medium text-gray-500 mb-1">Rotunjire</label>
                <select id="demo-round" value={roundStep}
                  onChange={e => setRoundStep(e.target.value as RoundStep)}
                  className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                  <option value="none">Fara</option>
                  <option value="0.10">La 10 bani</option>
                  <option value="0.50">La 50 de bani</option>
                  <option value="1.00">La leu</option>
                </select>
              </div>
              <div>
                <span className="block text-xs font-medium text-gray-500 mb-1">Regim TVA</span>
                <div className="flex gap-2">
                  <button onClick={() => setVatPayer(true)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      vatPayer ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}>
                    Platitor
                  </button>
                  <button onClick={() => setVatPayer(false)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      !vatPayer ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}>
                    Neplatitor
                  </button>
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              {vatPayer
                ? 'Platitor: adaosul se pune pe pretul fara TVA, apoi se adauga TVA-ul clientului.'
                : 'Neplatitor: TVA-ul platit furnizorului intra in cost si nu se mai adauga TVA la client.'}
            </p>
          </div>

          {/* Rezultate */}
          <div className="space-y-3">
            {DEMO_LINES.map((line, i) => {
              const item = toItem(line, i)
              const c = calcItem(item, adaos, roundStep, roundMode, vatPayer)
              const split = line.um === 'Cut' && !!line.boxRatio && line.boxRatio > 1
              return (
                <div key={item.id} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex justify-between items-start gap-4">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 text-sm break-words">{line.name}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {split
                          ? `${fmt2(line.unitPrice)} lei/cutie ÷ ${line.boxRatio} = ${fmt2(piecePrice(line))} lei/buc`
                          : `${fmt2(line.unitPrice)} lei/buc de la furnizor`}
                        {(line.discount ?? 0) > 0 && ` · −${line.discount}% reducere`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-gray-900 whitespace-nowrap">{fmt2(c.final)} lei</p>
                      {line.sgr > 0 && (
                        <p className="text-xs text-green-600 whitespace-nowrap">+{fmt2(line.sgr)} SGR</p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-3">
                    <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 text-xs">TVA {line.vat}%</span>
                    <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 text-xs">{pieceCount(line)} buc</span>
                    {split && (
                      <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 text-xs">impartit din cutie</span>
                    )}
                    {line.sgr > 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-green-50 text-green-600 text-xs">garantie SGR</span>
                    )}
                  </div>

                  {line.note && <p className="text-xs text-gray-500 mt-3">{line.note}</p>}
                </div>
              )
            })}
          </div>

          <div className="rounded-xl bg-gray-50 border border-gray-100 p-5">
            <p className="font-semibold text-gray-900 mb-1">Asta a fost un exemplu.</p>
            <p className="text-sm text-gray-500 mb-4">
              In aplicatie pui factura ta — poza, PDF sau e-Factura — si scoti lista ca PDF:
              una pentru tine, una pentru raft.
            </p>
            <Link href="/login"
              className="inline-block px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors">
              Incearca gratuit cu factura ta
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
