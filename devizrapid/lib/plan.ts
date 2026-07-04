import { supabase } from '@/lib/supabase'

// Tipul de abonament — axa DISTINCTA de account_type (care ramane comutatorul
// TVA/firme multiple, liber pentru toti). Numele "artizan"/"pro" se suprapun
// intentionat cu account_type, dar sunt concepte separate: aici e vorba de
// limitele lunare pe cele doua module (Fise Servicii vs Mercator/Calculator).
export type PlanTier = 'free' | 'artizan' | 'mercator' | 'pro'

// Cat timp e true, oricine e tratat ca Pro (totul nelimitat) — faza de testare
// pre-lansare. Se stinge MANUAL la lansare, ca sa intre in vigoare limitele reale.
export const PRELAUNCH = true

// Prima luna dupa inregistrare: orice cont Free primeste limite ridicate (10+10)
// in loc de 3+3, apoi cade inapoi pe Free. Free ramane podeaua permanenta.
export const FREEMIUM_DAYS = 30
export const FREEMIUM_LIMIT = 30

export const TIER_LIMITS: Record<PlanTier, { fise: number; calcule: number }> = {
  free: { fise: 3, calcule: 3 },
  artizan: { fise: Infinity, calcule: 3 },
  mercator: { fise: 3, calcule: Infinity },
  pro: { fise: Infinity, calcule: Infinity },
}

export const TIER_LABELS: Record<PlanTier, string> = {
  free: 'Free',
  artizan: 'Artizan',
  mercator: 'Mercator',
  pro: 'Pro',
}

export type EffectiveLimits = {
  fise: number
  calcule: number
  tier: PlanTier
  prelaunch: boolean
  freemium: boolean
  lifetime: boolean
}

// Limitele lunare efective pentru un user, tinand cont, in ordine, de:
// 1. pre-lansare (toti Pro), 2. acces gratuit pe viata, 3. abonament platit activ,
// 4. freemium prima luna, 5. Free. Un singur select pe profil.
export async function getEffectiveLimits(userId: string, createdAt: string): Promise<EffectiveLimits> {
  if (PRELAUNCH) {
    return { ...TIER_LIMITS.pro, tier: 'pro', prelaunch: true, freemium: false, lifetime: false }
  }

  const { data } = await supabase
    .from('profiles')
    .select('plan_tier, plan_active_until, lifetime')
    .eq('id', userId)
    .single()

  // Acces gratuit full pe viata — acordat manual (coloana `lifetime`) unor oameni
  // care au ajutat proiectul. Pro nelimitat, fara data de expirare.
  if (data?.lifetime) {
    return { ...TIER_LIMITS.pro, tier: 'pro', prelaunch: false, freemium: false, lifetime: true }
  }

  const active = !!data?.plan_active_until && new Date(data.plan_active_until) > new Date()
  const storedTier = (data?.plan_tier as PlanTier | null) ?? 'free'
  const tier: PlanTier = active && storedTier !== 'free' ? storedTier : 'free'

  if (tier === 'free') {
    const daysElapsed = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000)
    if (daysElapsed < FREEMIUM_DAYS) {
      return { fise: FREEMIUM_LIMIT, calcule: FREEMIUM_LIMIT, tier, prelaunch: false, freemium: true, lifetime: false }
    }
  }

  return { ...TIER_LIMITS[tier], tier, prelaunch: false, freemium: false, lifetime: false }
}
