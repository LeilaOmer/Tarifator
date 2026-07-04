'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Item, RoundStep, RoundMode, calcItem, fmt2 } from '@/lib/pricing/calc'

type Props = {
  item: Item
  adaos: number
  roundStep: RoundStep
  roundMode: RoundMode
  vatPayer: boolean
  supplier: string
  onUpdate: (id: string, field: keyof Item, value: string) => void
  onRemove: (id: string) => void
}

export default function ItemCard({ item, adaos, roundStep, roundMode, vatPayer, supplier, onUpdate, onRemove }: Props) {
  const c = item.supplierPrice ? calcItem(item, adaos, roundStep, roundMode, vatPayer) : null
  const [boxFormOpen, setBoxFormOpen] = useState(false)
  const [boxPrice, setBoxPrice] = useState('')
  const [boxPieces, setBoxPieces] = useState('')
  const [boxSaving, setBoxSaving] = useState(false)
  const [boxSaved, setBoxSaved] = useState(false)
  const [boxError, setBoxError] = useState('')

  async function saveBoxRatio() {
    const priceNum = parseFloat(boxPrice)
    const piecesNum = parseInt(boxPieces, 10)
    if (!priceNum || priceNum <= 0 || !piecesNum || piecesNum <= 1) {
      setBoxError('Completeaza pretul cutiei si un numar de bucati mai mare ca 1.')
      return
    }
    setBoxSaving(true)
    setBoxError('')
    const newPrice = Math.round((priceNum / piecesNum) * 10000) / 10000
    onUpdate(item.id, 'unit', 'buc')
    onUpdate(item.id, 'supplierPrice', String(newPrice))
    if (supplier.trim() && item.name.trim()) {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        const res = await fetch('/api/box-ratio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ supplier_name: supplier.trim(), product_name: item.name.trim(), pieces_per_box: piecesNum }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setBoxError('Pretul s-a corectat, dar nu s-a retinut raportul: ' + (data.error || 'eroare necunoscuta'))
          setBoxSaving(false)
          return
        }
      }
    }
    setBoxSaving(false)
    setBoxSaved(true)
    setTimeout(() => { setBoxSaved(false); setBoxFormOpen(false); setBoxPrice(''); setBoxPieces('') }, 1500)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-2.5 space-y-1.5">
      <div className="flex gap-2 items-center">
        <div className="flex-1 relative">
          <input
            className="w-full border border-gray-200 rounded-xl px-2.5 py-1.5 text-sm text-gray-900"
            placeholder="Denumire produs *"
            value={item.name}
            onChange={e => onUpdate(item.id, 'name', e.target.value)}
          />
          {parseFloat(item.sgr) > 0 && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 bg-orange-100 text-orange-600 text-[10px] font-bold px-1.5 py-0.5 rounded-md leading-none">
              +SGR
            </span>
          )}
        </div>
        <input
          className="w-16 border border-gray-200 rounded-xl px-2 py-1.5 text-sm text-gray-900 text-center"
          placeholder="UM"
          value={item.unit}
          onChange={e => onUpdate(item.id, 'unit', e.target.value)}
        />
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-gray-500 mb-0.5 block">Pret furnizor (fara SGR)</label>
          <input
            type="number" min="0" step="0.01"
            className="w-full border border-gray-200 rounded-xl px-2.5 py-1.5 text-sm text-gray-900"
            placeholder="0.00"
            value={item.supplierPrice}
            onChange={e => onUpdate(item.id, 'supplierPrice', e.target.value)}
          />
        </div>
        <div className="w-20">
          <label className="text-xs text-gray-500 mb-0.5 block">Disc %</label>
          <input
            type="number" min="0" max="100" step="0.5"
            className="w-full border border-gray-200 rounded-xl px-2.5 py-1.5 text-sm text-gray-900"
            placeholder="0"
            value={item.discount}
            onChange={e => onUpdate(item.id, 'discount', e.target.value)}
          />
        </div>
        <div className="w-20">
          <label className="text-xs text-gray-500 mb-0.5 block">SGR lei</label>
          <input
            type="number" min="0" step="0.50"
            className="w-full border border-gray-200 rounded-xl px-2.5 py-1.5 text-sm text-gray-900"
            placeholder="0"
            value={item.sgr}
            onChange={e => onUpdate(item.id, 'sgr', e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500">TVA:</label>
        <div className="flex rounded-lg overflow-hidden border border-gray-200">
          {([11, 21] as const).map(r => (
            <button
              key={r}
              onClick={() => onUpdate(item.id, 'vat', String(r))}
              className={`px-3 py-1 text-xs font-bold transition-all ${item.vat === r ? 'bg-blue-600 text-white' : 'bg-white text-gray-500'}`}
            >
              {r}%
            </button>
          ))}
        </div>
      </div>

      {c && (
        <div className="bg-gray-50 rounded-xl p-2.5 space-y-1 text-xs">
          {c.vatPayer ? (
            <>
              <div className="flex justify-between">
                <span className="text-gray-500">Pret net furnizor</span>
                <span className="font-medium">{fmt2(c.netPrice)} lei</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Adaos ({adaos}%)</span>
                <span className="font-medium">+{fmt2(c.sellExVat - c.netPrice)} lei</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Fara TVA</span>
                <span className="font-medium">{fmt2(c.sellExVat)} lei</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">TVA {item.vat}%</span>
                <span className="font-medium">+{fmt2(c.vatAmt)} lei</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between">
                <span className="text-gray-500">Pret net furnizor</span>
                <span className="font-medium">{fmt2(c.netPrice)} lei</span>
              </div>
              <div className="flex justify-between">
                <span className="text-orange-500">TVA furnizor {item.vat}% (cost)</span>
                <span className="font-medium text-orange-500">+{fmt2(c.inVatAmt)} lei</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Pret de intrare</span>
                <span className="font-medium">{fmt2(c.costWithVat)} lei</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Adaos ({adaos}%)</span>
                <span className="font-medium">+{fmt2(c.adaosAmt)} lei</span>
              </div>
            </>
          )}
          <div className="flex justify-between items-center pt-1 border-t border-gray-200 mt-1">
            <span className="text-gray-600 font-semibold">Pret vanzare</span>
            <span className="text-blue-600 font-bold text-base">{fmt2(c.final)} lei/{item.unit}</span>
          </div>
          {c.sgr > 0 && (
            <div className="flex justify-between">
              <span className="text-orange-500 font-medium">+ Garantie SGR</span>
              <span className="font-medium text-orange-500">+{fmt2(c.sgr)} lei (returnabil)</span>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button onClick={() => onRemove(item.id)} className="text-xs text-red-400">
          Sterge
        </button>
        <button onClick={() => setBoxFormOpen(v => !v)} className="text-xs text-purple-500 font-medium">
          {boxFormOpen ? 'Inchide' : '📦 Corecteaza cutie/bucata'}
        </button>
      </div>

      {boxFormOpen && (
        <div className="bg-purple-50 rounded-xl p-2.5 space-y-1.5">
          <p className="text-xs text-purple-700">
            Daca pretul de mai sus e gresit pentru ca produsul vine in cutie/bax, completeaza aici pretul cutiei intregi (fara TVA) si cate bucati contine — corectam pretul acum si retinem raportul pentru viitoarele scanari de la acest furnizor.
          </p>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-0.5 block">Pret cutie (fara TVA)</label>
              <input type="number" min="0" step="0.01"
                className="w-full border border-gray-200 rounded-xl px-2.5 py-1.5 text-sm text-gray-900"
                placeholder="0.00" value={boxPrice} onChange={e => setBoxPrice(e.target.value)} />
            </div>
            <div className="w-28">
              <label className="text-xs text-gray-500 mb-0.5 block">Bucati/cutie</label>
              <input type="number" min="2" step="1"
                className="w-full border border-gray-200 rounded-xl px-2.5 py-1.5 text-sm text-gray-900"
                placeholder="24" value={boxPieces} onChange={e => setBoxPieces(e.target.value)} />
            </div>
          </div>
          {!supplier.trim() && (
            <p className="text-xs text-amber-600">Fara furnizor completat mai sus, pretul se corecteaza dar raportul nu se retine pentru viitor.</p>
          )}
          {boxError && <p className="text-xs text-red-500">{boxError}</p>}
          <button onClick={saveBoxRatio} disabled={boxSaving}
            className={`w-full py-2 rounded-xl text-sm font-semibold text-white disabled:bg-gray-300 ${boxSaved ? 'bg-green-500' : 'bg-purple-600'}`}>
            {boxSaved ? '✓ Salvat!' : boxSaving ? 'Se salveaza...' : 'Corecteaza si retine'}
          </button>
        </div>
      )}
    </div>
  )
}
