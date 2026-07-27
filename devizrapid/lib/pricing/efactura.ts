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

// Nr. de bucati per ambalaj din denumire ("... x 6 ...", "500ML x 4", "0.33L X 12",
// plus formatul Ursus "1X24" = un bax de 24). Pretul unitar din e-Factura e pe
// BAX/ambalaj; il impartim la N ca sa dam pretul pe bucata (cum lucreaza
// comerciantul si cum arata restul aplicatiei). Daca nu e scris niciun "x N",
// ramane 1 (produs vandut la bucata).
//
// CAPCANA (bug real, corectat): pe NON-bauturi denumirea contine DIMENSIUNI cu
// exact acelasi tipar — "TABLA ZINCATA 1000 x 2000", "FOLIE 100 x 150 CM",
// "PLACA OSB 1250 x 2500 x 12". Un "x N" generic imparte pretul la dimensiune:
// tabla de 250 lei devenea 0,125 lei/bucata. De aceea respingem intai tiparele
// dimensionale, apoi acceptam doar configuratii de ambalaj plauzibile.
export function piecesPerBox(name: string): number {
  const n = name.toLowerCase()

  // DIMENSIUNI, nu ambalaj — trei semnale, oricare e suficient:
  //   1. trei numere legate cu x ("1250 x 2500 x 12" = lungime x latime x grosime)
  if (/\d\s*[x×]\s*\d+\s*[x×]\s*\d/.test(n)) return 1
  //   2. o unitate de LUNGIME/SUPRAFATA dupa pereche ("50 x 30 MM", "100 x 150 CM")
  if (/\d\s*[x×]\s*\d+\s*(mm|cm|m|metri|mp|cm2)\b/.test(n)) return 1
  //   3. un numar "gol" de 3+ cifre chiar inainte de x ("1000 x", "120 x").
  //      Baxurile se scriu cu volumul lipit ("0.33L X 12", "500ML x 4"), nu asa.
  if (/(^|[^.,\d])\d{3,}\s*[x×]/.test(n)) return 1

  // AMBALAJUL SCRIS CU "BUC"/"B" — forma folosita de furnizorii de dulciuri,
  // snacks si tigari: "24BUC/CUT", "30B/CUT", "35 GR 24 BUC", "/17 B".
  //
  // BUG REAL (gasit pe o factura a utilizatorului): functia stia doar "x N", deci
  // TOATE cele 12 produse la cutie ieseau cu raportul 1 — pretul CUTIEI ajungea
  // vandut ca pret de BUCATA. Un macaron de ~2,60 lei se afisa la 64 lei.
  // Regula era deja scrisa in BUSINESS_RULES cap. 7 ("24BUC/CUT" => 24) si in
  // promptul din parse-invoice; doar codul nu o implementa.
  //
  // `(?![a-z])` e ce tine gramajul afara: fara el, "35GR BANOFFEE" ar da 35 si
  // "COLA 2 BAX" ar da 2. Marcatorul trebuie urmat de spatiu, "/" sau capat de
  // sir — nu de alta litera.
  const bucMatch = n.match(/(\d{1,3})\s*(?:buc|bc|b)(?![a-z])/)
  if (bucMatch) {
    const p = parseInt(bucMatch[1], 10)
    if (p > 1 && p <= 240) return p
  }

  // Denumire TAIATA de OCR, cu raportul prins in paranteza deschisa la final:
  // "...CACAO SI CARAMEL GLZ (18" => 18. Ancorat la capatul sirului, ca sa nu
  // inghita o paranteza din mijlocul denumirii.
  const truncat = n.match(/\((\d{1,3})$/)
  if (truncat) {
    const p = parseInt(truncat[1], 10)
    if (p > 1 && p <= 240) return p
  }

  // "1X24" / "1x6" — configuratia de bax scrisa compact (un bax de N bucati)
  const compact = n.match(/\b1\s*[x×]\s*(\d{1,3})\b/)
  const m = compact || n.match(/\bx\s*(\d{1,3})\b/)
  const pieces = m ? parseInt(m[1], 10) : 1
  // 240 = plafon generos pentru un bax real; peste, e alt numar din denumire.
  return pieces > 1 && pieces <= 240 ? pieces : 1
}

// Construieste produsul final dintr-o linie de e-Factura (comun XML + PDF ANAF):
// mapare cota TVA -> 11/21, UM, SGR din denumire, impartirea pretului de bax pe bucata.
function buildItem(name: string, priceExVat: number, percent: number, umCode = ''): EfacturaItem {
  // Cota TVA declarata pe linie (o luam ca atare din factura, nu o re-deducem).
  const vat: 11 | 21 = percent > 0 && percent <= 15 ? 11 : 21

  // SGR (0,50 lei/ambalaj): semnalul din denumire (SGR/NAVETA), altfel categoria
  // legala (apa/bauturi 0.1-3L da; lactate/sirop/peste 3L nu) — vezi scanGuards.
  const sgr = classifySgr(name)

  // Marfa la kg/litru NU se imparte pe bucata (pretul e deja pe kg/litru);
  // impartirea pe bucata are sens doar la bax-uri de bucati.
  const unit = mapUnit(umCode)
  const pieces = unit === 'buc' ? piecesPerBox(name) : 1
  // Gard absolut peste potrivirea din denumire: daca impartirea da un pret
  // ireal de mic, "N"-ul citit era o dimensiune scapata de filtrele de mai sus,
  // nu un ambalaj — pastram pretul intreg. Mai bine un pret de bax neimpartit
  // (vizibil, corectabil din "Corecteaza cutie/bucata") decat unul de 1000x
  // mai mic, care trece neobservat pana la raft.
  const divided = priceExVat / pieces
  const supplier_price = Math.round((divided >= 0.05 ? divided : priceExVat) * 10000) / 10000
  return { name, unit, supplier_price, discount: 0, vat, sgr }
}

// Codul de UM (UN/ECE Rec 20/21) din e-Factura -> unitatea din aplicatie.
// Coduri de MASURA: KGM=kilogram, GRM=gram, LTR=litru, MLT=mililitru, MTR=metru,
// H87=bucata, C62=unitate, EA=each(bucata), NIU=numar de unitati.
// Coduri de AMBALAJ (prefix X + Rec 21): XCS=bax(case), XBX=cutie(box), XPK=pachet,
// XDU=?, XKG=butoi(keg), XBO=sticla — toate se trateaza ca "bucata" aici, iar
// impartirea pe bucata o decide configuratia din DENUMIRE ("1X24", "x 6").
function mapUnit(code: string): string {
  const c = (code || '').trim().toUpperCase()
  if (c === 'KGM' || c === 'KG') return 'kg'
  if (c === 'LTR' || c === 'LT' || c === 'L') return 'l'
  if (c === 'GRM') return 'g'
  if (c === 'MLT') return 'ml'
  if (c === 'MTR') return 'm'
  return 'buc' // H87 / C62 / EA / NIU / X** (ambalaje) — la bucata
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

    const umCode = line.match(/<(?:\w+:)?InvoicedQuantity[^>]*\bunitCode="([^"]+)"/i)?.[1] || ''
    items.push(buildItem(name, priceExVat, num(tag(line, 'Percent')), umCode))
  }

  if (items.length === 0) return null
  return { supplier, items }
}

