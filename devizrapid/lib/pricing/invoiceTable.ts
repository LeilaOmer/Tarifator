// Citirea DETERMINISTA a unui tabel de factura din text (OCR sau PDF).
//
// DE CE EXISTA: pe text de OCR, extragerea prin model dadea rezultate ALEATOARE
// — aceeasi factura, aceeasi poza, o data 25 de produse, alta data 31, alta data
// 35. OCR-ul e determinist (aceeasi imagine => acelasi text), deci variatia
// venea din model: pus sa transcrie 41 de randuri de tabel, sare randuri
// diferite la fiecare rulare. Nicio ajustare de prompt nu repara asta — un model
// nu e un parser.
//
// Tabelele de factura romanesti au insa o ANCORA foarte stabila: cota de TVA
// urmata de unitatea de masura ("21% Buc", "11% Cut"). Dupa ea vin numerele, iar
// acestea se VERIFICA intre ele:
//     valoare x cota_TVA ≈ TVA_lei        (coloanele 2 si 3 de dupa cantitate)
//     valoare / cantitate = pretul unitar
// Aceasta verificare incrucisata e ce face parserul robust: pe randul unde OCR-ul
// a pierdut virgula din valoare ("80.84" => "8084"), coloana de TVA o repara.
//
// Acelasi principiu ca la `parseEfacturaAnafPdf`: cand sursa are structura,
// se citeste in cod, nu se ghiceste cu un model.

export type TableRow = {
  name: string
  unit: string
  vat: 11 | 21
  quantity: number
  lineTotal: number
  /** Pretul unitar derivat din valoare/cantitate — sursa de adevar aici. */
  price: number
}

// Unitatile care apar in coloana UM pe facturile romanesti. `cut`/`bax`/`set`
// conteaza mai departe pentru impartirea pe bucata (BUSINESS_RULES cap. 7).
const UM = 'buc|bucata|bc|cut|cutie|cutii|bax|bx|set|seturi|kg|kgm|gr|g|l|lt|litru|ml|mp|m|to|st'

// Ancora: "21% Buc", "11 % Cut", "21%Buc". Cota de TVA lipita de unitate e un
// tipar mult mai stabil decat pozitia coloanelor, care se decaleaza la OCR.
const ANCHOR = new RegExp(`\\b(\\d{1,2})\\s*%\\s*(${UM})\\b`, 'i')

// Numere romanesti: "1.234,56", "1,234.56", "40.42", "8084", "77815".
const NUM = /-?\d[\d.,]*/g

/** "1.234,56" / "40.42" / "8084" -> number. Alege separatorul zecimal dupa pozitie. */
function toNum(raw: string): number {
  let s = raw.trim()
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.')       // 1.234,56
  else if (lastDot > lastComma) s = s.replace(/,/g, '')                      // 1,234.56
  else s = s.replace(/[.,]/g, '')                                            // fara zecimale
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : NaN
}

/**
 * Curata inceputul denumirii de numarul de rand citit de OCR.
 * Exemple reale: "a NAPJOE...", "(2/  NAPJOE...", "AA NAP SPIRALE...",
 * "- (33   BATON...", "12.) ALBENI...". Numarul de rand nu e informatie utila,
 * dar lipit de denumire strica potrivirea cu raporturile cutie/bucata salvate.
 */
function cleanName(raw: string): string {
  // Simboluri si cifre la inceput. Ghilimelele TIPOGRAFICE (“ ” „ « » ‘ ’),
  // bulinele si punctul median sunt aici pentru un motiv care nu e cosmetic:
  // OCR-ul le pune des in fata randului, iar cheia regulii "frate" din
  // parse-invoice e "pret + primele 3 cuvinte". Un singur caracter ramas lipit
  // de denumire da alta cheie decat geamanul curat al aceluiasi produs, deci
  // raportul bucati/cutie nu se mai imprumuta. Pe o factura reala,
  // "“NAP MILKA CACAO 30G 308/CUT" a ramas neimpartit la 61,60 lei (97 lei/buc)
  // desi randul curat al aceluiasi produs era pe aceeasi factura, citit corect.
  let s = raw.replace(/^[\s\d().,\/>|\[\]{}"'`*%&~_—–\-“”„‟«»‘’‚‹›•·…]+/, '')
  // Token scurt ramas la inceput = numar de rand ("a ", "AA ", "IZ/ ", "a2) ").
  // Cerem <=2 litere SAU prezenta unei cifre, ca sa nu mancam inceputul unei
  // denumiri reale de 3 litere ("NAP SPIRALE", "MRS TWIX").
  s = s.replace(/^(?:[a-zA-Z]{1,2}|[a-zA-Z]?\d{1,3}[a-zA-Z]?)[\s.),\/>|\]-]+(?=[A-Za-z])/, '')
  return s.replace(/\s+/g, ' ').trim()
}

const close = (a: number, b: number, tol = 0.04) =>
  b > 0 && Math.abs(a - b) <= Math.max(b * tol, 0.02)

/**
 * Din numerele de dupa ancora, alege perechea (valoare, TVA_lei) care satisface
 * `valoare x cota ≈ TVA_lei`, incercand si corectii de scara pentru virgula
 * pierduta de OCR ("8084" in loc de "80.84").
 * Intoarce valoarea CORECTATA, sau NaN daca nicio combinatie nu se verifica.
 */
function findLineTotal(nums: number[], vatPct: number): number {
  const rate = vatPct / 100
  // Perechile candidate, de la coada spre inceput: pe factura, valoarea si TVA-ul
  // sunt ultimele doua coloane.
  for (let i = nums.length - 2; i >= 1; i--) {
    const tva = nums[i + 1]
    if (!Number.isFinite(tva) || tva <= 0) continue
    for (const scale of [1, 0.1, 0.01, 0.001]) {
      const val = nums[i] * scale
      if (val > 0 && close(val * rate, tva)) return Math.round(val * 100) / 100
    }
  }
  return NaN
}

/**
 * Parseaza randurile de produs dintr-un text de factura.
 * Intoarce `null` daca nu gaseste suficiente randuri verificabile — apelantul
 * cade atunci pe calea cu model, care e mai tolerantă la layout-uri necunoscute.
 */
export function parseInvoiceTableText(text: string, minRows = 3): TableRow[] | null {
  const rows: TableRow[] = []

  for (const line of text.split('\n')) {
    const m = line.match(ANCHOR)
    if (!m || m.index === undefined) continue

    const vatPct = parseInt(m[1], 10)
    if (vatPct !== 11 && vatPct !== 21 && vatPct !== 9 && vatPct !== 19) continue
    const vat: 11 | 21 = vatPct <= 15 ? 11 : 21   // 9=>11, 19=>21 pe facturi vechi

    const name = cleanName(line.slice(0, m.index))
    if (name.replace(/[^A-Za-z]/g, '').length < 3) continue

    const after = line.slice(m.index + m[0].length)
    const nums = (after.match(NUM) || []).map(toNum).filter(n => Number.isFinite(n) && n > 0)
    if (nums.length < 3) continue   // cantitate + valoare + TVA, minimul verificabil

    const quantity = nums[0]
    if (!(quantity > 0) || quantity > 1_000_000) continue

    const lineTotal = findLineTotal(nums, vatPct)
    if (!Number.isFinite(lineTotal) || lineTotal <= 0) continue

    const price = Math.round((lineTotal / quantity) * 10000) / 10000
    if (!(price > 0)) continue

    rows.push({ name, unit: m[2].toLowerCase(), vat, quantity, lineTotal, price })
  }

  return rows.length >= minRows ? rows : null
}
