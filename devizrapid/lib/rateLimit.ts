import { createClient } from '@supabase/supabase-js'

// Contor simplu de folosire per user + endpoint + zi, in tabelul api_usage.
// Foloseste service-role (identitatea userului e deja verificata de ruta), ca
// sa nu depinda de politici RLS pe tabelul de contorizare.
function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// Fail-open-ul e o alegere corecta, dar TACUT e o capcana: fara cheia de
// service-role, TOATE plafoanele zilnice din aplicatie dispar deodata si nimic
// nu semnaleaza asta — aplicatia pare sanatoasa in timp ce singura aparare
// impotriva abuzului nu mai exista. Acum orice trecere pe fail-open lasa urma in
// logurile serverului. `warnOnce` ca sa nu inunde logul la fiecare cerere:
// mesajul trebuie sa se poata gasi, nu sa acopere restul.
const warned = new Set<string>()
function warnOnce(key: string, message: string) {
  if (warned.has(key)) return
  warned.add(key)
  console.error('[rateLimit] ' + message)
}

// Verifica limita zilnica si, daca nu e depasita, inregistreaza folosirea.
// Intoarce true daca apelul e permis, false daca s-a atins limita.
// Fail-open la eroare de infra: un hopa de retea NU trebuie sa blocheze un
// user legitim (contorul e o protectie anti-abuz, nu o poarta critica).
export async function allowDaily(userId: string, endpoint: string, dailyLimit: number): Promise<boolean> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    warnOnce('no-key', 'SUPABASE_SERVICE_ROLE_KEY lipseste => TOATE plafoanele zilnice sunt oprite')
    return true
  }
  try {
    const client = serviceClient()
    const today = new Date().toISOString().slice(0, 10)
    const { count, error } = await client
      .from('api_usage')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('endpoint', endpoint)
      .gte('created_at', today)
    // Eroarea la CITIRE era inghitita: `count` ramanea undefined, `?? 0` o facea
    // sa arate ca "zero folosiri azi", iar plafonul nu se mai atingea niciodata.
    // Un tabel lipsa sau o politica gresita opreau tacut contorizarea.
    if (error) {
      warnOnce('read:' + endpoint, `nu s-a putut citi contorul pentru ${endpoint} => trece fara plafon: ${error.message}`)
      return true
    }
    if ((count ?? 0) >= dailyLimit) return false
    const { error: insErr } = await client.from('api_usage').insert({ user_id: userId, endpoint })
    if (insErr) warnOnce('write:' + endpoint, `apelul la ${endpoint} nu s-a inregistrat => nu se scade din plafon: ${insErr.message}`)
    return true
  } catch (err) {
    warnOnce('throw:' + endpoint, `contorul pentru ${endpoint} a aruncat => trece fara plafon: ${String(err)}`)
    return true
  }
}

// IP-ul REAL al clientului, din headerele puse de platforma.
//
// ATENTIE (bug corectat): `x-forwarded-for` e un LANT, iar valoarea din STANGA e
// cea trimisa de client — deci controlata de el. Luand `[0]`, oricine punea
// `X-Forwarded-For: 1.2.3.4` primea o "identitate" noua la fiecare cerere si
// ocolea complet plafonul zilnic. Ordinea corecta:
//   1. headerele proprii ale platformei (Vercel le SUPRASCRIE, nu le accepta
//      de la client), apoi
//   2. ULTIMA valoare din lant — cea adaugata de proxy-ul cel mai apropiat de
//      noi, singura pe care clientul nu o poate falsifica.
export function clientIp(req: Request): string {
  const vercel = req.headers.get('x-vercel-forwarded-for')?.trim()
  if (vercel) return vercel.split(',').pop()!.trim()

  const real = req.headers.get('x-real-ip')?.trim()
  if (real) return real

  const chain = (req.headers.get('x-forwarded-for') || '').split(',').map(s => s.trim()).filter(Boolean)
  return chain.length ? chain[chain.length - 1] : ''
}

// La fel ca allowDaily, dar cheia e IP-ul, nu userId — pentru rutele PUBLICE
// (pre-signup) care n-au user autentificat. Contra apelurilor repetate de la
// neautentificati (enumerare / amplificare de cost). Tabel separat: ip_throttle
// (vezi supabase/ip-throttle.sql). Fail-open la eroare de infra sau IP lipsa.
export async function allowDailyByIp(ip: string, endpoint: string, dailyLimit: number): Promise<boolean> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    warnOnce('no-key', 'SUPABASE_SERVICE_ROLE_KEY lipseste => TOATE plafoanele zilnice sunt oprite')
    return true
  }
  // Fara IP nu exista cheie de contorizare. Se intampla in dezvoltare locala;
  // in productie ar insemna ca rutele publice n-au nicio aparare, deci se vede.
  if (!ip) {
    warnOnce('no-ip:' + endpoint, `nu s-a putut determina IP-ul la ${endpoint} => ruta publica trece fara plafon`)
    return true
  }
  try {
    const client = serviceClient()
    const today = new Date().toISOString().slice(0, 10)
    const { count, error } = await client
      .from('ip_throttle')
      .select('*', { count: 'exact', head: true })
      .eq('ip', ip)
      .eq('endpoint', endpoint)
      .gte('created_at', today)
    if (error) {
      warnOnce('ip-read:' + endpoint, `nu s-a putut citi throttle-ul pe IP pentru ${endpoint} => trece fara plafon: ${error.message}`)
      return true
    }
    if ((count ?? 0) >= dailyLimit) return false
    const { error: insErr } = await client.from('ip_throttle').insert({ ip, endpoint })
    if (insErr) warnOnce('ip-write:' + endpoint, `apelul la ${endpoint} nu s-a inregistrat pe IP => nu se scade din plafon: ${insErr.message}`)
    return true
  } catch (err) {
    warnOnce('ip-throw:' + endpoint, `throttle-ul pe IP pentru ${endpoint} a aruncat => trece fara plafon: ${String(err)}`)
    return true
  }
}
