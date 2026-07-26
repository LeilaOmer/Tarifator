// Garduri DETERMINISTE aplicate peste orice citire de factura (AI sau parsare
// directa). Logica pura, fara dependinte — testabila izolat si refolosita si de
// parserul e-Factura (lib/pricing/efactura.ts), si de ruta AI (parse-invoice).

// O linie care NU e produs: garantiile SGR / ambalajele returnabile / navetele.
// Modelul AI e instruit sa le excluda, dar uneori le scapa ca produse (vazut pe
// facturi Metro/Supeco: "GARANTIE PET" aparea in lista cu pret copiat de la
// produsul vecin). Filtrul din cod e plasa de siguranta care nu da gres.
export function isNonProductLine(name: string): boolean {
  const n = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

  // 1. Semnale NEECHIVOCE — nimeni nu vinde "garantie" ca produs.
  if (/garanti[ae]/.test(n)) return true          // "GARANTIE PET", "Garantie-Returnare"
  if (/^sgr\b/.test(n)) return true
  // un rand care INCEPE cu "keg" e butoiul GOL dat la schimb ("KEG 30L 1x1" =
  // garantia ambalajului), nu berea (aia are numele marcii inainte de "keg")
  if (/^keg\b/.test(n)) return true

  // 2. Semnale AMBIGUE. "ambalaj" si "palet" apar si pe linia de depozit
  //    (Ursus: "PALET STANDARD"), si in denumirea unei MARFI reale — exista
  //    comercianti care vand exact ambalaje, cutii si paleti, iar pentru ei
  //    regula veche stergea tot catalogul, tacut. Le tratam ca linie de depozit
  //    doar cand ARATA a asa ceva: scurte, generice, fara cifre. Cifrele
  //    (dimensiuni, gramaje) inseamna marfa: "PALETI LEMN 1200x800" e produs.
  if (/\bambalaj\w*\b|\bpalet\w*\b/.test(n)) {
    return !/\d/.test(n) && n.split(/\s+/).length <= 3
  }

  // 3. "returnare" SINGUR nu mai exclude nimic: prindea si liniile de retur de
  //    marfa ("RETURNARE MARFA"), care sunt tranzactii reale, nu garantii.
  //    Forma relevanta ("Garantie-Returnare") e deja prinsa la punctul 1.
  return false
}

// Randuri-FANTOMA la scanarea pozelor: modelul citeste zona de sub un produs
// (codul de bare + cantitatea repetata) ca un AL DOILEA produs, cu numele
// trunchiat si fara cantitate/valoare proprii — pretul fantomei fiind deseori
// chiar cantitatea randului real ("3.840" bucati devine pret 3,84). Vazut pe
// factura Metro/Supeco: "APA MIN NECARB 2L" (fantoma) langa "APA MIN NECARB 2L
// BORSEC" (real). Semnatura ceruta — AMBELE conditii, ca sa nu atingem produse
// reale:
//   1. randul NU are date de verificare (cantitate + valoare de rand), SI
//   2. exista alt rand VERIFICAT (cantitate x pret ≈ valoare) al carui nume
//      normalizat il contine ca PREFIX (acelasi rand fizic, nume trunchiat).
// Doua produse reale distincte au amandoua cantitate+valoare pe factura => nu
// se ating intre ele, oricat de asemanatoare le-ar fi numele.
export function phantomRowIndexes(rows: { name: string; verified: boolean }[]): Set<number> {
  const norm = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const keys = rows.map(r => norm(r.name))
  const out = new Set<number>()
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].verified || keys[i].length < 6) continue // numele prea scurte, prea generice
    for (let j = 0; j < rows.length; j++) {
      if (i === j || !rows[j].verified) continue
      if (keys[j].startsWith(keys[i])) { out.add(i); break }
    }
  }
  return out
}

// Deduplicare intre feliile suprapuse ale unei poze / randurile repetate de
// model. Cheia = numele redus la litere+cifre. Doua randuri sunt ACELASI produs
// daca cheile sunt identice sau la o litera distanta pe nume lungi
// ("INTREG/17 B" vs "INTREGI /17 B" — acelasi rand citit usor diferit din doua
// felii). Reguli:
//   - pret egal => se contopesc (duplicat sigur);
//   - pret diferit => castiga randul VERIFICAT (a trecut prin cantitate x pret
//     ≈ valoarea randului pe server); daca amandoua sau niciunul e verificat,
//     raman AMANDOUA — nu putem decide noi care citire e cea buna, iar doua
//     produse reale diferite au preturi diferite si raman corect separate.
export type DedupableItem = { name: string; supplier_price: number; verified?: boolean }

const nameKey = (name: string) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

