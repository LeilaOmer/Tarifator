// Factura-exemplu pentru demo-ul public de pe /demo.
//
// DE CE FABRICATA: exista deja o factura reala in repo
// (`lib/pricing/__fixtures__/ocr-smartcash.txt`), dar aceea are furnizor real si
// preturile LUI de achizitie. Intr-un test e in regula; publicata pe o pagina
// indexabila ar fi o scurgere a marjelor cuiva. Datele de aici sunt inventate.
//
// DE CE AICI si nu in componenta: demo-ul trebuie sa arate EXACT ce arata
// aplicatia. Liniile de mai jos trec prin `calcItem` din `lib/pricing/calc.ts`,
// aceleasi functii ca `/pricing` — niciun pret nu e scris de mana. Regula din
// AGENTS.md: calculul sta in `lib/`, componentele doar afiseaza.
import type { Item } from '@/lib/pricing/calc'

export const DEMO_SUPPLIER = 'Distrib Exemplu SRL'

/** Un rand asa cum apare TIPARIT pe factura furnizorului. */
export type DemoRawLine = {
  name: string
  /** Unitatea de pe factura. Doar `Cut` se imparte pe bucata (BUSINESS_RULES cap. 7). */
  um: 'Buc' | 'Cut'
  qty: number
  /** Pretul de pe factura, pe UM-ul de pe factura. Mereu NET, fara TVA (cap. 2). */
  unitPrice: number
  vat: 11 | 21
  /** 0,50 lei doar la bauturi in ambalaj nereturnabil 0,1-3 L (cap. 4). */
  sgr: 0 | 0.5
  /** Procent de reducere acordat de furnizor, scazut INAINTE de adaos (cap. 3). */
  discount?: number
  /** Cate bucati are cutia, citit din denumire. Doar cand `um === 'Cut'`. */
  boxRatio?: number
  /** Ce a facut aplicatia cu randul asta — text afisat langa rezultat. */
  note?: string
}

// Alese ca sa acopere fix lucrurile care diferentiaza produsul:
// impartirea cutie->bucata, SGR pus SI nepus (contrastul conteaza), ambele cote
// de TVA, si un discount de furnizor.
export const DEMO_LINES: DemoRawLine[] = [
  {
    name: 'APA MINERALA CARPATI 0.5L 12BUC/CUT',
    um: 'Cut', qty: 4, unitPrice: 21.6, vat: 11, sgr: 0.5, boxRatio: 12,
    note: 'Cutie de 12 — pretul s-a impartit pe bucata. Apa la 0,5 L are garantie SGR.',
  },
  {
    name: 'BERE BLONDA 0.33L DOZA 24BUC/CUT',
    um: 'Cut', qty: 2, unitPrice: 62.4, vat: 21, sgr: 0.5, boxRatio: 24,
    note: 'Bautura alcoolica — TVA 21%. Doza de 0,33 L intra la SGR.',
  },
  {
    name: 'CIOCOLATA LAPTE 90G 20BUC/CUT',
    um: 'Cut', qty: 3, unitPrice: 54, vat: 11, sgr: 0, boxRatio: 20,
    note: 'Aliment — TVA 11%. Nu e bautura, deci fara SGR.',
  },
  {
    name: 'LAPTE 1.5% 1L',
    um: 'Buc', qty: 24, unitPrice: 5.9, vat: 11, sgr: 0,
    note: 'Lactatele NU au SGR, desi sunt in ambalaj de 1 L.',
  },
  {
    name: 'SUC PORTOCALE 100% 1L',
    um: 'Buc', qty: 12, unitPrice: 6.5, vat: 11, sgr: 0.5,
    note: 'Bautura nealcoolica in ambalaj de 1 L — are SGR.',
  },
  {
    name: 'PAINE FELIATA 500G',
    um: 'Buc', qty: 30, unitPrice: 3.2, vat: 11, sgr: 0,
  },
  {
    name: 'DETERGENT VASE 500ML',
    um: 'Buc', qty: 18, unitPrice: 8.4, vat: 21, sgr: 0, discount: 10,
    note: 'Nu e aliment — TVA 21%. Furnizorul a dat 10% reducere.',
  },
]

/**
 * Pretul pe BUCATA al unui rand: cel de pe factura, impartit la cate bucati are
 * cutia. Aceeasi rotunjire la 4 zecimale ca la corectia manuala din
 * `app/pricing/ItemCard.tsx`, ca demo-ul sa nu arate alt pret decat aplicatia.
 */
export function piecePrice(line: DemoRawLine): number {
  const ratio = line.um === 'Cut' && line.boxRatio && line.boxRatio > 1 ? line.boxRatio : 1
  return Math.round((line.unitPrice / ratio) * 10000) / 10000
}

/** Cate BUCATI ies dintr-un rand: cantitatea de pe factura x bucatile din cutie. */
export function pieceCount(line: DemoRawLine): number {
  const ratio = line.um === 'Cut' && line.boxRatio && line.boxRatio > 1 ? line.boxRatio : 1
  return line.qty * ratio
}

/**
 * Randul de factura, transformat in `Item`-ul cu care lucreaza calculatorul.
 * Id-uri FIXE, nu `crypto.randomUUID()` ca in `emptyItem`: pagina se randeaza si
 * pe server, iar un id nou la fiecare randare ar da nepotrivire la hidratare.
 */
export function toItem(line: DemoRawLine, index: number): Item {
  return {
    id: `demo-${index}`,
    name: line.name,
    unit: 'buc',
    supplierPrice: String(piecePrice(line)),
    discount: String(line.discount ?? 0),
    vat: line.vat,
    sgr: String(line.sgr),
  }
}

export const DEMO_ITEMS: Item[] = DEMO_LINES.map(toItem)
