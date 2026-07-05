// Parsare deterministica a e-Facturii (UBL XML + PDF-ul oficial ANAF).
//
// DE CE: e-Factura e date STRUCTURATE — fiecare produs are nume, pret unitar
// fara TVA, cota TVA si cantitate in campuri fixe. Nu are rost (si e chiar
// gresit) sa le trecem printr-un model AI care ghiceste: aici citim exact, in
// cod, 100% corect, gratuit si instant. Respecta regula din AGENTS.md dusa la
// capat — nu doar aritmetica, ci si CITIREA e determinista cand sursa o permite.
//
// Doua formate acoperite:
//   1. XML-ul UBL (RO_CIUS) descarcat din SPV — parseEfacturaXml.
//   2. PDF-ul generat de ANAF din acel XML ("RO eFactura", layout national
//      fix, text curat) — parseEfacturaAnafPdf (primeste textul extras din PDF).
// PDF-urile clasice ale furnizorilor (layout propriu fiecaruia) NU se parseaza
// aici — raman pe calea AI, cu gardurile din lib/pricing/scanGuards.ts.
//
// Fara dependinte / fara DOMParser: UBL generat de sisteme de facturare e foarte
// regulat, deci extragem cu regex tintit pe blocuri <InvoiceLine>. Ruleaza la fel
// in browser (calea principala, din hook) si pe server (siguranta, in ruta API).

import { isNonProductLine, reconcileUnitPrice, classifySgr } from './scanGuards'

export type EfacturaItem = {
  name: string
  unit: string
  supplier_price: number
  discount: number
  vat: 11 | 21
  sgr: number
}
export type EfacturaResult = { supplier: string; items: EfacturaItem[] }

