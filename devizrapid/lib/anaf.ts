import { supabase } from '@/lib/supabase'

type AnafData = {
  name?: string; address?: string; reg_com?: string; scpTva?: boolean; error?: string
}

// Apel comun catre /api/anaf-lookup, cu tokenul userului atasat (ruta cere
// autentificare + are limita zilnica, ca sa nu fie un proxy ANAF deschis).
export async function anafLookup(cui: string | number): Promise<{ ok: boolean; data: AnafData }> {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`/api/anaf-lookup?cui=${encodeURIComponent(String(cui))}`, {
    headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, data }
}
