import { describe, it, expect } from 'vitest'
import { computeQuoteTotals, clampDiscount } from './totals'

const items = [
  { quantity: 2, unit_price: 300, total: 600 },
  { quantity: 1, unit_price: 400, total: 400 },
] // subtotal brut = 1000

describe('clampDiscount — nu mai poate iesi din intervalul legitim', () => {
  it.each([
    ['150', 'pct' as const, 100],   // procent peste 100 => plafonat
    ['-50', 'pct' as const, 0],     // negativ => 0 (nu mai umfla pretul)
    ['abc', 'pct' as const, 0],
    ['', 'pct' as const, 0],
    ['10', 'pct' as const, 10],     // valoare legitima, neatinsa
    ['5000', 'val' as const, 1000], // valoare peste subtotal => plafonat la subtotal
    ['250', 'val' as const, 250],
  ])('%s (%s) => %s', (raw, type, expected) => {
    expect(clampDiscount(raw, type, 1000)).toBe(expected)
  })
})

describe('computeQuoteTotals — TOTALUL nu mai poate fi negativ', () => {
  it('discount 150% nu mai produce total negativ pe documentul clientului', () => {
    const t = computeQuoteTotals(items, '150', 'pct', 21)
    expect(t.subtotalNet).toBe(0)
    expect(t.vatAmount).toBe(0)
    expect(t.total).toBe(0)
    expect(t.total).toBeGreaterThanOrEqual(0)
  })

  it('discount in RON peste subtotal nu mai produce total negativ', () => {
    const t = computeQuoteTotals(items, '5000', 'val', 21)
    expect(t.total).toBe(0)
  })

  it('TVA nu mai poate fi negativ', () => {
    for (const d of ['150', '999', '-20']) {
      expect(computeQuoteTotals(items, d, 'pct', 21).vatAmount).toBeGreaterThanOrEqual(0)
    }
  })

  it('discount negativ nu mai umfla totalul', () => {
    expect(computeQuoteTotals(items, '-50', 'pct', 0).total).toBe(1000)
  })
})

describe('computeQuoteTotals — calculul corect ramane neschimbat', () => {
  it('discount procentual + TVA', () => {
    const t = computeQuoteTotals(items, '10', 'pct', 21)
    expect(t).toMatchObject({
      subtotalBrut: 1000, discountVal: 100, subtotalNet: 900,
      vatAmount: 189, total: 1089,
    })
  })

  it('discount in valoare absoluta', () => {
    const t = computeQuoteTotals(items, '250', 'val', 21)
    expect(t).toMatchObject({ discountVal: 250, subtotalNet: 750, vatAmount: 157.5, total: 907.5 })
  })

  it('fara firma (artizan) => fara TVA pe document', () => {
    const t = computeQuoteTotals(items, '0', 'pct', 0)
    expect(t.vatAmount).toBe(0)
    expect(t.total).toBe(1000)
  })

  it('cota redusa 11%', () => {
    expect(computeQuoteTotals(items, '0', 'pct', 11).vatAmount).toBe(110)
  })

  it('lista goala nu produce NaN', () => {
    const t = computeQuoteTotals([], '10', 'pct', 21)
    expect(Object.values(t).every(Number.isFinite)).toBe(true)
    expect(t.total).toBe(0)
  })

  it('cade pe quantity x unit_price cand `total` lipseste (coloana generata)', () => {
    const t = computeQuoteTotals([{ quantity: 3, unit_price: 50 }], '0', 'pct', 0)
    expect(t.subtotalBrut).toBe(150)
  })

  it('rezultatele sunt rotunjite la ban, fara reziduuri binare', () => {
    const t = computeQuoteTotals([{ quantity: 3, unit_price: 33.33 }], '7', 'pct', 11)
    for (const v of [t.subtotalBrut, t.discountVal, t.subtotalNet, t.vatAmount, t.total]) {
      expect(v).toBe(Math.round(v * 100) / 100)
    }
  })
})
