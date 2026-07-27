import { supabase } from '@/lib/supabase'

// Consimtamintele date la inregistrare, PASTRATE ca dovada.
//
// DE CE: GDPR Art. 7(1) cere operatorului sa poata DEMONSTRA ca persoana si-a
// dat consimtamantul. Pana acum cele patru bife erau verificate in browser si
// apoi aruncate: nu exista nicaieri cine a acceptat, ce, cand si pe ce versiune
// a documentelor. Iar acordul de marketing — singurul opt-in real — se pierdea
// complet, deci nu putea fi nici onorat, nici respectat la dezabonare.

/**
 * Versiunea documentelor acceptate. SE INCREMENTEAZA cand modifici Termenii,
 * Politica de confidentialitate sau Politica de retragere in mod care schimba
 * ce accepta omul. Consimtamantul e legat de o VERSIUNE — altfel, dupa o
 * modificare de continut, dovada ta arata acceptarea unui text care nu mai
 * exista.
 */
export const CONSENT_VERSION = '2026-07-27'

export type ConsentKind = 'termeni' | 'gdpr' | 'retragere' | 'marketing'

export type ConsentChoices = {
  termeni: boolean
  gdpr: boolean
  retragere: boolean
  marketing: boolean
}

/**
 * Forma pastrata in `user_metadata`, la crearea contului.
 *
 * De ce si aici, nu doar in tabel: la inregistrarea cu confirmare pe email NU
 * exista inca sesiune, deci nu se poate scrie intr-un tabel cu RLS. Metadata se
 * scrie ODATA CU userul, deci dovada exista din prima secunda, chiar daca omul
 * nu-si confirma niciodata emailul.
 */
export function consentMetadata(choices: ConsentChoices) {
  return {
    consents: {
      version: CONSENT_VERSION,
      accepted_at: new Date().toISOString(),
      termeni: choices.termeni,
      gdpr: choices.gdpr,
      retragere: choices.retragere,
      marketing: choices.marketing,
    },
  }
}

/**
 * Scrie consimtamintele in tabelul `consents` — forma INTEROGABILA (ex. "cine a
 * acceptat marketing?"). Se apeleaza cand exista sesiune: imediat dupa
 * inregistrare daca nu e nevoie de confirmare pe email, altfel la prima
 * autentificare.
 *
 * Best-effort DELIBERAT: dovada legala e deja in `user_metadata`, deci un esec
 * aici nu are voie sa blocheze inregistrarea sau autentificarea. Constrangerea
 * de unicitate face apelul repetat inofensiv.
 */
export async function recordConsents(userId: string, choices: ConsentChoices): Promise<void> {
  const rows = (Object.keys(choices) as ConsentKind[]).map(kind => ({
    user_id: userId,
    kind,
    accepted: choices[kind],
    version: CONSENT_VERSION,
  }))
  const { error } = await supabase.from('consents').upsert(rows, { onConflict: 'user_id,kind,version' })
  if (error) console.error('[consents] nu s-au inregistrat:', error.message)
}

/** Consimtamintele proprii — pentru exportul de date (dreptul de acces). */
export async function myConsents(userId: string) {
  const { data } = await supabase
    .from('consents')
    .select('kind, accepted, version, accepted_at')
    .eq('user_id', userId)
    .order('accepted_at', { ascending: false })
  return data ?? []
}
