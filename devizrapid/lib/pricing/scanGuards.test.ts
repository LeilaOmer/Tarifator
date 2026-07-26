import { describe, it, expect } from 'vitest'
import {
  isNonProductLine, phantomRowIndexes, reconcileUnitPrice,
  dedupeScannedItems, classifySgr, applySgrFromGuaranteeLines,
} from './scanGuards'

describe('isNonProductLine — exclude garantiile', () => {
  it.each([
    'GARANTIE PET', 'GARANTIE STICLA', 'Garantie-Returnare', 'GARANTIA AMBALAJ',
    'SGR', 'SGR 0.50', 'AMBALAJ SGR', 'PALET STANDARD', 'KEG 30L 1x1',
  ])('exclude: %s', name => expect(isNonProductLine(name)).toBe(true))
})

describe('isNonProductLine — NU mai sterge marfa reala (regresie)', () => {
  // Un comerciant care VINDE ambalaje si paleti isi vedea catalogul disparand,
  // tacut, la fiecare scanare. Cifrele din denumire (dimensiuni, gramaje) sunt
  // semnalul ca e produs, nu linie de depozit.
  it.each([
    'PALETI LEMN 1200x800',
    'PALET EURO 1200X800 EPAL',
    'AMBALAJE CARTON 300x200',
    'AMBALAJ CARTON 5 STRATURI',
    'RETURNARE MARFA',           // linie de storno, nu garantie
    'RETUR MARFA DEFECTA',
    'BERE KEG 30L',              // berea, nu butoiul gol
    'GARNITURA CAUCIUC',         // contine "garni", nu "garanti"
    'PALETINA PLASTIC 25MM',
    'SGRAFFITO VOPSEA DECORATIVA',
  ])('pastreaza: %s', name => expect(isNonProductLine(name)).toBe(false))
})

describe('phantomRowIndexes', () => {
  it('elimina fantoma: nume trunchiat + fara date proprii de rand', () => {
    const out = phantomRowIndexes([
      { name: 'APA MIN NECARB 2L', verified: false },
      { name: 'APA MIN NECARB 2L BORSEC', verified: true },
    ])
    expect([...out]).toEqual([0])
  })

  it('NU atinge doua produse reale, amandoua cu date de rand', () => {
    const out = phantomRowIndexes([
      { name: 'APA MIN NECARB 2L', verified: true },
      { name: 'APA MIN NECARB 2L BORSEC', verified: true },
    ])
    expect([...out]).toEqual([])
  })

  it('nu elimina nimic pe un document unde niciun rand nu e verificat', () => {
    // Aviz simplu, fara coloane de cantitate/valoare: nu avem pe ce ne baza.
    const out = phantomRowIndexes([
      { name: 'APA MIN NECARB 2L', verified: false },
      { name: 'APA MIN NECARB 2L BORSEC', verified: false },
    ])
    expect([...out]).toEqual([])
  })

  it('numele prea scurte nu declanseaza filtrul', () => {
    expect([...phantomRowIndexes([
      { name: 'MERE', verified: false },
      { name: 'MERE IONATHAN ROSII', verified: true },
    ])]).toEqual([])
  })
})

describe('reconcileUnitPrice — cantitate x pret ≈ valoare', () => {
  it('pastreaza pretul declarat cand se verifica', () => {
    expect(reconcileUnitPrice(2.7927, 2304, 6434.59)).toBe(2.7927)
  })
  it('recupereaza pretul cand citirea declarata e rupta', () => {
    expect(reconcileUnitPrice(69.46, 921, 87183.36)).toBeCloseTo(94.66, 2)
  })
  it('accepta valoarea de rand deja NETA de discount', () => {
    expect(reconcileUnitPrice(10, 5, 45, 10)).toBe(10)
  })
  it('tolereaza separatorul romanesc de mii (factor 1000)', () => {
    expect(reconcileUnitPrice(2.5, 4.56, 11400)).toBe(2.5)
  })
  it('fara cantitate sau valoare, pastreaza declaratul', () => {
    expect(reconcileUnitPrice(5, 0, 100)).toBe(5)
    expect(reconcileUnitPrice(5, 10, 0)).toBe(5)
  })
})

