// Parsare deterministica a e-Facturii (UBL XML, standardul ANAF/RO_CIUS).
//
// DE CE: XML-ul de e-Factura e date STRUCTURATE — fiecare produs are nume, pret
// unitar fara TVA, cota TVA si cantitate in campuri fixe. Nu are rost (si e chiar
// gresit) sa-l trecem printr-un model AI care ghiceste: aici citim exact, in cod,
// 100% corect, gratuit si instant. Respecta regula din AGENTS.md dusa la capat —
// nu doar aritmetica, ci si CITIREA e determinista cand sursa o permite.
//
// Fara dependinte / fara DOMParser: UBL generat de sisteme de facturare e foarte
// regulat, deci extragem cu regex tintit pe blocuri <InvoiceLine>. Ruleaza la fel
// in browser (calea principala, din hook) si pe server (siguranta, in ruta API).

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

// O linie NU e produs: ambalajul SGR cumulat / garantiile / navetele returnabile.
function isNonProductLine(name: string): boolean {
  return /\bambalaj\b|garantie|garanție|returnare/i.test(name)
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

    // Pret unitar fara TVA din <cac:Price><cbc:PriceAmount>. In UBL, Price e mereu net.
    const priceBlock = blocks(line, 'Price')[0] || line
    let priceExVat = num(tag(priceBlock, 'PriceAmount'))

    // Verificare: cantitate x pret ≈ valoarea randului. Daca PriceAmount lipseste
    // sau nu se potriveste, recuperam din LineExtensionAmount / cantitate.
    const qty = num(tag(line, 'InvoicedQuantity'))
    const lineTotal = num(tag(line, 'LineExtensionAmount'))
    if (qty > 0 && lineTotal > 0) {
      const derived = lineTotal / qty
      if (!(priceExVat > 0) || Math.abs(priceExVat - derived) > Math.max(derived * 0.02, 0.01)) {
        priceExVat = derived
      }
    }
    if (!(priceExVat > 0)) continue

    // Cota TVA declarata pe linie (o luam ca atare din factura, nu o re-deducem).
    const percent = num(tag(line, 'Percent'))
    const vat: 11 | 21 = percent > 0 && percent <= 15 ? 11 : 21

    // SGR (0,50 lei/ambalaj): denumirea contine "SGR". Exceptie: "NAV"/"NAVETA"
    // (returnat pe naveta, nu individual) => 0. (Regula din BUSINESS_RULES cap. 4.)
    const sgr = /\bsgr\b/i.test(name) && !/\bnav\b|naveta/i.test(name) ? 0.5 : 0

    const pieces = piecesPerBox(name)
    const supplier_price = Math.round((priceExVat / pieces) * 10000) / 10000

    items.push({ name, unit: 'buc', supplier_price, discount: 0, vat, sgr })
  }

  if (items.length === 0) return null
  return { supplier, items }
}
