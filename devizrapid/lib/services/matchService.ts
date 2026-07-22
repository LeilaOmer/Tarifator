// Potrivirea unui articol DICTAT ("3 m de teava") cu un serviciu SALVAT
// ("Teava PPR 20mm") se face DETERMINIST in cod, nu de model — modelul e slab la
// echo-ul exact al unui id, dar bun la "ce a spus omul". Deci modelul intoarce
// doar eticheta auzita + cantitatea, iar aici o legam de serviciul potrivit,
// tolerant la diacritice, plural, cuvinte de umplutura ("de", "la", "niste") si
// la unitatile de masura lipite ("3 m", "2 bucati").

export type MatchableService = { id: string; name: string }

// Cuvinte de umplutura + unitati de masura care NU ajuta la identificarea
// serviciului (le scoatem inainte de potrivire).
const STOP = new Set([
  'de', 'la', 'un', 'o', 'niste', 'cu', 'si', 'pe', 'pentru', 'din', 'in', 'a', 'al', 'ale',
  'buc', 'bucata', 'bucati', 'bucăți', 'm', 'metru', 'metri', 'ml', 'l', 'kg', 'g',
  'ora', 'ore', 'h', 'mp', 'mc', 'set', 'seturi',
  // numere scrise in litere (cantitatea nu ajuta la identificarea serviciului)
  'unu', 'doi', 'doua', 'trei', 'patru', 'cinci', 'sase', 'sapte', 'opt', 'noua', 'zece',
])

export function normalizeTerm(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // fara diacritice
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w && !/^\d+$/.test(w) && !STOP.has(w)) // scoate cifrele pure si stop-words
    .join(' ')
}

// Cel mai bun serviciu pentru eticheta dictata, sau null daca nimic nu se
// potriveste rezonabil (caz in care articolul se ARATA ca "nerecunoscut", nu se
// leaga gresit de alt serviciu — mai bine nepotrivit decat gresit).
export function matchService<T extends MatchableService>(label: string, services: T[]): T | null {
  const q = normalizeTerm(label)
  if (!q) return null
  const qTokens = q.split(' ')

  const scored = services.map(s => {
    const n = normalizeTerm(s.name)
    if (!n) return { s, score: 0 }
    const nTokens = n.split(' ')
    let score: number
    if (n === q) score = 1
    else if (n.includes(q) || q.includes(n)) score = 0.9 // "teava" in "teava ppr 20mm"
    else {
      // suprapunere de cuvinte, raportata la termenul mai scurt
      const nset = new Set(nTokens)
      const overlap = qTokens.filter(t => nset.has(t)).length
      score = overlap / Math.min(qTokens.length, nTokens.length)
    }
    return { s, score }
  })

  const bestScore = Math.max(...scored.map(x => x.score))
  if (bestScore < 0.6) return null // nimic rezonabil => "nerecunoscut", nu ghicim

  // AMBIGUU: daca acelasi scor maxim e atins de mai multe servicii DIFERITE si nu e
  // o potrivire exacta (ex. "montaj" prinde si "montaj priza", si "montaj intrerupator"),
  // NU ghicim — mai bine il aratam ca nerecunoscut decat sa legam gresit.
  const top = scored.filter(x => x.score === bestScore)
  if (top.length > 1 && bestScore < 1) return null
  return top[0].s
}