describe('classifySgr — cap. 4 BUSINESS_RULES', () => {
  it.each([
    ['APA MINERALA BORSEC 2L', 0.5],
    ['COCA COLA 0.5L PET', 0.5],
    ['BERE TIMISOREANA 0,33L DOZA', 0.5],
    ['VIN ROSU 0.75L', 0.5],
  ])('%s => %s', (n, e) => expect(classifySgr(n)).toBe(e))

  it.each([
    ['APA PLATA 5L', 0],            // peste 3L
    ['LAPTE ZUZU 1L', 0],           // lactate excluse prin lege
    ['IAURT 400G', 0],
    ['SIROP SOCATA 0.7L', 0],
    ['BERE HEINEKEN NAVETA 20X0.5L', 0], // naveta, nu ambalaj individual
    ['ULEI FLORAL 1L', 0],
  ])('%s => %s', (n, e) => expect(classifySgr(n)).toBe(e))
})

describe('dedupeScannedItems', () => {
  it('contopeste acelasi rand citit din doua felii (pret egal)', () => {
    const out = dedupeScannedItems([
      { name: 'BISCUITI OREO INTREG', supplier_price: 3.5, verified: false },
      { name: 'BISCUITI OREO INTREGI /22 B', supplier_price: 3.5, verified: true },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('BISCUITI OREO INTREGI /22 B') // citirea mai completa castiga
  })

  it('numele SCURTE se contopesc doar daca sunt identice (deliberat)', () => {
    // Pragul de 10 caractere apara produse diferite cu nume scurte asemanatoare
    // ("MERE" vs "PERE"). Consecinta: "OREO" si "OREO /22 B" raman separate —
    // acceptat, pentru ca fuziunea gresita a doua produse reale e mai scumpa
    // decat un duplicat vizibil, pe care omul il sterge dintr-o atingere.
    expect(dedupeScannedItems([
      { name: 'OREO', supplier_price: 3.5, verified: false },
      { name: 'OREO /22 B', supplier_price: 3.5, verified: true },
    ])).toHaveLength(2)
  })

  it('pastreaza doua LOTURI reale ale aceluiasi produs (preturi diferite)', () => {
    const out = dedupeScannedItems([
      { name: 'BRANZA TELEMEA VACA 500G', supplier_price: 12.5, verified: true },
      { name: 'BRANZA TELEMEA VACA 500G', supplier_price: 13.2, verified: true },
    ])
    expect(out).toHaveLength(2)
  })

  it('randul verificat bate randul neverificat la pret diferit', () => {
    const out = dedupeScannedItems([
      { name: 'APA MIN NECARB 2L BORSEC', supplier_price: 3.84, verified: false },
      { name: 'APA MIN NECARB 2L BORSEC', supplier_price: 2.15, verified: true },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].supplier_price).toBe(2.15)
  })
})

describe('applySgrFromGuaranteeLines', () => {
  it('linia de garantie marcheaza produsul precedent cu aceeasi cantitate', () => {
    const items = [
      { name: 'APA BORSEC 2L', quantity: 12 },
      { name: 'GARANTIE PET', quantity: 12 },
    ]
    applySgrFromGuaranteeLines(items)
    expect(items[0]).toMatchObject({ sgr: 0.5 })
  })

  it('linia CUMULATA de la final nu marcheaza gresit ultimul produs', () => {
    const items = [
      { name: 'APA BORSEC 2L', quantity: 12 },
      { name: 'SUC PORTOCALE 1L', quantity: 6 },
      { name: 'GARANTIE PET', quantity: 18 }, // suma, nu cantitatea unui produs
    ]
    applySgrFromGuaranteeLines(items)
    expect(items[1]).not.toMatchObject({ sgr: 0.5 })
  })
})
