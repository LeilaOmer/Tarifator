import { supabase } from '@/lib/supabase'

// Alegerea userului intre cele doua module ale aplicatiei — separate curat si
// la nivel de date (Mercator/calculator: pricing_drafts; Fise Servicii: services
// + clients + quotes). null = nu a ales inca (coloana noua, fara valoare) — in
// acest caz dashboard-ul arata layout-ul vechi (ambele module) SI intreaba o
// singura data. 'both' e o alegere explicita ("nu stiu inca"), nu default SQL —
// altfel n-am mai putea distinge "n-a fost intrebat" de "a ales amandoua".
export type PrimaryModule = 'calculator' | 'fise' | 'both'

export async function setPrimaryModule(userId: string, value: PrimaryModule): Promise<{ error: string | null }> {
  const { error } = await supabase.from('profiles').update({ primary_module: value }).eq('id', userId)
  return { error: error?.message ?? null }
}
