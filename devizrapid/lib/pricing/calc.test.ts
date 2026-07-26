import { describe, it, expect } from 'vitest'
import { applyRounding, calcItem, parseAdaos, type Item } from './calc'

const item = (o: Partial<Item> = {}): Item => ({
  id: 'x', name: 'p', unit: 'buc', supplierPrice: '10', discount: '0', vat: 21, sgr: '0', ...o,
})

// Referinta exacta: aceeasi regula, dar in bani intregi — imposibil de afectat
// de reprezentarea binara. Daca implementarea si referinta difera, e bug.
function refRound(price: number, step: string, mode: 'nearest' | 'up'): number {
  const cents = Math.round(price * 100)
  if (step === 'none') return cents / 100
  const s = Math.round(parseFloat(step) * 100)
  return ((mode === 'nearest' ? Math.round(cents / s) : Math.ceil(cents / s)) * s) / 100
}

describe('applyRounding', () => {
  // Regresia principala: 12.35 / 0.1 = 123.49999999999999 in binar => 12.30.
  it.each([
    [0.15, 0.2], [0.35, 0.4], [0.95, 1.0], [1.15, 1.2],
    [1.45, 1.5], [2.05, 2.1], [2.55, 2.6], [12.35, 12.4], [33.45, 33.5],
  ])('rotunjeste %s la 0.10 => %s (nu in jos)', (input, expected) => {
    expect(applyRounding(input, '0.10', 'nearest')).toBeCloseTo(expected, 10)
  })

  // Acopera TOATE preturile 0.01..200.00, pe toti pasii si ambele moduri.
  // Inainte de fix: 698 esecuri pe (0.10, nearest).
  it.each([
    ['0.10', 'nearest'], ['0.10', 'up'],
    ['0.50', 'nearest'], ['0.50', 'up'],
    ['1.00', 'nearest'], ['1.00', 'up'],
    ['none', 'nearest'],
  ] as const)('pas %s / mod %s: exact pe 20.000 de preturi', (step, mode) => {
    const bad: number[] = []
    for (let c = 1; c <= 20_000; c++) {
      const p = c / 100
      const got = +applyRounding(p, step, mode).toFixed(2)
      const want = +refRound(p, step, mode).toFixed(2)
      if (got !== want) bad.push(p)
    }
    expect(bad).toEqual([])
  })

  it('nu lasa reziduuri de virgula mobila in rezultat', () => {
    expect(applyRounding(7.05, '0.10', 'nearest')).toBe(7.1)  // era 7.1000000000000005
    expect(applyRounding(8.2, '0.10', 'up')).toBe(8.2)        // era 8.200000000000001
  })
})

describe('calcItem — plafoane pe intrari (nu mai iese pret negativ)', () => {
  it('discount peste 100% nu mai da pret negativ', () => {
    const c = calcItem(item({ discount: '150' }), 30, 'none', 'nearest')
    expect(c.netPrice).toBe(0)
    expect(c.final).toBe(0)
    expect(c.final).toBeGreaterThanOrEqual(0)
  })

  it('discount negativ nu mai umfla pretul', () => {
    const c = calcItem(item({ discount: '-50' }), 30, 'none', 'nearest')
    expect(c.netPrice).toBe(10)          // era 15 (pret marit cu 50%)
  })

  it('adaos negativ nu mai da pret de vanzare negativ', () => {
    const c = calcItem(item(), -200, 'none', 'nearest')
    expect(c.final).toBeGreaterThanOrEqual(0)
  })

  it('pret furnizor negativ e tratat ca 0', () => {
    expect(calcItem(item({ supplierPrice: '-10' }), 30, 'none', 'nearest').final).toBe(0)
  })

  it('SGR negativ e tratat ca 0', () => {
    expect(calcItem(item({ sgr: '-5' }), 30, 'none', 'nearest').sgr).toBe(0)
  })

  it('intrari nenumerice nu propaga NaN', () => {
    const c = calcItem(item({ supplierPrice: 'abc', discount: 'x', sgr: '' }), 30, 'none', 'nearest')
    expect(Number.isFinite(c.final)).toBe(true)
    expect(c.final).toBe(0)
  })
})

describe('calcItem — regulile din BUSINESS_RULES cap. 2', () => {
  it('platitor: net -> +adaos -> +TVA (TVA separat la client)', () => {
    const c = calcItem(item({ supplierPrice: '100', vat: 21 }), 30, 'none', 'nearest', true)
    expect(c.netPrice).toBe(100)
    expect(c).toMatchObject({ vatPayer: true })
    if (c.vatPayer) {
      expect(c.sellExVat).toBe(130)
      expect(c.vatAmt).toBeCloseTo(27.3, 6)
      expect(c.final).toBeCloseTo(157.3, 6)
    }
  })

  it('neplatitor: TVA furnizor intra in COST, fara TVA la client', () => {
    const c = calcItem(item({ supplierPrice: '100', vat: 21 }), 30, 'none', 'nearest', false)
    expect(c).toMatchObject({ vatPayer: false })
    if (!c.vatPayer) {
      expect(c.costWithVat).toBeCloseTo(121, 6)
      expect(c.final).toBeCloseTo(157.3, 6)
    }
  })

  it('discountul se scade INAINTE de adaos, o singura data', () => {
    const c = calcItem(item({ supplierPrice: '100', discount: '10' }), 30, 'none', 'nearest', true)
    expect(c.netPrice).toBe(90)
    if (c.vatPayer) expect(c.sellExVat).toBe(117)
  })

  it('SGR nu intra in baza de adaos sau de TVA', () => {
    const fara = calcItem(item({ supplierPrice: '10', sgr: '0' }), 30, 'none', 'nearest', true)
    const cu = calcItem(item({ supplierPrice: '10', sgr: '0.5' }), 30, 'none', 'nearest', true)
    expect(cu.final).toBe(fara.final)
    expect(cu.sgr).toBe(0.5)
  })
})

describe('parseAdaos — aceeasi valoare pentru calcul si pentru afisare', () => {
  it.each([['30', 30], ['-5', 0], ['abc', 0], ['99999', 1000], ['', 0]])(
    '%s => %s', (input, expected) => expect(parseAdaos(input as string)).toBe(expected),
  )
})