// Prima aparitie a unui tag (indiferent de prefixul de namespace: cbc:/cac:/fara).
function tag(xml: string, local: string): string | null {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${local}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${local}>`, 'i'))
  return m ? decode(m[1].trim()) : null
}

// Toate blocurile <local>...</local> (ex: fiecare InvoiceLine).
function blocks(xml: string, local: string): string[] {
  const re = new RegExp(`<(?:\\w+:)?${local}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${local}>`, 'gi')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) out.push(m[1])
  return out
}

function decode(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim()
}

const num = (s: string | null): number => {
  const n = parseFloat((s ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

// Recunoaste un document e-Factura UBL (Invoice cu linii de produs).
export function isEfacturaXml(text: string): boolean {
  return /<(?:\w+:)?Invoice[\s>]/i.test(text) && /<(?:\w+:)?InvoiceLine\b/i.test(text)
}

// Nr. de bucati per ambalaj din denumire ("... x 6 ...", "500ML x 4", "0.33L X 12").
// Pretul unitar din e-Factura e pe BAX/ambalaj; il impartim la N ca sa dam pretul
// pe bucata (cum lucreaza comerciantul si cum arata restul aplicatiei). Daca nu e
// scris niciun "x N", ramane 1 (produs vandut la bucata).
function piecesPerBox(name: string): number {
  const m = name.match(/\bx\s*(\d{1,4})\b/i)
  const n = m ? parseInt(m[1], 10) : 1
  return n > 1 ? n : 1
}

// Construieste produsul final dintr-o linie de e-Factura (comun XML + PDF ANAF):
// mapare cota TVA -> 11/21, SGR din denumire, impartirea pretului de bax pe bucata.
function buildItem(name: string, priceExVat: number, percent: number): EfacturaItem {
  // Cota TVA declarata pe linie (o luam ca atare din factura, nu o re-deducem).
  const vat: 11 | 21 = percent > 0 && percent <= 15 ? 11 : 21

  // SGR (0,50 lei/ambalaj): semnalul din denumire (SGR/NAVETA), altfel categoria
  // legala (apa/bauturi 0.1-3L da; lactate/sirop/peste 3L nu) — vezi scanGuards.
  const sgr = classifySgr(name)

  const pieces = piecesPerBox(name)
  const supplier_price = Math.round((priceExVat / pieces) * 10000) / 10000
  return { name, unit: 'buc', supplier_price, discount: 0, vat, sgr }
}

export function parseEfacturaXml(xml: string): EfacturaResult | null {
  if (!isEfacturaXml(xml)) return null

  // Furnizor = firma emitenta (AccountingSupplierParty). RegistrationName e numele
  // legal; cadem pe PartyName daca lipseste.
  const supplierBlock = blocks(xml, 'AccountingSupplierParty')[0] || ''
  const supplier =
    tag(supplierBlock, 'RegistrationName') ||
    (blocks(supplierBlock, 'PartyName')[0] ? tag(blocks(supplierBlock, 'PartyName')[0], 'Name') : null) ||
    ''

  const items: EfacturaItem[] = []
  for (const line of blocks(xml, 'InvoiceLine')) {
    const name = tag(line, 'Name') || ''
    if (!name) continue
    if (isNonProductLine(name)) continue // AMBALAJ SGR / GARANTIE — nu e produs

    // Pret unitar fara TVA din <cac:Price><cbc:PriceAmount>. In UBL, Price e mereu
    // net. Daca pretul e exprimat per N unitati (<cbc:BaseQuantity>), il aducem
    // la pretul pe 1 unitate.
    const priceBlock = blocks(line, 'Price')[0] || line
    let priceExVat = num(tag(priceBlock, 'PriceAmount'))
    const baseQty = num(tag(priceBlock, 'BaseQuantity'))
    if (baseQty > 1) priceExVat = priceExVat / baseQty

    // Verificare: cantitate x pret ≈ valoarea randului; reconcilierea recupereaza
    // pretul din LineExtensionAmount / cantitate daca PriceAmount lipseste sau nu
    // se potriveste.
    priceExVat = reconcileUnitPrice(priceExVat, num(tag(line, 'InvoicedQuantity')), num(tag(line, 'LineExtensionAmount')))
    if (!(priceExVat > 0)) continue // linii negative (storno) sau fara pret — nu le putem folosi

    items.push(buildItem(name, priceExVat, num(tag(line, 'Percent'))))
  }

  if (items.length === 0) return null
  return { supplier, items }
}

// ————— PDF-ul oficial ANAF ("RO eFactura") —————
// Layout national FIX, generat de ANAF din XML. Textul extras (pdf-parse) are
// fiecare linie de produs in tiparul:
//   <cotaTVA> <NUME PRODUS> <nrLinie> <MONEDA> <cantitate> <valoare neta> <UM> <pret unitar>
// ex: "21.00  COCA COLA 2.5L x 6 PET SGR  1  RON  10.0000  621.20  XDU  62.12000000"
// Pretul unitar are minim 4 zecimale (formatul ANAF are 8) — asta il distinge de
// celelalte numere si ancoreaza sfarsitul randului.

export function isEfacturaAnafPdfText(text: string): boolean {
  return /RO\s*eFactura/i.test(text) || /Pretul\s*net\s*al\s*articolului/i.test(text)
}

export function parseEfacturaAnafPdf(text: string): EfacturaResult | null {
  if (!isEfacturaAnafPdfText(text)) return null

  // Furnizorul: pe PDF-ul ANAF sectiunea VANZATOR incepe cu numele firmei.
  const supMatch = text.match(/VANZATOR\s+([\s\S]+?)\s*(?:Nume|Nr\.)/i)
  const supplier = supMatch ? supMatch[1].replace(/\s+/g, ' ').trim() : ''

  const rowRe = /(\d{1,2}[.,]\d{2})\s+([^\n]+?)\s+(\d{1,3})\s+([A-Z]{3})\s+([\d.,]+)\s+([\d.,]+)\s+([A-Za-z0-9]{1,6})\s+(\d+[.,]\d{4,})/g
  const items: EfacturaItem[] = []
  let m: RegExpExecArray | null
  while ((m = rowRe.exec(text))) {
    const [, vatStr, rawName, , , qtyStr, totalStr, , priceStr] = m
    const name = rawName.replace(/\s+/g, ' ').trim()
    if (!name || isNonProductLine(name)) continue
    // Aceeasi verificare cantitate x pret ≈ valoare ca la XML — un rand care nu
    // se reconciliaza deloc (pret 0) e un fals-pozitiv al regexului, il sarim.
    const priceExVat = reconcileUnitPrice(num(priceStr), num(qtyStr), num(totalStr))
    if (!(priceExVat > 0)) continue
    items.push(buildItem(name, priceExVat, num(vatStr)))
  }

  if (items.length === 0) return null
  return { supplier, items }
}
