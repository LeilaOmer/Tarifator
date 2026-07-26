export type RoundStep = 'none' | '0.10' | '0.50' | '1.00'
export type RoundMode = 'nearest' | 'up'

export type Item = {
  id: string
  name: string
  unit: string
  supplierPrice: string
  discount: string
  vat: 11 | 21
  sgr: string
}

export const emptyItem = (defaultVat: 11 | 21 = 21): Item => ({
  id: crypto.randomUUID(),
  name: '', unit: 'buc', supplierPrice: '', discount: '0',
  vat: defaultVat, sgr: '0',
})

// Rotunjirea se face in BANI INTREGI, nu in lei zecimali. Pasii 0.10 si 1.00 nu
// sunt reprezentabili exact in binar, iar `Math.round(price / 0.1) * 0.1` da
// pretul GRESIT pe ~3.5% din preturi (12.35 / 0.1 = 123.49999999999999 => 12.30
// in loc de 12.40) — si mereu in JOS, deci comerciantul pierde de fiecare data.
// Pe intregi nu exista eroare de reprezentare, deci rezultatul e cel asteptat.
export function applyRounding(price: number, step: RoundStep, mode: RoundMode): number {
  const cents = Math.round(price * 100)
  if (step === 'none') return cents / 100
  const s = Math.round(parseFloat(step) * 100)
  if (!(s > 0)) return cents / 100
  const n = mode === 'nearest' ? Math.round(cents / s) : Math.ceil(cents / s)
  return (n * s) / 100
}

// Plafoane pe intrarile de la utilizator SI de la scanare. Fara ele, un discount
// de 150% dadea pret NEGATIV, iar unul negativ umfla pretul — ambele ajungeau
// nefiltrate in PDF-ul dat clientului. Atributele HTML (min/max) nu apara: nu
// exista <form>, deci validarea nativa nu ruleaza niciodata.
export const MAX_DISCOUNT_PCT = 100
export const MAX_ADAOS_PCT = 1000

const clamp = (n: number, min: number, max: number) =>
  Number.isFinite(n) ? Math.min(Math.max(n, min), max) : min

/** Adaosul, curatat identic pentru CALCUL si pentru AFISARE (sa nu difere). */
export const parseAdaos = (v: string | number): number =>
  clamp(typeof v === 'number' ? v : parseFloat(v), 0, MAX_ADAOS_PCT)

export function calcItem(item: Item, adaos: number, step: RoundStep, mode: RoundMode, vatPayer = true) {
  const sp = clamp(parseFloat(item.supplierPrice), 0, Number.MAX_SAFE_INTEGER)
  const sgr = clamp(parseFloat(item.sgr), 0, Number.MAX_SAFE_INTEGER)
  const disc = clamp(parseFloat(item.discount), 0, MAX_DISCOUNT_PCT)
  adaos = parseAdaos(adaos)
  const netPrice = sp * (1 - disc / 100)

  if (!vatPayer) {
    // TVA platit furnizorului e cost irecuperabil; adaosul se aplica pe pretul de intrare cu TVA
    const inVatAmt = netPrice * (item.vat / 100)
    const costWithVat = netPrice + inVatAmt
    const adaosAmt = costWithVat * (adaos / 100)
    const final = applyRounding(costWithVat + adaosAmt, step, mode)
    return { sp, disc, sgr, netPrice, inVatAmt, costWithVat, adaosAmt, final, vatPayer: false as const }
  }

  const sellExVat = netPrice * (1 + adaos / 100)
  const vatAmt = sellExVat * (item.vat / 100)
  const withVat = sellExVat + vatAmt
  const final = applyRounding(withVat, step, mode)
  return { sp, disc, sgr, netPrice, sellExVat, vatAmt, withVat, final, vatPayer: true as const }
}

export const fmt2 = (n: number) => n.toFixed(2)
