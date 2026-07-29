import Link from 'next/link'
import type { Metadata } from 'next'
import { existsSync } from 'fs'
import { join } from 'path'
import { SITE_URL } from '@/lib/site'

// Captura reala a fisei (roadmap: "creste conversia mult"). Se afiseaza DOAR daca
// fisierul exista, ca landing-ul sa nu ramana cu o imagine rupta cat timp
// screenshot-ul nu e facut. Pune `public/captura-fisa.png` si sectiunea apare
// singura — verificarea se face la build, pagina fiind statica.
const FISA_CAPTURE = '/captura-fisa.png'
const hasFisaCapture = existsSync(join(process.cwd(), 'public', FISA_CAPTURE.slice(1)))

export const metadata: Metadata = {
  title: 'Tarifator – Raspunsul la „Cat costa?" | Fisa Servicii & Calculator Pret',
  description: 'Raspunsul instant la „cat costa?" — pentru prestatori de servicii (fisa prin dictare vocala cu preturile tale) si comercianti (calculator pret cu adaos si TVA). Clientul primeste un document clar. Plan gratuit permanent, fara card.',
  alternates: { canonical: SITE_URL },
}

export default function LandingPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Tarifator',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, Android, iOS',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'RON',
      description: 'Plan gratuit permanent',
    },
    description: 'Raspunsul instant la „cat costa?" — fisa de servicii prin dictare vocala pentru prestatori si calculator pret cu adaos si TVA pentru comercianti.',
    url: SITE_URL,
    inLanguage: 'ro',
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Nav */}
      <nav className="px-6 py-5 flex items-center justify-between max-w-3xl mx-auto border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Tarifator" className="w-8 h-8 rounded-lg" />
          <span className="font-bold text-lg text-gray-900">Tarifator</span>
        </div>
        <Link href="/login" className="text-sm font-medium text-gray-500 hover:text-gray-900">
          Autentificare
        </Link>
      </nav>

      {/* Hero */}
      <section className="px-6 pt-16 pb-16 max-w-3xl mx-auto">
        <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-4">
          Plan gratuit · Fara card
        </p>
        <h1 className="text-5xl font-bold text-gray-900 leading-tight mb-6 max-w-xl">
          „Cat costa?" — raspunsul in cateva secunde.
        </h1>
        <p className="text-xl text-gray-500 mb-4 max-w-lg leading-relaxed">
          Oferi un serviciu? Spui ce ai facut si fisa se completeaza singura.<br />
          Vinzi produse? Pui factura in aplicatie si afli imediat cu cat sa vinzi.
        </p>
        <p className="text-sm text-gray-500 mb-10 max-w-lg">
          Clientul primeste un document clar pe WhatsApp.
        </p>
        <Link href="/login"
          className="inline-block px-8 py-3.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors">
          Incearca gratuit
        </Link>
      </section>

      {/* Un singur instrument */}
      <section className="border-t border-gray-100 px-6 py-16 max-w-3xl mx-auto">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Ce face</p>
        <h2 className="text-2xl font-bold text-gray-900 mb-10 max-w-xl">Un singur instrument, pe care il foloseste aproape oricine.</h2>
        <div className="grid md:grid-cols-2 gap-12">
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-3">Oferi un serviciu?</h3>
            <p className="text-gray-500 leading-relaxed mb-4">
              Spui ce ai facut, iar serviciile si preturile tale se completeaza singure. In cateva secunde ai un document gata de trimis.
            </p>
            <ul className="space-y-2 text-sm text-gray-500">
              <li className="flex items-start gap-2"><span className="w-1 h-1 rounded-full bg-blue-400 shrink-0 mt-1.5"></span>Spui ce ai facut, fisa se completeaza singura</li>
              <li className="flex items-start gap-2"><span className="w-1 h-1 rounded-full bg-blue-400 shrink-0 mt-1.5"></span>Iti tii clientii si serviciile la un loc, gata de refolosit</li>
              <li className="flex items-start gap-2"><span className="w-1 h-1 rounded-full bg-blue-400 shrink-0 mt-1.5"></span>Trimiti clientului un document ingrijit, direct pe WhatsApp</li>
            </ul>
            {hasFisaCapture && (
              <figure className="mt-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={FISA_CAPTURE} alt="Fisa de servicii trimisa clientului ca PDF pe WhatsApp"
                  className="w-full max-w-xs rounded-xl border border-gray-200" />
                <figcaption className="text-xs text-gray-500 mt-2">Asa arata fisa primita de client.</figcaption>
              </figure>
            )}
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-3">Vinzi produse?</h3>
            <p className="text-gray-500 leading-relaxed mb-4">
              Pui cat te-a costat, alegi adaosul si afli pe loc cu cat sa vinzi — corect, cu tot cu TVA.
            </p>
            <ul className="space-y-2 text-sm text-gray-500">
              <li className="flex items-start gap-2"><span className="w-1 h-1 rounded-full bg-green-500 shrink-0 mt-1.5"></span>Afli pe loc cu cat sa vinzi, cu adaosul tau</li>
              <li className="flex items-start gap-2"><span className="w-1 h-1 rounded-full bg-green-500 shrink-0 mt-1.5"></span>Iti arata si cat te costa marfa in realitate, cu tot cu TVA</li>
              <li className="flex items-start gap-2"><span className="w-1 h-1 rounded-full bg-green-500 shrink-0 mt-1.5"></span>Scoti lista ca PDF: una pentru tine, una pentru raft</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Scanare - highlight */}
      <section className="border-t border-gray-100 bg-gray-50 px-6 py-16">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Cel mai simplu</p>
          <h2 className="text-2xl font-bold text-gray-900 mb-4 max-w-xl">Pui factura, preturile ies singure.</h2>
          <p className="text-gray-500 leading-relaxed mb-6 max-w-lg">
            Incarci factura sau ii faci o poza, iar aplicatia scoate produsele, cantitatile si preturile — gata de folosit. Merge si cu bonurile de la Lidl, Kaufland sau Metro.
          </p>
          <ul className="space-y-2 text-sm text-gray-500 max-w-lg">
            <li className="flex items-start gap-2"><span className="w-1 h-1 rounded-full bg-green-500 shrink-0 mt-1.5"></span>Recunoaste si bonurile de casa, nu doar facturile</li>
            <li className="flex items-start gap-2"><span className="w-1 h-1 rounded-full bg-green-500 shrink-0 mt-1.5"></span>Imparte singura pretul de la cutie la bucata</li>
            <li className="flex items-start gap-2"><span className="w-1 h-1 rounded-full bg-green-500 shrink-0 mt-1.5"></span>Tine cont de reduceri si de garantia ambalajelor</li>
          </ul>
          <Link href="/demo"
            className="inline-block mt-8 px-6 py-3 border border-gray-300 text-gray-900 font-semibold rounded-xl hover:border-gray-400 transition-colors">
            Vezi cum merge, pe o factura-exemplu
          </Link>
          <p className="text-xs text-gray-500 mt-3">Fara cont, direct in pagina.</p>
        </div>
      </section>

      {/* Pentru cine */}
      <section className="border-t border-gray-100 px-6 py-16 max-w-3xl mx-auto">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-6">Pentru cine</p>
        <p className="text-2xl font-bold text-gray-900 mb-6 max-w-xl">
          Pentru aproape oricine da un pret.
        </p>
        <div className="grid md:grid-cols-2 gap-8 max-w-2xl">
          <div>
            <p className="font-semibold text-gray-900 mb-2">Oricine ofera un serviciu</p>
            <p className="text-gray-500 text-sm leading-relaxed">Coafor, reparatii, instalatii, curatenie, transport, cazare, meditatii, foto — oricine face o treaba si da un pret clientului.</p>
          </div>
          <div>
            <p className="font-semibold text-gray-900 mb-2">Mici comercianti</p>
            <p className="text-gray-500 text-sm leading-relaxed">Magazine, distribuitori, revanzatori — oricine cumpara marfa si trebuie sa puna un pret corect.</p>
          </div>
        </div>
      </section>

      {/* Preturi */}
      <section className="border-t border-gray-100 px-6 py-16 max-w-3xl mx-auto">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Preturi</p>
        <p className="text-sm text-gray-500 mb-8">Primii 50 de utilizatori inregistrati beneficiaza de pretul redus (marcat cu verde).</p>
        <div className="divide-y divide-gray-100 border border-gray-100 rounded-2xl overflow-hidden">

          <div className="px-6 py-5 flex justify-between items-center bg-green-50">
            <div>
              <p className="font-semibold text-gray-900">Free</p>
              <p className="text-sm text-gray-500 mt-0.5">3 fise + 3 calcule / luna · Fara card</p>
            </div>
            <p className="text-2xl font-bold text-green-600 whitespace-nowrap shrink-0 pl-3">0 lei</p>
          </div>

          <div className="px-6 py-5 flex justify-between items-center gap-3">
            <div>
              <p className="font-semibold text-gray-900">Artizan</p>
              <p className="text-sm text-gray-500 mt-0.5">Fise nelimitate · 3 calcule / luna</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-2xl font-bold text-gray-900 whitespace-nowrap">59 <span className="text-sm font-normal text-gray-500">lei/luna</span></p>
              <p className="text-xs font-semibold text-green-600 whitespace-nowrap">39 lei primii 50</p>
            </div>
          </div>

          <div className="px-6 py-5 flex justify-between items-center gap-3">
            <div>
              <p className="font-semibold text-gray-900">Mercator</p>
              <p className="text-sm text-gray-500 mt-0.5">Calcule nelimitate · 3 fise / luna</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-2xl font-bold text-gray-900 whitespace-nowrap">129 <span className="text-sm font-normal text-gray-500">lei/luna</span></p>
              <p className="text-xs font-semibold text-green-600 whitespace-nowrap">89 lei primii 50</p>
            </div>
          </div>

          <div className="px-6 py-5 flex justify-between items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-gray-900">Pro</p>
                <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Recomandat</span>
              </div>
              <p className="text-sm text-gray-500 mt-0.5">Fise si calcule nelimitate</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-2xl font-bold text-gray-900 whitespace-nowrap">149 <span className="text-sm font-normal text-gray-500">lei/luna</span></p>
              <p className="text-xs font-semibold text-green-600 whitespace-nowrap">99 lei primii 50</p>
            </div>
          </div>

        </div>
        <p className="text-xs text-gray-500 mt-4">TVA si firmele multiple sunt gratuite pe orice plan. Primele 30 de zile: 30 fise + 30 calcule.</p>
      </section>

      {/* CTA final */}
      <section className="border-t border-gray-100 px-6 py-16 max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Incearca gratuit.</h2>
        <p className="text-gray-500 mb-8">Fara card. Fara angajament. Daca nu e pentru tine, nu platesti nimic.</p>
        <Link href="/login"
          className="inline-block px-8 py-3.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors">
          Creeaza cont gratuit
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 px-6 py-8 max-w-3xl mx-auto flex flex-wrap justify-between items-center gap-4 text-sm text-gray-500">
        <span>© 2026 Tarifator</span>
        <div className="flex gap-6">
          <Link href="/termeni" className="hover:text-gray-600">Termeni</Link>
          <Link href="/confidentialitate" className="hover:text-gray-600">Confidentialitate</Link>
          <a href="mailto:contact.tarifator@gmail.com" className="hover:text-gray-600">contact.tarifator@gmail.com</a>
        </div>
      </footer>
    </div>
  )
}