// Acelasi nume, citit usor diferit? Doua semnale, doar pe chei lungi (numele
// scurte doar identice — "mere" vs "pere" sunt produse diferite):
//   1. distanta de editare <= 1 (o inserare/stergere/inlocuire);
//   2. prefix comun >= 90% din cheia mai scurta — trunchieri diferite ale
//      aceluiasi rand ("OREO /22 B" vs "OREO", "INTREG/17 B" vs "INTREGI").
//      Produsele din aceeasi familie raman sub prag ("CHOCO BISCUITS" vs
//      "CHOCO MINIS" au prefix comun ~78%, "BANCOFFEE" vs "CAPPUCINO" ~65%).
function nearlySameName(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length < 10 || b.length < 10) return false
  if (Math.abs(a.length - b.length) <= 1) {
    let i = 0, j = 0, edits = 0, over = false
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue }
      if (++edits > 1) { over = true; break }
      if (a.length > b.length) i++
      else if (b.length > a.length) j++
      else { i++; j++ }
    }
    if (!over && edits + (a.length - i) + (b.length - j) <= 1) return true
  }
  const min = Math.min(a.length, b.length)
  let p = 0
  while (p < min && a[p] === b[p]) p++
  return p >= min * 0.9
}

export function dedupeScannedItems<T extends DedupableItem>(items: T[]): T[] {
  const out: T[] = []
  const keys: string[] = []
  const origIdx: number[] = [] // pozitia originala a fiecarui rand pastrat

  // FORFECARE de randuri (vazuta pe factura reala, confirmata pe original):
  // in zona de suprapunere a feliilor, modelul re-citeste un rand cu numele
  // unui produs si DATELE COMPLETE ale randului vecin (pret+cantitate+valoare
  // copiate impreuna => trece verificarea aritmetica). Semnatura: gemenul
  // fals are pretul unui VECIN al gemenului adevarat. Protectii: doar pe
  // gemeni departati (>1 pozitie — doua loturi reale ale aceluiasi produs
  // stau pe randuri alaturate pe factura) si doar cand semnatura e intr-un
  // singur sens (daca si inversul e adevarat, nu decidem).
  const priceAt = (i: number) => i >= 0 && i < items.length
    ? Math.round((items[i].supplier_price || 0) * 100) : -1
  const nearPrices = (i: number) => [priceAt(i - 1), priceAt(i + 1)]

  for (let pos = 0; pos < items.length; pos++) {
    const item = items[pos]
    const k = nameKey(item.name || '')
    const price = Math.round((item.supplier_price || 0) * 100)
    const idx = keys.findIndex(ok => nearlySameName(ok, k))
    if (idx === -1) { out.push(item); keys.push(k); origIdx.push(pos); continue }
    const existing = out[idx]
    const exPrice = Math.round((existing.supplier_price || 0) * 100)
    if (exPrice === price) {
      // duplicat sigur — pastram citirea cu numele mai LUNG (mai completa,
      // "OREO /22 B" bate "OREO")
      if ((item.name || '').length > (existing.name || '').length) { out[idx] = item; keys[idx] = k; origIdx[idx] = pos }
      continue
    }
    if (item.verified && !existing.verified) { out[idx] = item; keys[idx] = k; origIdx[idx] = pos; continue }
    if (!item.verified && existing.verified) continue
    if (Math.abs(pos - origIdx[idx]) > 1) {
      const itemIsShear = nearPrices(origIdx[idx]).includes(price)
      const existingIsShear = nearPrices(pos).includes(exPrice)
      if (itemIsShear && !existingIsShear) continue // gemenul nou = forfecare
      if (existingIsShear && !itemIsShear) { out[idx] = item; keys[idx] = k; origIdx[idx] = pos; continue }
    }
    out.push(item); keys.push(k); origIdx.push(pos) // ambiguu: pastram amandoua
  }
  return out
}

