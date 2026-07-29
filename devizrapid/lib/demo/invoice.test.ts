import { describe, it, expect } from 'vitest'
import { calcItem } from '../pricing/calc'
import { DEMO_LINES, DEMO_ITEMS, pieceCount, piecePrice, toItem } from './invoice'

// Demo-ul public de pe /demo vinde exact un lucru: ca cifrele noastre sunt
// corecte. Daca ajunge sa arate alte preturi decat aplicatia, strica fix ce
// promite. Testele de aici leaga datele demo de `lib/pricing/calc.ts` si de
// regulile din BUSINESS_RULES, ca divergenta sa pice in CI, nu pe landing.

describe('piecePrice', () => {
  it('imparte pretul cutiei la numarul de bucati', () => {
    const line = DEMO_LINES.find(l => l.name.startsWith('APA MINERALA'))!
    expect(line.unitPrice).toBe(21.6)
    expect(line.boxRatio).toBe(12)
    expect(piecePrice(line)).toBe(1.8)
  })

  it('lasa neatins pretul randurilor vandute la bucata', () => {
    for (const line of DEMO_LINES.filter(l => l.um === 'Buc')) {
      expect(piecePrice(line)).toBe(line.unitPrice)
    }
  })

  // Regula din BUSINESS_RULES cap. 7: doar UM de tip cutie se imparte.
  it('nu imparte niciodata un rand cu UM=Buc, chiar dac-ar avea raport', () => {
    expect(piecePrice({ ...DEMO_LINES[0], um: 'Buc' })).toBe(21.6)
  })
})

describe('pieceCount', () => {
  it('inmulteste cantitatea cu bucatile din cutie', () => {
    const apa = DEMO_LINES.find(l => l.name.startsWith('APA MINERALA'))!
    expect(pieceCount(apa)).toBe(4 * 12)
  })

  // Invariantul care conteaza: banii nu se pierd la impartire. Cate bucati ies
  // x pretul pe bucata trebuie sa dea inapoi valoarea de pe factura.
  it('pastreaza valoarea randului dupa impartire', () => {
    for (const line of DEMO_LINES) {
      expect(pieceCount(line) * piecePrice(line)).toBeCloseTo(line.qty * line.unitPrice, 10)
    }
  })
})

describe('datele demo respecta regulile de business', () => {
  it('foloseste doar cotele de TVA 11 si 21 (cap. 1)', () => {
    for (const line of DEMO_LINES) expect([11, 21]).toContain(line.vat)
  })

  it('SGR e 0 sau exact 0,50 lei (cap. 4)', () => {
    for (const line of DEMO_LINES) expect([0, 0.5]).toContain(line.sgr)
  })

  // Contrastul e chiar lucrul pe care demo-ul il arata: doua ambalaje de 1 L,
  // unul cu garantie si unul fara. Daca cineva "uniformizeaza" datele, cade aici.
  it('lactatele nu au SGR, dar sucul in acelasi ambalaj de 1 L are', () => {
    const lapte = DEMO_LINES.find(l => l.name.startsWith('LAPTE'))!
    const suc = DEMO_LINES.find(l => l.name.startsWith('SUC'))!
    expect(lapte.sgr).toBe(0)
    expect(suc.sgr).toBe(0.5)
  })

  it('acopera ambele cote, ambele unitati si cel putin un discount', () => {
    expect(new Set(DEMO_LINES.map(l => l.vat))).toEqual(new Set([11, 21]))
    expect(new Set(DEMO_LINES.map(l => l.um))).toEqual(new Set(['Buc', 'Cut']))
    expect(DEMO_LINES.some(l => (l.discount ?? 0) > 0)).toBe(true)
  })
})

describe('toItem', () => {
  it('da id-uri stabile, nu aleatorii (pagina se randeaza si pe server)', () => {
    expect(DEMO_ITEMS.map(i => i.id)).toEqual(DEMO_LINES.map((_, i) => `demo-${i}`))
    expect(toItem(DEMO_LINES[0], 0)).toEqual(toItem(DEMO_LINES[0], 0))
  })

  it('duce in Item pretul pe BUCATA, nu pe cutie', () => {
    const bere = DEMO_LINES.findIndex(l => l.name.startsWith('BERE'))
    expect(DEMO_ITEMS[bere].supplierPrice).toBe('2.6')
    expect(DEMO_ITEMS[bere].unit).toBe('buc')
  })
})

describe('cifrele afisate vin din calcItem, nu din date scrise de mana', () => {
  // Apa: 1,80 net/buc, adaos 25%, TVA 11% => 1,80 * 1,25 = 2,25 => +11% = 2,4975
  // => rotunjit la 0,10 "la cel mai apropiat" = 2,50.
  it('platitor de TVA: adaos pe net, apoi TVA', () => {
    const apa = DEMO_ITEMS[0]
    const c = calcItem(apa, 25, '0.10', 'nearest', true)
    expect(c.netPrice).toBeCloseTo(1.8, 10)
    expect(c.final).toBeCloseTo(2.5, 10)
  })

  // Neplatitor: TVA-ul furnizorului intra in cost, nu se mai adauga TVA la client.
  // Atentie: pasul 'none' NU inseamna "fara rotunjire" — `applyRounding` lucreaza
  // in bani intregi, deci pretul final are mereu 2 zecimale (2,4975 => 2,50).
  it('neplatitor de TVA: TVA furnizor in cost, fara TVA la client', () => {
    const apa = DEMO_ITEMS[0]
    const c = calcItem(apa, 25, 'none', 'nearest', false)
    expect(c.vatPayer).toBe(false)
    expect(c.costWithVat).toBeCloseTo(1.8 * 1.11, 10)
    expect(c.final).toBe(2.5)
  })

  // Discountul se scade INAINTE de adaos (cap. 3), nu dupa.
  it('discountul furnizorului se scade inaintea adaosului', () => {
    const det = DEMO_ITEMS.find(i => i.name.startsWith('DETERGENT'))!
    const c = calcItem(det, 30, 'none', 'nearest', true)
    expect(c.netPrice).toBeCloseTo(8.4 * 0.9, 10)
    expect(c.sellExVat).toBeCloseTo(8.4 * 0.9 * 1.3, 10)
  })

  // SGR nu intra in baza de adaos si nici in TVA (cap. 4) — se afiseaza separat.
  it('SGR nu influenteaza pretul calculat', () => {
    const suc = DEMO_ITEMS.find(i => i.name.startsWith('SUC'))!
    const faraSgr = calcItem({ ...suc, sgr: '0' }, 20, 'none', 'nearest', true)
    const cuSgr = calcItem(suc, 20, 'none', 'nearest', true)
    expect(cuSgr.final).toBe(faraSgr.final)
    expect(cuSgr.sgr).toBe(0.5)
  })
})
