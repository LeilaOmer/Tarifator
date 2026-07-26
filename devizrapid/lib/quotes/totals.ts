// Calculul totalurilor unei fise — SINGURA sursa de adevar.
//
// DE CE exista acest fisier: formula (subtotal -> discount -> TVA -> total) era
// copiata IDENTIC de cinci ori in app/quotes/[id]/page.tsx (buildPDF, handleSave,
// handleDeleteItem, handleSaveDiscount si corpul de randare) si incepuse deja sa
// divergheze — caile de scriere foloseau `emitent.vat_rate`, iar randarea si
// PDF-ul `quote.vat_rate`. Orice schimbare de regula fiscala trebuia aplicata in
// cinci locuri; ratarea unuia producea documente inconsistente.
//
// Respecta si regula din AGENTS.md: logica de business traieste in `lib/`,
// niciodata in componenta de UI.

export type DiscountType = 'pct' | 'val'

export type QuoteLine = { quantity: number; unit_price: number; total?: number }

export type QuoteTotals = {
  subtotalBrut: number
  discountVal: number
  subtotalNet: number
  vatAmount: number
  total: number
  /** Discountul efectiv aplicat, dupa plafonare — de afisat, nu cel introdus. */
  discount: number
}

const money = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100

/**
 * Discountul, plafonat. Fara asta, un discount de 150% (sau o valoare peste
 * subtotal) producea subtotal NEGATIV, TVA NEGATIV si TOTAL NEGATIV pe PDF-ul
 * trimis beneficiarului. Atributele HTML `min`/`max` nu apara: inputurile nu
 * sunt intr-un <form>, deci validarea nativa nu ruleaza niciodata.
 */
export function clampDiscount(raw: number | string, type: DiscountType, subtotalBrut: number): number {
  const n = typeof raw === 'number' ? raw : parseFloat(raw)
  if (!Number.isFinite(n) || n <= 0) return 0
  return type === 'pct' ? Math.min(n, 100) : Math.min(n, Math.max(subtotalBrut, 0))
}

/**
 * Totalurile unei fise. `vatRate` se aplica DOAR daca fisa are firma asociata
 * (regula existenta: `isPro = !!company`) — apelantul trimite 0 altfel.
 */
export function computeQuoteTotals(
  items: QuoteLine[],
  rawDiscount: number | string,
  discountType: DiscountType,
  vatRate: number,
): QuoteTotals {
  const subtotalBrut = money(
    (items ?? []).reduce((s, i) => s + (i.total ?? (i.quantity || 0) * (i.unit_price || 0)), 0),
  )
  const discount = clampDiscount(rawDiscount, discountType, subtotalBrut)
  const discountVal = money(discountType === 'pct' ? (subtotalBrut * discount) / 100 : discount)
  const subtotalNet = money(Math.max(subtotalBrut - discountVal, 0))
  const rate = Number.isFinite(vatRate) && vatRate > 0 ? vatRate : 0
  const vatAmount = money((subtotalNet * rate) / 100)
  return { subtotalBrut, discountVal, subtotalNet, vatAmount, total: money(subtotalNet + vatAmount), discount }
}
