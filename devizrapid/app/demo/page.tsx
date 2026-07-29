import Link from 'next/link'
import type { Metadata } from 'next'
import { SITE_URL } from '@/lib/site'
import DemoScan from './DemoScan'

export const metadata: Metadata = {
  title: 'Demo: pui factura, ies preturile de vanzare',
  description: 'Vezi pe o factura-exemplu cum se calculeaza pretul de vanzare: adaos, TVA 11% sau 21%, impartirea de la cutie la bucata si garantia SGR de 0,50 lei. Fara cont, direct in pagina.',
  alternates: { canonical: `${SITE_URL}/demo` },
  openGraph: {
    type: 'website',
    locale: 'ro_RO',
    url: `${SITE_URL}/demo`,
    siteName: 'Tarifator',
    title: 'Demo: pui factura, ies preturile de vanzare',
    description: 'Adaos, TVA, cutie/bucata si SGR — calculate pe o factura-exemplu, fara cont.',
  },
}

// Intrebarile de mai jos exista SI ca text vizibil in pagina. Schema care descrie
// continut inexistent e spam, nu optimizare.
const faq = [
  {
    q: 'Cum se calculeaza pretul de vanzare cu adaos si TVA?',
    a: 'Pretul de la furnizor este fara TVA. Daca esti platitor de TVA, adaosul se aplica pe acest pret, iar TVA-ul (11% sau 21%) se adauga la final, separat, pe factura catre client. Daca nu esti platitor, TVA-ul platit furnizorului este un cost pe care nu-l poti recupera: intra in pretul de intrare, iar adaosul se aplica peste el, fara sa mai adaugi TVA clientului.',
  },
  {
    q: 'Cand se imparte pretul de la cutie la bucata?',
    a: 'Doar cand unitatea de masura de pe factura spune cutie, bax sau set. Un "24 BUC/CUT" scris langa unitatea "Buc" este doar informatie de ambalare si nu se imparte — altfel pretul unei bucati ar iesi de 24 de ori mai mic decat cel real.',
  },
  {
    q: 'La ce produse se adauga garantia SGR de 0,50 lei?',
    a: 'La bauturile in ambalaje nereturnabile de plastic, sticla sau metal, cu volum intre 0,1 si 3 litri: apa, sucuri, racoritoare, bere, cidru, vin. Laptele si lactatele nu intra in sistem, chiar daca ambalajul are 1 litru. Garantia nu face parte din pretul produsului: nu intra in baza de calcul a adaosului si nici a TVA-ului, ci se afiseaza separat.',
  },
]

export default function DemoPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: 'ro',
    mainEntity: faq.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav className="px-6 py-5 flex items-center justify-between max-w-3xl mx-auto border-b border-gray-100">
        <Link href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Tarifator" className="w-8 h-8 rounded-lg" />
          <span className="font-bold text-lg text-gray-900">Tarifator</span>
        </Link>
        <Link href="/login" className="text-sm font-medium text-gray-500 hover:text-gray-900">
          Autentificare
        </Link>
      </nav>

      <section className="px-6 pt-12 pb-8 max-w-3xl mx-auto">
        <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-4">
          Demo · Fara cont
        </p>
        <h1 className="text-4xl font-bold text-gray-900 leading-tight mb-5 max-w-xl">
          Pui factura, ies preturile de vanzare.
        </h1>
        <p className="text-lg text-gray-500 max-w-lg leading-relaxed">
          Mai jos e o factura de furnizor. Apasa pe buton si vezi cu cat trebuie sa vinzi
          fiecare produs — cu adaosul tau, cu TVA-ul corect si cu garantia ambalajelor.
        </p>
      </section>

      <section className="px-6 pb-16 max-w-3xl mx-auto">
        <DemoScan />
      </section>

      {/* Continut real, indexabil — nu e ascuns dupa buton. */}
      <section className="border-t border-gray-100 px-6 py-16 max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-8">Cum se calculeaza, mai exact</h2>
        <div className="space-y-8">
          {faq.map(({ q, a }) => (
            <div key={q}>
              <h3 className="font-semibold text-gray-900 mb-2">{q}</h3>
              <p className="text-gray-500 leading-relaxed">{a}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-gray-500 mt-10">
          Toata aritmetica se face determinist in codul aplicatiei, nu de un model AI.
          La scanare, modelul doar citeste cifrele de pe factura; calculele le face codul —
          un pret gresit distruge increderea, iar modelele gresesc la socoteala.
        </p>
      </section>

      <section className="border-t border-gray-100 px-6 py-16 max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Incearca cu factura ta.</h2>
        <p className="text-gray-500 mb-8">
          Plan gratuit permanent. Fara card. Merge si cu poza de pe telefon, si cu e-Factura.
        </p>
        <Link href="/login"
          className="inline-block px-8 py-3.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors">
          Creeaza cont gratuit
        </Link>
      </section>

      <footer className="border-t border-gray-100 px-6 py-8 max-w-3xl mx-auto flex flex-wrap justify-between items-center gap-4 text-sm text-gray-500">
        <span>© 2026 Tarifator</span>
        <div className="flex gap-6">
          <Link href="/" className="hover:text-gray-600">Acasa</Link>
          <Link href="/termeni" className="hover:text-gray-600">Termeni</Link>
          <Link href="/confidentialitate" className="hover:text-gray-600">Confidentialitate</Link>
        </div>
      </footer>
    </div>
  )
}
