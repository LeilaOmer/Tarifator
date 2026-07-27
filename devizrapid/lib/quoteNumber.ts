import { supabase } from '@/lib/supabase'

// Numerotare scopata per firma (sau per user, in artizan fara firma) si per
// luna calendaristica. Foloseste MAX(secventa existenta) + 1, NU count+1:
// count-ul scade cand stergi o fisa, deci count+1 ar putea reproduce un numar
// deja folosit de o fisa ramasa. MAX+1 e mereu mai mare decat orice numar
// existent din scope, deci nu se ciocneste cu o fisa existenta nici dupa
// stergeri. Pentru cazul a doua creari simultane (doua taburi, doua telefoane pe
// acelasi cont), vezi `insertQuoteWithNumber` mai jos.
export async function nextQuoteNumber(userId: string, companyId: string | null): Promise<string> {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const monthStart = new Date(year, now.getMonth(), 1).toISOString()
  const prefix = 'DR-' + year + month + '-'

  let query = supabase.from('quotes').select('quote_number').gte('created_at', monthStart)
  query = companyId ? query.eq('company_id', companyId) : query.eq('user_id', userId).is('company_id', null)

  const { data } = await query
  let maxSeq = 0
  for (const row of data ?? []) {
    const qn = (row as { quote_number: string | null }).quote_number
    if (typeof qn !== 'string' || !qn.startsWith(prefix)) continue
    const seq = parseInt(qn.slice(prefix.length), 10)
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq
  }
  return prefix + String(maxSeq + 1).padStart(3, '0')
}

/** Codul Postgres pentru violarea unei constrangeri de unicitate. */
export const UNIQUE_VIOLATION = '23505'

/** Cate incercari facem inainte sa renuntam. Trei acopera si o coliziune in lant. */
export const NUMBER_RETRIES = 3

/**
 * Decide daca merita reincercat cu un numar nou.
 *
 * Extras ca functie pura ca sa poata fi testat fara baza de date: e singura
 * bucata cu logica din retry, restul e apelul Supabase.
 */
export function shouldRetryNumber(error: { code?: string } | null, attempt: number): boolean {
  if (!error) return false
  // ORICE alta eroare (RLS, coloana lipsa, retea) se intoarce imediat: a
  // reincerca ar ascunde cauza reala si ar face trei cereri degeaba.
  if (error.code !== UNIQUE_VIOLATION) return false
  return attempt + 1 < NUMBER_RETRIES
}

/**
 * Textul aratat omului cand crearea fisei esueaza. Dupa trei incercari, o
 * coliziune de numar nu mai e o cursa de moment: inseamna ca altcineva creeaza
 * fise in acelasi timp, iar "cheie duplicata" nu-i spune nimic.
 */
export function quoteInsertMessage(error: { code?: string; message?: string } | null): string {
  if (!error) return 'eroare necunoscuta'
  if (error.code === UNIQUE_VIOLATION) {
    return 'numarul de fisa tocmai a fost luat de alta fisa. Reincarca pagina si incearca din nou.'
  }
  return error.message || 'eroare necunoscuta'
}

/**
 * Insereaza fisa cu numarul urmator, reincercand daca numarul a fost prins intre
 * timp de altcineva.
 *
 * DE CE: `nextQuoteNumber` citeste maximul si abia apoi se scrie — intre cele
 * doua momente, o a doua creare (alt tab, alt telefon pe acelasi cont) poate lua
 * exact acelasi numar. Indexul unic `quotes_unique_number` din
 * `supabase/enforce-limits.sql` opreste dublura, dar pana acum ea ajungea la om
 * ca un mesaj de baza de date, cu fisa nesalvata. Acum recitim maximul si
 * incercam din nou: coliziunea devine invizibila.
 *
 * ATENTIE: reincercarea depinde de indexul unic. Fara el (daca
 * `enforce-limits.sql` nu a fost rulat) nu apare nicio eroare si se salveaza doua
 * fise cu acelasi numar — exact ce nu vrem pe un document dat clientului.
 */
export async function insertQuoteWithNumber(
  userId: string,
  companyId: string | null,
  payload: Record<string, unknown>,
) {
  let last
  for (let attempt = 0; attempt < NUMBER_RETRIES; attempt++) {
    const quote_number = await nextQuoteNumber(userId, companyId)
    last = await supabase.from('quotes').insert({ ...payload, quote_number }).select().single()
    if (!shouldRetryNumber(last.error, attempt)) return last
  }
  return last!
}
