// Persistenta agentului TikTok: transforma un set de variante in randuri pentru
// tabelul `tiktok_ideas`. Functie PURA (fara acces la DB) — usor de testat, iar
// scrierea efectiva se face in ruta API (app/api/tiktok-agent/route.ts).
//
// Salvam METADATE, nu doar text: content_type, goal, tema, model si data. Peste
// 3-6 luni, alaturi de coloanele de performanta (views/likes/comments/shares/
// saves, completate manual dupa postare), poti invata ce combinatie a mers.
// Schema: supabase/tiktok-ideas.sql.

import type { TikTokContentType, TikTokGoal, TikTokVariantSet } from './generate.ts'

// Un rand in `tiktok_ideas` = O varianta (nu tot setul), ca sa poti urmari
// performanta fiecarei variante separat. Cele 3 variante ale unei idei impart
// acelasi set_id si aceeasi idee.
export interface TikTokIdeaRow {
  user_id: string
  set_id: string
  topic: string | null
  idea: string
  content_type: TikTokContentType
  goal: TikTokGoal
  hook: string
  script: string
  description: string
  hashtags: string[]
  cta: string
  video_prompt: string
  model: string
}

export interface RowMeta {
  userId: string
  setId: string // grupeaza variantele aceleiasi idei (uuid generat de apelant)
  model: string
}

// Transforma un set de variante in randuri gata de inserat. camelCase -> snake_case.
export function variantSetToRows(set: TikTokVariantSet, meta: RowMeta): TikTokIdeaRow[] {
  return set.variants.map((v) => ({
    user_id: meta.userId,
    set_id: meta.setId,
    topic: set.topic,
    idea: set.idea,
    content_type: v.contentType,
    goal: v.goal,
    hook: v.hook,
    script: v.script,
    description: v.description,
    hashtags: v.hashtags,
    cta: v.cta,
    video_prompt: v.videoPrompt,
    model: meta.model,
  }))
}
