import { supabase } from '@/lib/supabase'

// Limitele per tip de cont traiesc acum in lib/plan.ts (TIER_LIMITS). Aici raman
// doar numararea consumului lunar (calendaristic) si verificarea abonamentului.

function monthStart(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
}

export async function getMonthlyFise(userId: string): Promise<number> {
  const { count } = await supabase
    .from('quotes')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', monthStart())
  return count ?? 0
}

export async function getMonthlyCalcule(userId: string): Promise<number> {
  const { count } = await supabase
    .from('pricing_usage')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', monthStart())
  return count ?? 0
}

// Intoarce eroarea in loc s-o inghita: triggerul `pricing_usage_limit` din DB
// (supabase/enforce-limits.sql) respinge inserarea cand limita lunara e atinsa.
// Ignorata, UI-ul incrementa un contor pe care baza de date nu-l acceptase —
// succes fals, exact ce interzice AGENTS.md.
export async function logCalcul(userId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('pricing_usage').insert({ user_id: userId })
  return { error: error?.message ?? null }
}