// Clasificare SGR pe categorii LEGALE (HG 1074/2021), determinist din denumire.
// SGR (0,50 lei) se aplica BAUTURILOR in ambalaje nereturnabile de plastic/
// sticla/metal intre 0,1 si 3 litri: apa, sucuri/nectaruri/racoritoare, bere,
// cidru, vin, spirtoase, energizante. EXCLUSE prin lege: laptele si lactatele
// (iaurt/kefir/sana), siropurile; plus tot ce nu e bautura (ulei/otet) si
// ambalajele de peste 3L (bidonul de 5L) sau sub 0,1L.
// E plasa de siguranta finala: semnalele de pe DOCUMENT (SGR/NAVETA in denumire,
// linia de garantie asociata) au prioritate — asta intra in joc doar cand ele tac.
export function classifySgr(name: string): 0.5 | 0 {
  const n = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (/\bnav\b|naveta/.test(n)) return 0
  if (/\bsgr\b/.test(n)) return 0.5

  // volumul din denumire ("2.5L", "0,33L", "500ML", "1.5 L")
  const vm = n.match(/(\d+(?:[.,]\d+)?)\s*(ml|l)\b/)
  let vol: number | null = null
  if (vm) {
    vol = parseFloat(vm[1].replace(',', '.'))
    if (vm[2] === 'ml') vol = vol / 1000
  } else {
    // fara unitate scrisa, dar numarul sta LIPIT de tokenul de ambalaj
    // ("330 NRB", "500 PET") => e volumul in ml (asa scriu berariile)
    const vp = n.match(/\b(\d{2,4})\s+(?:nrb|nrgb|pet|doza|sticla)\b/)
    if (vp) vol = parseInt(vp[1], 10) / 1000
  }
  if (vol !== null && (vol < 0.1 || vol > 3)) return 0

  // excluse prin lege, chiar in PET/sticla/doza
  if (/lapte|iaurt|kefir|chefir|sana\b|lactat|sirop|ulei|otet/.test(n)) return 0

  // bautura dupa cuvinte generice de categorie...
  const beverage = /\bapa\b|apa min|suc\b|nectar|racoritoare|bere\b|cidru|vin\b|spumant|whisky|vodca|\bgin\b|\brom\b|tuica|palinca|cola|pepsi|fanta|sprite|tonic|limonada|ice\s*tea|energy|energizant|kombucha/.test(n)
  // ...sau dupa ambalaj tipic de bautura mentionat explicit in denumire
  // (NRB/NRGB = sticla nereturnabila — Ursus scrie NRB, MW scrie NRGB)
  const packaging = /\bpet\b|\bdoza\b|\bnrgb\b|\bnrb\b|\bsticla\b/.test(n)

  if ((beverage || packaging) && vol !== null) return 0.5
  if (beverage && packaging) return 0.5 // fara volum in denumire, dar ambele semnale
  return 0
}

// O linie de garantie SGR de pe factura MARCHEAZA produsul asociat, nu doar se
// arunca: pe facturile Metro/Supeco fiecare produs de bautura e urmat de propria
// linie "GARANTIE PET" cu ACEEASI cantitate. Modelul e instruit sa faca
// asocierea, dar cand o rateaza (scoate garantia ca produs separat), o refacem
// aici determinist: linia de garantie pune sgr=0.5 pe produsul imediat precedent
// daca are aceeasi cantitate (sau nu are cantitate deloc — cazul bonurilor).
// Liniile CUMULATE de la finalul facturii (cantitate = suma tuturor produselor)
// NU se potrivesc cu produsul precedent => nu marcheaza gresit; acolo produsele
// au oricum "SGR" in denumire.
export type ScannedLine = { name?: unknown; quantity?: unknown; sgr?: unknown }
export function applySgrFromGuaranteeLines(items: ScannedLine[]): void {
  const qty = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0 }
  const close = (a: number, b: number) => Math.abs(a - b) <= b * 0.02
  for (let i = 0; i < items.length; i++) {
    const line = items[i]
    if (typeof line?.name !== 'string' || !isNonProductLine(line.name)) continue
    const g = qty(line.quantity)
    for (let j = i - 1; j >= 0; j--) {
      const prev = items[j]
      if (typeof prev?.name !== 'string' || isNonProductLine(prev.name)) continue
      const p = qty(prev.quantity)
      // aceeasi cantitate — tolerand si factorul 1000 al separatorului de mii
      // ("4.560" citit ca 4,56 pe un rand si ca 4560 pe celalalt)
      if (g === 0 || (p > 0 && (close(g, p) || close(g / 1000, p) || close(g * 1000, p)))) {
        prev.sgr = 0.5
      }
      break // doar produsul imediat precedent; mai departe e alta marfa
    }
  }
}

// Alege pretul unitar CORECT dintre cel declarat (citit de model / din camp) si
// cel derivat din valoarea randului (lineTotal / quantity). Regula de aur:
// cantitate x pret ≈ valoarea randului — singura verificare pe care o factura
// reala o satisface mereu.
//
// Cazuri acoperite (toate vazute pe facturi reale):
// - declarat ≈ derivat => declaratul e bun (citire corecta).
// - declarat * (1 - disc%) ≈ derivat => valoarea randului e deja NET de discount;
//   pastram declaratul + discountul separat (netul iese egal cu derivatul).
// - declarat ≈ derivat / 1000 (sau x 1000) => cantitatea/valoarea a fost citita
//   gresit din cauza separatorului romanesc de mii ("4.560" = 4560 bucati, nu
//   4,56) — pretul declarat e cel corect, factorul de 1000 vine din misparse.
// - altfel => derivatul castiga (declaratul a fost rupt gresit din cifre lipite).
export function reconcileUnitPrice(
  declared: number, quantity: number, lineTotal: number, discountPct = 0,
): number {
  if (!(lineTotal > 0) || !(quantity > 0)) return declared > 0 ? declared : 0
  const derived = lineTotal / quantity
  const ok = (a: number, b: number) => Math.abs(a - b) <= Math.max(b * 0.03, 0.01)
  if (declared > 0) {
    if (ok(declared, derived)) return declared
    if (discountPct > 0 && ok(declared * (1 - discountPct / 100), derived)) return declared
    if (ok(declared, derived / 1000) || ok(declared, derived * 1000)) return declared
  }
  return derived
}
