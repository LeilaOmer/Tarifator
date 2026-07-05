// Garduri DETERMINISTE aplicate peste orice citire de factura (AI sau parsare
// directa). Logica pura, fara dependinte — testabila izolat si refolosita si de
// parserul e-Factura (lib/pricing/efactura.ts), si de ruta AI (parse-invoice).

// O linie care NU e produs: garantiile SGR / ambalajele returnabile / navetele.
// Modelul AI e instruit sa le excluda, dar uneori le scapa ca produse (vazut pe
// facturi Metro/Supeco: "GARANTIE PET" aparea in lista cu pret copiat de la
// produsul vecin). Filtrul din cod e plasa de siguranta care nu da gres.
export function isNonProductLine(name: string): boolean {
  const n = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  return /\bambalaj\b|garantie|garanti[ae]-?returnare|\breturnare\b|^sgr\b/.test(n)
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
