// Aplicarea unei comenzi vocale de modificare peste o lista de lucrari.
//
// PRINCIPIU (acelasi ca la scanarea de facturi): modelul spune CE A VRUT OMUL,
// codul face SCHIMBAREA. Modelul intoarce o OPERATIE ("adauga priza x2"), nu
// starea rezultata.
//
// DE CE: cerandu-i modelului lista COMPLETA dupa modificare, el trebuia sa
// re-transcrie corect fiecare linie existenta la fiecare comanda. Pe "mai adauga
// doua prize" intorcea doar priza, iar lista se inlocuia cu ea => restul
// lucrarilor dispareau. Nu era o problema de formulare a promptului: un model
// care re-scrie 8 linii ca sa adauge una are 8 ocazii sa greseasca; unul care
// spune doar "adauga priza x2" are una. Lista curenta nu mai trece prin model,
// deci o linie poate disparea DOAR daca s-a cerut explicit stergerea ei.

import { matchService, type MatchableService } from './matchService'

export type EditOp = 'add' | 'set' | 'remove' | 'clear'
export type EditAction = { op: EditOp; label?: string; quantity?: number }

/** Linia minima pe care o manipulam; apelantul poate avea campuri in plus. */
export type EditableLine = { service_id: string; quantity: number }

export type ApplyResult<T extends EditableLine> = {
  items: T[]
  /** Etichete care nu s-au potrivit cu niciun serviciu salvat — se ARATA, nu se arunca. */
  unmatched: string[]
  /** true daca vreo actiune a schimbat efectiv ceva (pentru mesajul din UI). */
  changed: boolean
  /** Actiuni distructive propuse de model, dar pe care omul nu le-a cerut. */
  blockedDestructive: number
}

// Verbe de stergere, in comanda OMULUI (fara diacritice, cum vine de la Whisper
// si dupa normalizare). Lista e voit generoasa: un fals-pozitiv inseamna doar ca
// permitem o stergere pe care modelul oricum a cerut-o corect.
const DESTRUCTIVE_RE =
  /\b(sterg\w*|sters\w*|scoat\w*|scot|scoti|elimin\w*|anul\w*|renunt\w*|curat\w*|gol\w*|arunc\w*|inlocui\w*|refac\w*|capat)\b|\bnu mai\b|\bfara\b/

const noDiacritics = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * A cerut omul, efectiv, o stergere?
 *
 * Gard DETERMINIST peste iesirea modelului, in acelasi spirit ca `scanGuards.ts`:
 * `remove` si `clear` sunt singurele operatii care pot face munca utilizatorului
 * sa dispara, deci nu au voie sa depinda DOAR de judecata modelului. Pe
 * "mai adauga doua prize" un model poate emite "clear" + "add" ("golesc si
 * reconstruiesc lista") — corect din punctul lui de vedere, catastrofal pentru
 * om. Daca in ce a spus omul nu exista niciun verb de stergere, actiunile
 * distructive se ignora.
 */
export function hasDestructiveIntent(command: string): boolean {
  return DESTRUCTIVE_RE.test(noDiacritics(command))
}

const MAX_QTY = 100_000

const qty = (v: unknown): number =>
  Math.min(Math.max(1, Math.round(Number(v)) || 1), MAX_QTY)

/** Normalizeaza operatia primita de la model; orice necunoscut devine 'add'. */
export function normalizeOp(raw: unknown): EditOp {
  const s = String(raw ?? '').toLowerCase().trim()
  if (s === 'remove' || s === 'delete' || s === 'sterge' || s === 'scoate') return 'remove'
  if (s === 'set' || s === 'seteaza' || s === 'schimba') return 'set'
  if (s === 'clear' || s === 'sterge_tot' || s === 'reset') return 'clear'
  return 'add'
}

/**
 * Aplica actiunile peste lista curenta.
 * `makeLine` construieste o linie noua din serviciul potrivit + cantitate —
 * apelantul stie ce campuri in plus are nevoie (pret, nume, total).
 */
export function applyEditActions<T extends EditableLine>(
  current: T[],
  actions: EditAction[],
  services: MatchableService[],
  makeLine: (serviceId: string, quantity: number) => T | null,
  /** Comanda ORIGINALA a omului — decide daca stergerile sunt permise. */
  command = '',
): ApplyResult<T> {
  let items = [...current]
  const unmatched: string[] = []
  let changed = false
  let blockedDestructive = 0
  // Fara comanda (apel din teste/alte fluxuri) pastram comportamentul deschis;
  // ruta trimite mereu comanda, deci in productie gardul e mereu activ.
  const allowDestructive = command === '' || hasDestructiveIntent(command)

  for (const a of actions) {
    const op = normalizeOp(a.op)

    if (op === 'clear') {
      if (!allowDestructive) { blockedDestructive++; continue }
      if (items.length > 0) changed = true
      items = []
      continue
    }

    const label = String(a.label ?? '').trim()
    if (!label) continue
    const svc = matchService(label, services)
    if (!svc) { unmatched.push(label); continue }

    const idx = items.findIndex(i => i.service_id === svc.id)

    if (op === 'remove') {
      if (!allowDestructive) { blockedDestructive++; continue }
      if (idx !== -1) { items.splice(idx, 1); changed = true }
      continue
    }

    const n = qty(a.quantity)
    if (idx === -1) {
      // 'set' pe o linie inexistenta = adaugare cu acea cantitate.
      const line = makeLine(svc.id, n)
      if (line) { items.push(line); changed = true }
      continue
    }

    // "mai adauga doua prize" cand exista deja 3 => 5. "fa 5 prize" => 5.
    const next = op === 'add' ? Math.min(items[idx].quantity + n, MAX_QTY) : n
    if (next !== items[idx].quantity) {
      items[idx] = { ...items[idx], quantity: next }
      changed = true
    }
  }

  return { items, unmatched, changed, blockedDestructive }
}
