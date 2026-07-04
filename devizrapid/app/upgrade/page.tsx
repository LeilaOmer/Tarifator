'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

type Tier = {
  name: string
  icon: string
  price: number
  promoPrice: number
  fise: string
  calcule: string
  highlight?: boolean
}

const TIERS: Tier[] = [
  { name: 'Free', icon: '🆓', price: 0, promoPrice: 0, fise: '3 / luna', calcule: '3 / luna' },
  { name: 'Artizan', icon: '🔨', price: 59, promoPrice: 39, fise: 'Nelimitat', calcule: '3 / luna' },
  { name: 'Mercator', icon: '🧮', price: 129, promoPrice: 89, fise: '3 / luna', calcule: 'Nelimitat' },
  { name: 'Pro', icon: '⚡', price: 149, promoPrice: 99, fise: 'Nelimitat', calcule: 'Nelimitat', highlight: true },
]

function UpgradeContent() {
  const router = useRouter()
  const params = useSearchParams()
  const type = params.get('type')
  const [promoRemaining, setPromoRemaining] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/promo-status')
      .then(res => res.json())
      .then(data => { if (typeof data.remaining === 'number') setPromoRemaining(data.remaining) })
      .catch(() => {})
  }, [])

  const limitMessage = type === 'fise'
    ? 'Ai atins limita de fise pe luna aceasta.'
    : type === 'calcule'
    ? 'Ai atins limita de calcule de pret pe luna aceasta.'
    : null

  const promoActive = promoRemaining === null || promoRemaining > 0

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-4">

        <div className="text-center space-y-1 pb-1">
          {limitMessage && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-4 text-sm text-amber-700 font-medium">
              {limitMessage}
            </div>
          )}
          <h1 className="text-2xl font-bold text-gray-900">Alege abonamentul tau</h1>
          <p className="text-sm text-gray-500">Doua module: Fise Servicii si Calculator Pret. Fiecare abonament ridica limita pe unul sau pe ambele.</p>
          {promoActive && promoRemaining !== null && (
            <p className="text-xs font-bold text-green-600 pt-1">Primii 50 la pret redus · mai sunt {promoRemaining} locuri</p>
          )}
        </div>

        {TIERS.map(tier => (
          <div key={tier.name}
            className={`bg-white rounded-2xl shadow-sm p-5 space-y-3 relative ${tier.highlight ? 'border-2 border-purple-200' : 'border border-gray-100'}`}>
            {tier.highlight && (
              <div className="absolute top-3 right-3 bg-purple-100 text-purple-600 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">Recomandat</div>
            )}
            <div className="flex items-center gap-3">
              <span className="text-2xl">{tier.icon}</span>
              <div>
                <p className="font-bold text-gray-900">{tier.name}</p>
                {tier.price === 0 ? (
                  <p className="text-2xl font-black text-gray-900">Gratis</p>
                ) : (
                  <p className="text-2xl font-black text-gray-900">
                    {promoActive ? tier.promoPrice : tier.price}
                    <span className="text-base font-semibold text-gray-500"> lei/luna</span>
                    {promoActive && (
                      <span className="text-sm font-semibold text-gray-400 line-through ml-2">{tier.price}</span>
                    )}
                  </p>
                )}
              </div>
            </div>
            <ul className="space-y-1.5 text-sm text-gray-600">
              <li className="flex items-center gap-2"><span className="text-green-500 font-bold">✓</span> Fise Servicii: <strong className="text-gray-800">{tier.fise}</strong></li>
              <li className="flex items-center gap-2"><span className="text-green-500 font-bold">✓</span> Calcule Pret: <strong className="text-gray-800">{tier.calcule}</strong></li>
            </ul>
          </div>
        ))}

        <div className="bg-blue-50 rounded-2xl p-4 text-center space-y-1">
          <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide">Activare abonament</p>
          <p className="text-sm font-bold text-blue-800">contact.tarifator@gmail.com</p>
          <p className="text-xs text-blue-500">Raspundem in maxim 24 de ore</p>
        </div>

        <button
          onClick={() => router.push('/dashboard')}
          className="w-full py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
          Inapoi la dashboard
        </button>

      </div>
    </div>
  )
}

export default function UpgradePage() {
  return (
    <Suspense>
      <UpgradeContent />
    </Suspense>
  )
}