// ————— PDF-ul oficial ANAF ("RO eFactura") —————
// Layout national FIX, generat de ANAF din XML. Textul extras (pdf-parse) are
// fiecare linie de produs in tiparul (ordinea coloanelor din PDF, nu logica):
//   <cotaTVA> <NUME PRODUS> <nrLinie> <MONEDA> <cantitate> <valoare neta> <UM> <pret unitar>
// ex: "21.00  COCA COLA 2.5L x 6 PET SGR  1  RON  10.0000  621.20  XDU  62.12000000"
//     "11     CIRESE               1  RON  4.500   121.62  KGM  27.0267"
// UM-ul (litere) e ancora din mijloc; pretul unitar e numarul de DUPA UM (nu
// confunda cu cantitatea, care e inainte de UM — capcana la marfa la kg, unde
// cantitatea "4.500" pare pret dar e cantar). Cota TVA poate fi intreaga ("11")
// sau cu zecimale ("21.00").

export function isEfacturaAnafPdfText(text: string): boolean {
  return /RO\s*eFactura/i.test(text) || /Pretul\s*net\s*al\s*articolului/i.test(text)
}

export function parseEfacturaAnafPdf(text: string): EfacturaResult | null {
  if (!isEfacturaAnafPdfText(text)) return null

  // Furnizorul: pe PDF-ul ANAF sectiunea VANZATOR incepe cu numele firmei.
  const supMatch = text.match(/VANZATOR\s+([\s\S]+?)\s*(?:Nume|Nr\.)/i)
  const supplier = supMatch ? supMatch[1].replace(/\s+/g, ' ').trim() : ''

  // "Cantitate de baza" e OPTIONALA in PDF-ul ANAF: unii emitenti o lasa goala
  // (MW, PRODCOM — 2 numere intre moneda si UM), altii o completeaza (Ursus,
  // GNF — 3 numere). Grupul optional o absoarbe cand exista.
  const rowRe = /(\d{1,2}(?:[.,]\d{1,2})?)\s+([^\n]+?)\s+(\d{1,3})\s+([A-Z]{3})\s+(?:([\d.,]+)\s+)?([\d.,]+)\s+([\d.,]+)\s+([A-Za-z][A-Za-z0-9]{1,5})\s+(\d+[.,]\d{2,})/g
  const items: EfacturaItem[] = []
  let m: RegExpExecArray | null
  while ((m = rowRe.exec(text))) {
    const [, vatStr, rawName, , , , qtyStr, totalStr, umStr, priceStr] = m
    const name = rawName.replace(/\s+/g, ' ').trim()
    if (!name || isNonProductLine(name)) continue
    // Pretul unitar = numarul de DUPA UM. Verificare cantitate x pret ≈ valoare:
    // daca nu se reconciliaza deloc (pret 0), e fals-pozitiv al regexului, il sarim.
    const priceExVat = reconcileUnitPrice(num(priceStr), num(qtyStr), num(totalStr))
    if (!(priceExVat > 0)) continue
    items.push(buildItem(name, priceExVat, num(vatStr), umStr))
  }

  if (items.length === 0) return null
  return { supplier, items }
}
