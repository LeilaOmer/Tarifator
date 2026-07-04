import { createClient } from '@supabase/supabase-js'

// Verifica bearer token-ul cu clientul ANON (NU service-role — pe service-role
// auth.getUser valideaza gresit, bug intalnit deja in acest proiect). Intoarce
// userId daca token-ul e valid, altfel null.
export async function verifyBearer(authHeader: string | null): Promise<string | null> {
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return null
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  return user.id
}

// La fel ca verifyBearer, dar intoarce si emailul (pentru verificarea de admin).
export async function verifyBearerUser(authHeader: string | null): Promise<{ id: string; email: string } | null> {
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return null
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  return { id: user.id, email: user.email ?? '' }
}
