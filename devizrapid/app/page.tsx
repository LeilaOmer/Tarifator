import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Tarifator – Raspunsul la „Cat costa?" | Fisa Servicii & Calculator Pret',
  description: 'Raspunsul instant la „cat costa?" — pentru prestatori de servicii (fisa prin dictare vocala cu preturile tale) si comercianti (calculator pret cu adaos si TVA). Clientul primeste un document clar. Plan gratuit permanent, fara card.',
  alternates: { canonical: 'https://devizele-mele.vercel.app' },
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
    url: 'https://devizele-mele.vercel.app',
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
          Prestezi servicii? Dictezi ce ai lucrat — fisa apare cu preturile tale.<br />
          Vinzi produse? Introduci costul — obtii pretul de vanzare cu adaos si TVA.
        </p>
        <p className="text-sm text-gray-400 mb-10 max-w-lg">
          Clientul primeste un document clar pe WhatsApp. Tu pleci cu banii.
        </p>
        <Link href="/login"
          className="inline-block px-8 py-3.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors">
          Incearca gratuit
        </Link>
      </section>

      {/* Doua instrumente */}
      <section className="border-t border-gray-100 px-6 py-16 max-w-3xl mx-auto">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-10">Ce face</p>
        <div className="grid md:grid-cols-2 gap-12">
          <div>
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-3">Fisa Servicii</p>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Dictezi. Fisa apare.</h2>
            <p className="text-gray-500 leading-relaxed mb-4">
              Spui ce ai lucrat — aplicatia recunoaste serviciile, completeaza cantitatile si calculeaza totalul. PDF-ul e gata de trimis clientului in cateva secunde.
            </p>
            <ul className="space-y-2 text-sm text-gray-500">
              <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-blue-400 shrink-0"></span>Recunoastere vocala in romana</li>
              <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-blue-400 shrink-0"></span>Preturile tale, aplicate automat</li>
              <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-blue-400 shrink-0"></span>PDF profesional, trimis direct</li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-amber-500 uppercase tracking-widest mb-3">Calculator Pret</p>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Pretul corect, la orice produs.</h2>
            <p className="text-gray-500 leading-relaxed mb-4">
              Introduci costul de achizitie, setezi adaosul si TVA-ul — obtii imediat pretul de vanzare si marja reala. Exporti lista ca PDF sau o trimiti direct.
            </p>
            <ul className="space-y-2 text-sm text-gray-500">
              <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-amber-400 shrink-0"></span>Adaos comercial configurabil</li>
              <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-amber-400 shrink-0"></span>TVA 11% si 21%</li>
              <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-amber-400 shrink-0"></span>Export PDF si partajare</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Pentru cine */}
      <section className="border-t border-gray-100 bg-gray-50 px-6 py-16">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-6">Pentru cine</p>
          <p className="text-2xl font-bold text-gray-900 mb-6 max-w-xl">
            Doua categorii, acelasi instrument.
          </p>
          <div className="grid md:grid-cols-2 gap-8 max-w-2xl">
            <div>
              <p className="font-semibold text-gray-900 mb-2">Prestatori de servicii</p>
              <p className="text-gray-500 text-sm leading-relaxed">Electricieni, instalatori, tehnicieni HVAC, contabili, mecanici, curatenie — oricine emite fise de servicii si lucreaza cu clienti.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-2">Mici comercianti</p>
              <p className="text-gray-500 text-sm leading-relaxed">Magazine, distribuitori, revanzatori — oricine cumpara produse si trebuie sa calculeze pretul de vanzare cu adaos si TVA.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Preturi */}
      <section className="border-t border-gray-100 px-6 py-16 max-w-3xl mx-auto">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Preturi</p>
        <p className="text-sm text-gray-400 mb-8">Primii 50 de utilizatori inregistrati beneficiaza de pretul redus (marcat cu verde).</p>
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
              <p className="text-2xl font-bold text-gray-900 whitespace-nowrap">59 <span className="text-sm font-normal text-gray-400">lei/luna</span></p>
              <p className="text-xs font-semibold text-green-600 whitespace-nowrap">39 lei primii 50</p>
            </div>
          </div>

          <div className="px-6 py-5 flex justify-between items-center gap-3">
            <div>
              <p className="font-semibold text-gray-900">Mercator</p>
              <p className="text-sm text-gray-500 mt-0.5">Calcule nelimitate · 3 fise / luna</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-2xl font-bold text-gray-900 whitespace-nowrap">129 <span className="text-sm font-normal text-gray-400">lei/luna</span></p>
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
              <p className="text-2xl font-bold text-gray-900 whitespace-nowrap">149 <span className="text-sm font-normal text-gray-400">lei/luna</span></p>
              <p className="text-xs font-semibold text-green-600 whitespace-nowrap">99 lei primii 50</p>
            </div>
          </div>

        </div>
        <p className="text-xs text-gray-400 mt-4">TVA si firmele multiple sunt gratuite pe orice plan. Primele 30 de zile: 10 fise + 10 calcule.</p>
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
      <footer className="border-t border-gray-100 px-6 py-8 max-w-3xl mx-auto flex flex-wrap justify-between items-center gap-4 text-sm text-gray-400">
        <span>© 2025 Tarifator</span>
        <div className="flex gap-6">
          <Link href="/termeni" className="hover:text-gray-600">Termeni</Link>
          <Link href="/confidentialitate" className="hover:text-gray-600">Confidentialitate</Link>
          <a href="mailto:contact.tarifator@gmail.com" className="hover:text-gray-600">contact.tarifator@gmail.com</a>
        </div>
      </footer>
    </div>
  )
}
