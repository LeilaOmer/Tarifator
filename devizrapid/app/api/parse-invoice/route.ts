import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseEfacturaXml, isEfacturaXml, parseEfacturaAnafPdf } from '@/lib/pricing/efactura'
import { isNonProductLine, reconcileUnitPrice, applySgrFromGuaranteeLines, classifySgr, phantomRowIndexes, type ScannedLine } from '@/lib/pricing/scanGuards'
import { parseInvoiceTableText } from '@/lib/pricing/invoiceTable'
import { piecesPerBox } from '@/lib/pricing/efactura'

function getSupabaseAdmin() {
  // Cheia anonima — foloseste DOAR pentru auth.getUser(token).
  // NU schimba la service role aici: auth.getUser(token) valideaza gresit
  // (401 pentru toata lumea) daca clientul e creat cu cheia de service role.
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

// Client cu IDENTITATEA userului, pentru orice interogare care trece prin RLS.
//
// DE CE separat de cel de mai sus (bug real, corectat): `auth.getUser(token)`
// doar VALIDEAZA tokenul printr-un apel la /auth/v1/user — NU il ataseaza
// clientului. Interogarile `.from(...)` care urmeau plecau ca rol `anon`, deci
// sub politicile `auth.uid() = user_id` din supabase/rls.sql:
//   - SELECT-ul contorului intorcea mereu 0 randuri => limita de 50 scanari/zi
//     NU se declansa niciodata;
//   - INSERT-ul era respins de `with check` => invoice_scan_logs ramanea GOL.
// Adica singura aparare a cotei Groq nu exista. Acelasi tipar corect e deja
// folosit in app/api/box-ratio si app/api/delete-account.
function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } },
  )
}

// Ziua curenta in ora Romaniei, nu UTC: cu `toISOString()` contorul se reseta
// la 03:00 vara / 02:00 iarna, in mijlocul zilei de lucru a utilizatorului.
function todayRo(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Bucharest' })
}

// Limita e pe DOCUMENT scanat, nu pe cerere HTTP. O poza densa se trimite in
// 2-4 felii (useInvoiceScan o taie ca sa fie citibila), iar daca am numara
// fiecare felie, "50 scanari/zi" ar insemna in realitate ~12 poze — nu asta
// promite BUSINESS_RULES cap. 9. Contorizam doar prima felie a unui document.
const SCANS_PER_DAY = 50

// Contorul de scanari, sub identitatea userului. Intoarce `false` cand limita e
// atinsa. Fail-open la eroare de infra (un hopa de retea nu trebuie sa blocheze
// un user legitim), dar fail-open EXPLICIT, nu din accident.
async function allowScan(userClient: ReturnType<typeof getUserClient>, userId: string) {
  const { count, error } = await userClient
    .from('invoice_scan_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', todayRo())
  if (error) return true
  return (count ?? 0) < SCANS_PER_DAY
}

// Inregistrarea scanarii. Eroarea NU se ignora (AGENTS.md): un esec tacut aici
// era exact cauza pentru care contorul a stat gol luni de zile.
async function logScan(userClient: ReturnType<typeof getUserClient>, userId: string) {
  const { error } = await userClient.from('invoice_scan_logs').insert({ user_id: userId })
  if (error) console.error('[parse-invoice] nu s-a inregistrat scanarea:', error.message)
}

function getServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Raporturi bucati/cutie corectate manual, PARTAJATE intre utilizatori (ADR-024):
// ambalarea e a furnizorului, nu a clientului — acelasi furnizor pune aceleasi
// detalii de produs la toti clientii lui (ex. Albeni = cutie de 18 oriunde), deci
// corectia unui user ii ajuta pe toti ceilalti. Ordinea de prioritate: corectia
// PROPRIE bate corectiile altora — daca cineva a gresit, fiecare user se poate
// apara corectand el insusi (corectia lui il acopera pe el, fara sa strice restul).
async function getKnownRatios(supplierName: string, userId: string): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  // Numele vine din raspunsul MODELULUI, deci din continutul unui document
  // incarcat de utilizator. In `ilike`, `%` si `_` sunt metacaractere: un antet
  // manipulat ca modelul sa intoarca "%" facea interogarea sa potriveasca TOTI
  // furnizorii si sa aplice raporturi straine. Le escapam.
  const name = supplierName?.trim().replace(/[\\%_]/g, m => '\\' + m)
  if (!name) return map
  const { data } = await getServiceRoleClient()
    .from('product_box_ratios')
    .select('product_name, pieces_per_box, created_by')
    .ilike('supplier_name', name)
  if (data) {
    const rows = data as { product_name: string; pieces_per_box: number; created_by: string }[]
    for (const row of rows) {
      if (row.created_by === userId) map.set(normalizeName(row.product_name), row.pieces_per_box)
    }
    for (const row of rows) {
      const key = normalizeName(row.product_name)
      if (!map.has(key)) map.set(key, row.pieces_per_box)
    }
  }
  return map
}

// Modelele Groq se DEPRECIAZA: meta-llama/llama-4-scout-17b-16e-instruct a fost
// oprit pe 17.06.2026 pentru planurile free/developer, iar scanarea pozelor a
// murit fara ca nimeni sa observe (calea de poze raporta orice eroare
// necunoscuta drept "poza neclara" — vezi useInvoiceScan). De aceea:
//   1. modelele sunt CONFIGURABILE din variabile de mediu — la urmatoarea
//      depreciere schimbi valoarea in Vercel, fara deploy de cod;
//   2. eroarea "model inexistent" e recunoscuta explicit si spusa ca atare.
// Implicit: qwen/qwen3.6-27b — multimodal (text+imagine), cu mod JSON,
// recomandat de Groq ca inlocuitor pentru llama-4-scout.
// LISTA de modele, incercate in ordine — nu un singur model. Cand furnizorul
// opreste unul (s-a intamplat: llama-4-scout, 17.06.2026), codul trece automat
// la urmatorul in loc sa moara pana observa cineva. Se poate suprascrie complet
// din mediu, separate prin virgula, deci un model nou se pune FARA deploy.
const VISION_MODELS = (process.env.GROQ_VISION_MODEL ||
  'meta-llama/llama-4-scout-17b-16e-instruct')
  .split(',').map(m => m.trim()).filter(Boolean)

// BUGETUL DE TOKENI, nu marimea raspunsului. Groq REZERVA `max_tokens` din
// plafonul de tokeni-pe-minut INAINTE sa vada raspunsul real, deci o valoare
// mare respinge cererea chiar daca modelul ar fi raspuns scurt.
// Pe planul gratuit, llama-4-scout are ~3-6K TPM. Socoteala pe o cerere:
//   prompt de sistem ~1.4K + imagine ~0.8-1.5K + max_tokens REZERVAT
// Cu 4000 rezervati ieseau ~7K => PESTE plafon => 429 la fiecare scanare.
// 1200 lasa loc pentru prompt + imagine si incape si in cazul cel mai strans.
// Recuperarea din parseJson salveaza oricum produsele generate pana la taietura,
// deci un raspuns scurtat pierde mult mai putin decat o cerere respinsa.
const VISION_MAX_TOKENS = Number(process.env.GROQ_VISION_MAX_TOKENS) || 1200
const TEXT_MAX_TOKENS = Number(process.env.GROQ_TEXT_MAX_TOKENS) || 1500

// llama-3.3-70b functioneaza in continuare pe acest cont, deci ramane primul —
// nu inlocuim ce merge. Dar NU apare in lista de modele gratuite disponibile,
// deci poate disparea oricand; gpt-oss-120b e rezerva (cel mai bun TPM din
// lista: ~8K, fata de ~6K la restul).
const TEXT_MODELS = (process.env.GROQ_TEXT_MODEL ||
  'llama-3.3-70b-versatile,openai/gpt-oss-120b')
  .split(',').map(m => m.trim()).filter(Boolean)

// Incearca modelele pe rand. Trece la urmatorul DOAR pentru "model inexistent";
// orice alta eroare (limita de rata, cerere prea mare) e reala si se propaga —
// n-are rost sa ardem cota pe alte modele pentru aceeasi problema.
async function callGroqWithFallback(
  models: string[], messages: unknown[], maxTokens: number,
  api: { base: string; key: string } = TEXT_API,
) {
  // Lista GOALA = "nu avem model de vedere". Semnalam imediat, fara nicio cerere
  // de retea: clientul trece pe OCR local. Se seteaza GROQ_VISION_MODEL="" cand
  // contul nu are niciun model de vedere, ca sa nu mai pierdem un drum pe fiecare
  // felie de poza.
  if (models.length === 0) throw new Error('groq_model_gone::niciun model configurat')
  let lastGone = ''
  for (const model of models) {
    try {
      return { raw: await callGroq(model, messages, maxTokens, api), model }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.startsWith('groq_model_gone::')) throw err
      lastGone = msg
      console.error(`[parse-invoice] model indisponibil, incerc urmatorul: ${model}`)
    }
  }
  throw new Error(lastGone || 'groq_model_gone::niciun model configurat')
}

const SYSTEM_PROMPT = `Esti asistent pentru comercianti romani. Extragi din document (factura, aviz sau bon fiscal) furnizorul si produsele. Raspunzi DOAR cu JSON valid, fara text, fara markdown.
Format: {"supplier":"Nume SRL","doc_type":"invoice","discounts":{"11":0,"21":0},"items":[{"name":"produs","unit":"buc","price_raw":0,"price_includes_vat":false,"pieces_per_box":1,"discount":0,"vat":21,"sgr":0,"line_total":0,"quantity":1,"card_discount":0}]}

ROLUL TAU: doar CITESTI si TRANSCRII numere brute. NU calcula, NU imparti pe bucata, NU scoate TVA, NU aplica discount — toate se fac automat in cod dupa tine. Daca faci tu calculul, gresesti.

doc_type: "invoice" pentru factura/aviz (implicit). "receipt" DOAR pentru bon de casa de marcat (Lidl/Kaufland etc: fara titlul "FACTURA"/"AVIZ", produse insirate simplu, cu legenda de litere TVA A/B/C/D la final). Antetul cu "S.C. ... SRL" / "Cod Fiscal" apare si pe facturi normale, NU e semn de bon. La orice dubiu => "invoice".

GENERAL:
- supplier = firma furnizoare din antet. Daca nu apare, "". NU inventa. Daca antetul are sigla unui SOFT de facturare (Meti, Oblio, WinMENTOR), ala NU e furnizorul — ia firma reala din sectiunea Furnizor/Magazin.
- Daca in poza se vad mai multe foi suprapuse, citeste DOAR documentul din prim-plan.
- Fara diacritice (a nu a, s nu s).
- Ignora randurile care NU sunt produse: Subtotal, Total, TVA, "Discount cumulat", si orice rand fara denumire proprie de produs — chiar daca au numere.
- Sub-liniile logistice ("Disponibil pe...", "Emporte immediat pe...") nu sunt produse. Nici codurile de bare / numerele de sub denumire — NU crea un al doilea produs cu nume trunchiat din acelasi rand fizic (un rand de factura = UN produs, o singura data).

FACTURA/AVIZ (doc_type=invoice), per produs:
- price_raw = pretul UNITAR tiparit, copiat exact. price_includes_vat = true daca coloana pretului e "cu TVA"/"TTI", false daca e "net"/"fara TVA"/neutra.
- unit = valoarea EXACTA din coloana UM, verbatim ("Buc","Cut","kg","ST"...). NU o traduce, NU o deduce din denumire. Daca documentul NU are coloana UM => "buc" (NU pune litrajul din denumire ca UM). (codul decide dupa ea daca randul e cutie de impartit.)
- pieces_per_box = nr. de bucati per ambalaj DOAR daca e scris in DENUMIRE: "24BUC/CUT"=>24, "30B/CUT"=>30, "35 GR 24 BUC"=>24, denumire taiata "...GLZ (18"=>18. Altfel 1. NU-l deduce de la alt produs (o face codul).
- quantity + line_total = cantitatea si valoarea randului (acelasi regim TVA ca price_raw). Completeaza-le MEREU cand exista coloane de cantitate si valoare — sunt verificare. Daca randul nu are cantitate proprie => quantity=1, line_total=0.
- VERIFICARE OBLIGATORIE: quantity x price_raw ≈ line_total. Daca nu se potriveste, ai citit gresit coloana/cifrele — incearca alta combinatie de pe rand pana se potriveste. NU accepta o citire care nu se verifica.
- Cifrele extrase din PDF pot fi LIPITE fara spatii (ex "buc23042.79276434.59707.78"). Incearca mai multe taieri, pastreaz-o pe cea care trece verificarea: aici Cant=2304, price_raw=2.7927, line_total=6434.59 (2304 x 2.7927 ≈ 6434.59 ✓). NU "69.46" gen citire care nu se verifica.
- Exemplu: "1,9820 | 5 | kg | 11% | 9,91" => price_raw=1.9820 (primul numar, NU 9.91 care e totalul), quantity=5, line_total=9.91, vat=11.

vat = cota TVA a randului, mapata la 11 sau 21 (pe facturi vechi 9%=>11, 19%=>21). Daca nu e vizibila, deduci din categorie: apa/alimente/bauturi nealcoolice/lemne/carti=>11; alcool/cosmetice/electrice/textile/materiale=>21. Doar 11 sau 21.

discount: 0 implicit. O linie "SCONTURI ACORDATE X%"/"SCONT X%"/"REMIZA X%"/"REDUCERE X%" NU e produs — pune procentul X in "discounts" pe cota TVA a acelei linii (ex daca e pe TVA 11% => {"11":5}). Daca un produs are coloana proprie de discount %, pune-o in "discount" la el. NU aplica discountul la price_raw. NU confunda cifre din valori/TVA cu discount.

sgr (0 sau 0.50): liniile "SGR"/"GARANTIE PET"/"GARANTIE STICLA"/"GARANTIE DOZA"/"AMBALAJ SGR"/"Garantie-Returnare" (in orice ordine a cuvintelor) NU sunt produse — exclude-le. Daca o astfel de linie are cantitatea = suma cantitatilor produselor de bautura de deasupra => pune sgr=0.50 la acele produse (valabil si pe e-factura unde linia are TVA 0%). Daca denumirea unui produs contine "SGR" => sgr=0.50. "NAV"/"NAVETA" in denumire => sgr=0. Altfel 0.

PROMO/gratuit (linie cu pret 0 si denumire cu "PROMO"/"GRATIS"/"BONUS") NU e produs separat — sunt bucati gratuite ale produsului platit cu acelasi nume; ignora linia gratuita.

BON FISCAL (doc_type=receipt) — layout inversat, pretul mereu cu TVA inclus:
- Layout Lidl: "cantitate UM x pret" apoi pe randul urmator "denumire ... total litera". Layout Kaufland: denumire, apoi cantitate ("2 * 7,99" sau "1,402 KG" sau lipsa) apoi "total litera".
- Per produs completezi: "line_total" = valoarea totala tiparita pe randul produsului (ultimul numar inainte de litera TVA); "quantity" = N din "N * pret", sau numarul din "cantitate UM" (ex 1,402), sau 1 daca nu apare; "unit" = UM tiparita (la produse cantarite ramane "kg", NU "buc").
- "card_discount" = daca IMEDIAT sub produs e o reducere de card (ex "Kaufland Card XTRA -7,00", valoare negativa fara litera TVA) => 7.00; altfel 0. NU e produs.
- vat = din LEGENDA de litere de la finalul bonului ("TVA A 21,00%", "B=11,00%"...). Maparea litera->procent difera intre magazine — citeste-o DOAR de pe bonul curent, aplic-o dupa litera fiecarui produs, mapeaza la 11/21.
- O linie fara denumire, doar valoare+litera (ex "0,50 D") sub un produs = garantia SGR a produsului de deasupra => sgr=0.50 la el, nu produs nou.
- Ignora: Subtotal/Total/Plata card/Rest/TVA%/date/numere de bon/sectiuni de raion fara pret/mesaje de multumire.`

// FURNIZORUL e configurabil, nu doar modelul. Groq expune API-ul in formatul
// OpenAI (`/openai/v1/chat/completions`, `messages` cu blocuri `image_url`),
// deci ORICE furnizor compatibil OpenAI se poate folosi schimband doar doua
// variabile de mediu — inclusiv OpenAI insusi, care are modele cu vedere.
//
// Exemplu, ca sa reactivezi citirea din poza printr-un model de vedere platit:
//   VISION_API_BASE  = https://api.openai.com/v1
//   VISION_API_KEY   = sk-...
//   GROQ_VISION_MODEL = <id-ul modelului cu vedere din contul tau>
// Textul poate ramane pe Groq (gratuit) — sunt configurari separate.
const GROQ_BASE = 'https://api.groq.com/openai/v1'
const VISION_API = {
  base: process.env.VISION_API_BASE || GROQ_BASE,
  key: process.env.VISION_API_KEY || process.env.GROQ_API_KEY || '',
}
const TEXT_API = {
  base: process.env.TEXT_API_BASE || GROQ_BASE,
  key: process.env.TEXT_API_KEY || process.env.GROQ_API_KEY || '',
}

async function callGroq(
  model: string, messages: unknown[], maxTokens = 4096,
  api: { base: string; key: string } = TEXT_API,
) {
  const res = await fetch(`${api.base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + api.key,
    },
    body: JSON.stringify({ model, messages, temperature: 0.1, max_tokens: maxTokens }),
  })
  const data = await res.json()
  if (res.status === 429) {
    // Groq da 429 si pentru limita reala de rate (tranzitorie, reincercarea ajuta),
    // si pentru "cerere prea mare pentru bugetul de tokeni/minut" (permanenta pentru
    // ACEEASI factura — reincercarea NU ajuta niciodata, marimea cererii nu se schimba).
    // Le distingem dupa textul erorii, ca sa nu mai spunem gresit userului sa mai astepte.
    // Pastram si textul brut dupa "::" ca sa putem diagnostica exact ce a raspuns Groq,
    // fara acces la logurile serverului.
    const msg = String(data.error?.message || '')
    if (/tokens per minute|request too large|TPM/i.test(msg)) throw new Error('groq_too_large::' + msg)
    throw new Error('groq_rate_limit::' + msg)
  }
  if (!res.ok) {
    const msg = String(data.error?.message || `Groq error ${res.status}`)
    // Model scos din uz / redenumit. Fara acest caz, mesajul ajungea in ramura
    // generica a clientului si aparea ca "poza neclara" — utilizatorul dadea
    // vina pe poza si refotografia la nesfarsit.
    if (res.status === 404 || /does not exist|decommission|deprecat|model_not_found|no longer/i.test(msg)) {
      throw new Error('groq_model_gone::' + msg)
    }
    throw new Error(msg)
  }
  return data.choices?.[0]?.message?.content || ''
}

// Incearca parsarea normala; daca raspunsul modelului a fost taiat la mijloc
// (depaseste max_tokens, sau conexiunea se intrerupe), recupereaza produsele
// care au apucat sa fie generate COMPLET inainte de taietura, in loc sa
// pierzi tot raspunsul pentru un singur produs neterminat de la coada.
function parseJson(raw: string) {
  const start = raw.indexOf('{')
  if (start === -1) return null
  const text = raw.slice(start)

  const fullMatch = text.match(/\{[\s\S]*\}/)
  if (fullMatch) {
    try { return JSON.parse(fullMatch[0]) } catch {}
  }

  const itemsIdx = text.indexOf('"items"')
  if (itemsIdx === -1) return null
  for (let i = text.length - 1; i >= itemsIdx; i--) {
    if (text[i] !== '}') continue
    const candidate = text.slice(0, i + 1) + ']}'
    try {
      const parsed = JSON.parse(candidate)
      if (Array.isArray(parsed.items) && parsed.items.length > 0) return parsed
    } catch {}
  }
  return null
}

function validateAndSanitize(data: unknown, knownRatios: Map<string, number>) {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (!Array.isArray(d.items)) return null

  // INAINTE de a filtra liniile de garantie/ambalaj, folosim informatia din ele:
  // o linie de garantie pune sgr=0.5 pe produsul precedent cu aceeasi cantitate
  // (facturi Metro/Supeco, unde produsele NU au "SGR" in denumire).
  applySgrFromGuaranteeLines(d.items as ScannedLine[])

  const isReceipt = d.doc_type === 'receipt'

  // Extract global discounts by VAT rate from the top-level "discounts" field
  const globalDiscounts: Record<number, number> = {}
  if (d.discounts && typeof d.discounts === 'object') {
    for (const [vatKey, disc] of Object.entries(d.discounts as Record<string, unknown>)) {
      if (vatKey !== '11' && vatKey !== '21') continue
      const vatNum = vatKey === '11' ? 11 : 21
      const discNum = Number(disc)
      if (discNum > 0 && discNum <= 100) globalDiscounts[vatNum] = discNum
    }
  }
  delete d.discounts
  delete d.doc_type

  // Ce am scos din lista si DE CE. Gardurile de mai jos sunt euristici: pot
  // gresi (un comerciant de ambalaje, un rand real fara cantitate proprie), iar
  // pana acum greseau in TACERE — produsul lipsea din rezultat fara ca omul sa
  // aiba cum sa afle. Raportam fiecare excludere, ca decizia finala sa fie a lui.
  const excluded: { name: string; reason: 'garantie' | 'duplicat' | 'neclar' }[] = []

  const filtered = (d.items as unknown[]).filter((i: unknown) => {
    if (!i || typeof i !== 'object') return false
    const item = i as Record<string, unknown>
    if (typeof item.name !== 'string' || item.name.trim() === '') return false
    // Plasa de siguranta DETERMINISTA: modelul e instruit sa excluda liniile de
    // garantie/ambalaj SGR, dar uneori le scapa ca produse (cu pret copiat de la
    // vecin). Filtrul din cod nu da gres.
    if (isNonProductLine(item.name)) { excluded.push({ name: item.name, reason: 'garantie' }); return false }
    // Number(...) accepta si numere, si numere ca text ("2.64"): modelul le
    // intoarce inconsistent, iar daca ceream strict typeof==='number' un raspuns
    // cu preturi ca string ar fi fost filtrat COMPLET (0 produse => vision_failed).
    const priceRaw = Number(item.price_raw)
    const lineTotal = Number(item.line_total)
    const quantity = Number(item.quantity)
    const ok = isReceipt ? lineTotal > 0 : priceRaw > 0 || (lineTotal > 0 && quantity > 0)
    // Randul avea NUME de produs, dar niciun pret/cantitate valid din care sa se
    // calculeze ceva — de obicei text OCR mazgalit, nu un produs inexistent. Fara
    // asta, randul disparea complet, fara nicio urma: nici in lista, nici in
    // avertismentul de excludere (`excluded` prindea doar garantiile).
    if (!ok) excluded.push({ name: item.name, reason: 'neclar' })
    return ok
  }) as Record<string, unknown>[]

  if (isReceipt) {
    d.items = filtered.map(item => {
      const vatNum = Number(item.vat)
      const vat = (vatNum > 0 && vatNum <= 15) ? 11 : 21
      // SGR: ce a citit modelul de pe bon, altfel categoria legala din denumire.
      const sgr = Number(item.sgr) === 0.5 ? 0.5 : classifySgr(String(item.name))
      // Bon fiscal: pretul e mereu cu TVA inclus, iar impartirea la cantitate
      // (buc sau kg cantarite) si scaderea reducerii de card de fidelitate se
      // fac aici, deterministic — modelul doar citeste line_total/quantity/
      // card_discount exact cum apar tiparite, fara sa le combine el insusi.
      const lineTotal = Number(item.line_total) || 0
      const quantity = Number(item.quantity) > 0 ? Number(item.quantity) : 1
      const cardDiscount = Number(item.card_discount) > 0 ? Number(item.card_discount) : 0
      const netTotal = Math.max(lineTotal - cardDiscount, 0)
      const supplierPrice = Math.round((netTotal / quantity / (1 + vat / 100)) * 10000) / 10000
      const rawUnit = typeof item.unit === 'string' ? item.unit.trim().toLowerCase() : ''
      // ca la facturi: UM lipsa sau "L"/"ML" (litrajul din denumire) => bucata
      const unit = !rawUnit || /^(l|lt|litru|litri|ml)$/.test(rawUnit) ? 'buc' : rawUnit
      // verified = randul a putut fi verificat aritmetic; clientul il prefera la
      // deduplicarea intre feliile suprapuse ale aceleiasi poze.
      return { name: item.name, unit, supplier_price: supplierPrice, vat, discount: 0, sgr, verified: lineTotal > 0 }
    })
    // Aceeasi garda ca la factura: o reducere de card citita gresit (>= totalul
    // liniei) poate duce pretul la 0 — il raportam, nu-l lasam ca rand fantoma.
    d.items = (d.items as { name: string; supplier_price: number }[]).filter(it => {
      if (it.supplier_price > 0) return true
      excluded.push({ name: it.name, reason: 'neclar' })
      return false
    })
    d.excluded = excluded
    return d
  }

  // Factura/aviz: prima trecere calculeaza pentru fiecare rand pretul de
  // ambalaj fara TVA, daca UM-ul e o cutie/bax (=> se imparte pe bucata) si
  // raportul propriu bucati/cutie. A doua trecere imparte, imprumutand raportul
  // de la un produs "frate" (acelasi pret de cutie + aceeasi familie de nume)
  // cand randul curent e cutie dar n-are raportul scris in denumire.
  const prep = filtered.map(item => {
    const vatNum = Number(item.vat)
    const vat = (vatNum > 0 && vatNum <= 15) ? 11 : 21
    // SGR in straturi: semnalul de pe document (numele cu SGR / linia de garantie
    // asociata, deja pus pe item.sgr) primeaza; altfel categoria LEGALA din
    // denumire (apa/bauturi 0.1-3L => 0.50; lactate/sirop/peste 3L => 0).
    const sgr = Number(item.sgr) === 0.5 ? 0.5 : classifySgr(String(item.name))
    const itemDiscount = Number(item.discount)
    const discount = (itemDiscount > 0 && itemDiscount <= 100) ? itemDiscount : (globalDiscounts[vat] ?? 0)

    // Supapa de siguranta: pe facturi extrase din PDF cifrele de pe rand pot fi
    // lipite fara spatii ("buc92169.4687183.36") si modelul poate rupe gresit
    // price_raw; pe poze, cantitatile cu separator romanesc de mii ("4.560" =
    // 4560 buc) pot fi citite gresit. Reconcilierea (lib/pricing/scanGuards.ts)
    // alege pretul care satisface cantitate x pret ≈ valoarea randului, tinand
    // cont si de discount si de factorul 1000 al separatorului de mii.
    const quantity = Number(item.quantity) || 0
    const lineTotal = Number(item.line_total) || 0
    const priceRaw = reconcileUnitPrice(Number(item.price_raw) || 0, quantity, lineTotal, discount)
    const priceExVat = item.price_includes_vat === true ? priceRaw / (1 + vat / 100) : priceRaw
    // Randul e "verificat" cand are cantitate + valoare de rand: pretul lui a
    // trecut prin cantitate x pret ≈ valoare. Folosit la filtrul de fantome.
    const verified = quantity > 0 && lineTotal > 0

    // Decizia cutie-vs-bucata se ia DIN COLOANA UM (deterministic in cod), nu
    // dintr-un boolean pe care modelul il ghicea des gresit: doar UM de tip
    // cutie/bax/set se imparte pe bucata. "18 BUC/CUT" in denumire cand UM=Buc
    // e doar info de ambalare, nu un raport de aplicat.
    const umRaw = normalizeName(String(item.unit ?? ''))
    const isBoxUnit = /^(cut|cutie|cutii|bax|bx|baxuri|set|seturi)\b/.test(umRaw)

    const knownPieces = knownRatios.get(normalizeName(String(item.name)))
    const piecesPerBoxRaw = Math.round(Number(item.pieces_per_box))
    const aiPieces = Number.isFinite(piecesPerBoxRaw) && piecesPerBoxRaw > 1 ? piecesPerBoxRaw : 1
    const ownRatio = (knownPieces && knownPieces > 1) ? knownPieces : aiPieces

    // Cheia pentru potrivirea "fratelui": pret de cutie identic (la cent) +
    // aceleasi prime 3 cuvinte din denumire (familie de produs).
    const prefix = normalizeName(String(item.name)).split(' ').slice(0, 3).join(' ')
    const siblingKey = Math.round(priceExVat * 100) + '|' + prefix

    return { name: item.name, unit: item.unit, vat, discount, sgr, priceExVat, isBoxUnit, ownRatio, siblingKey, verified }
  })

  // Randurile-fantoma (zona de sub produs citita ca produs nou, cu nume trunchiat
  // si fara cantitate/valoare) se elimina inainte de orice alta potrivire — vezi
  // phantomRowIndexes (lib/pricing/scanGuards.ts) pentru semnatura ceruta.
  const phantoms = phantomRowIndexes(prep.map(p => ({ name: String(p.name), verified: p.verified })))
  for (const i of phantoms) excluded.push({ name: String(prep[i].name), reason: 'duplicat' })
  const kept = prep.filter((_, i) => !phantoms.has(i))

  const siblingRatios = new Map<string, number>()
  for (const p of kept) {
    if (p.isBoxUnit && p.ownRatio > 1 && !siblingRatios.has(p.siblingKey)) {
      siblingRatios.set(p.siblingKey, p.ownRatio)
    }
  }

  const built = kept.map(p => {
    const ratio = p.isBoxUnit
      ? (p.ownRatio > 1 ? p.ownRatio : (siblingRatios.get(p.siblingKey) ?? 1))
      : 1
    const supplierPrice = Math.round((p.priceExVat / ratio) * 10000) / 10000
    const rawUnit = String(p.unit ?? '').toLowerCase().trim()
    // UM lipsa => "buc". "L"/"ML" ca UM e aproape mereu litrajul din DENUMIRE
    // halucinat de model in coloana de unitate (sticlele se vand la bucata, nu
    // la litru) => tot "buc". Kg ramane kg (produse cantarite reale).
    const unit = p.isBoxUnit || !rawUnit || rawUnit.startsWith('buc') || /^(l|lt|litru|litri|ml)$/.test(rawUnit)
      ? 'buc' : rawUnit
    return { name: p.name, unit, supplier_price: supplierPrice, vat: p.vat, discount: p.discount, sgr: p.sgr, verified: p.verified }
  })

  // Niciun produs de la un furnizor nu costa 0 lei (liniile PROMO/gratuite sunt
  // deja excluse de model conform SYSTEM_PROMPT). Un pret care rotunjeste la 0
  // e semnul unui calcul stricat de un citit gresit undeva in lant — cantitate
  // mazgalita de OCR, sau un raport bucati/cutie mostenit gresit de la un
  // "produs frate" cu nume asemanator. Il scoatem din lista si il RAPORTAM, in
  // loc sa lasam un rand fantoma cu "0.00 lei" pe care userul nu stie sa-l explice.
  d.items = built.filter(it => {
    if (it.supplier_price > 0) return true
    excluded.push({ name: String(it.name), reason: 'neclar' })
    return false
  })
  d.excluded = excluded
  return d
}

// PDF-uri scanate (poza incorporata direct, fara layer de text real) fac ca
// pdf-parse sa intoarca text gol sau aproape gol — in loc sa trimitem asta
// mai departe la modelul de text (esec silentios, JSON gol), randam prima
// pagina ca imagine si o trecem pe calea de vedere, ca la o poza incarcata
// direct. Esueaza natural (return null) daca PDF-ul chiar nu se poate randa,
// caz in care ne intoarcem la comportamentul vechi (trimitem textul, oricat de putin).
async function pdfToImageBase64(buf: Buffer): Promise<string | null> {
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const { createCanvas } = await import('@napi-rs/canvas')
    const data = new Uint8Array(buf)
    const pdf = await pdfjsLib.getDocument({ data }).promise
    const page = await pdf.getPage(1)
    const viewport = page.getViewport({ scale: 2.0 })
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    const ctx = canvas.getContext('2d')
    // @napi-rs/canvas implementeaza un canvas/context compatibil, dar nu identic
    // tipizat cu cel din lib.dom — pdf.js accepta la runtime orice context care
    // se comporta la fel, de-aia castul peste toti parametrii.
    await page.render({ canvasContext: ctx, viewport } as unknown as Parameters<typeof page.render>[0]).promise
    return canvas.toBuffer('image/jpeg', 0.9).toString('base64')
  } catch {
    return null
  }
}

async function runVisionScan(
  userClient: ReturnType<typeof getUserClient>,
  userId: string,
  imageBase64: string,
  mimeType: string,
  countThisScan = true,
) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
        { type: 'text', text: 'Extrage furnizorul si produsele din acest document (factura, aviz sau bon fiscal) conform regulilor.' },
      ],
    },
  ]
  // max_tokens nu a mai fost ajustat aici de cand a fost setat, desi system
  // prompt-ul s-a triplat de atunci (creste cu fiecare regula noua) — pe o
  // factura densa (poza cu multe randuri), prompt+imagine+8192 rezervat
  // poate depasi bugetul de tokeni/minut al modelului de vedere, la fel cum
  // se intampla si la modelul de text daca nu era redus.
  const { raw, model: usedModel } = await callGroqWithFallback(VISION_MODELS, messages, VISION_MAX_TOKENS, VISION_API)
  const parsed = parseJson(raw)
  const result = validateAndSanitize(parsed, await getKnownRatios(typeof parsed?.supplier === 'string' ? parsed.supplier : '', userId))
  const items = result && Array.isArray((result as { items?: unknown[] }).items) ? (result as { items: unknown[] }).items : []
  if (items.length > 0) {
    if (countThisScan) await logScan(userClient, userId)
    return NextResponse.json(result)
  }
  // Zero produse extrase — atasam un fragment din raspunsul BRUT al modelului
  // ca sa putem diagnostica (parsare esuata? raspuns gol? alt format decat JSON?)
  // fara acces la logurile serverului.
  return NextResponse.json({
    items: [],
    error: 'vision_failed',
    debug: `[${usedModel}] ` + ((raw || '').replace(/\s+/g, ' ').trim().slice(0, 300) || '(raspuns gol de la model)'),
  })
}

export async function POST(req: NextRequest) {
  // Auth check
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: { user }, error: authError } = await getSupabaseAdmin().auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // De aici incolo, orice interogare sub RLS foloseste identitatea userului.
  const userClient = getUserClient(token)

  // Rate limiting: max 50 scanari/zi pentru toti userii (contor in DB).
  if (!(await allowScan(userClient, user.id))) {
    return NextResponse.json(
      { error: 'rate_limit', message: `Limita de ${SCANS_PER_DAY} scanari/zi atinsa.` },
      { status: 429 },
    )
  }

  // Limita de marime INAINTE de a citi corpul: `req.json()` pe un body de sute
  // de MB il aduce integral in memoria functiei, deci verificarea de dupa venea
  // prea tarziu ca sa mai apere ceva. Un base64 ~1.33x fata de bytes => 15 MB
  // fisier ≈ 21 MB string; lasam 22 MB marja.
  const MAX_BODY = 22 * 1024 * 1024
  const tooLarge = NextResponse.json(
    { items: [], error: 'file_too_large', message: 'Fisier prea mare (max 15 MB).' },
    { status: 413 },
  )
  const declaredLen = Number(req.headers.get('content-length') || 0)
  if (declaredLen > MAX_BODY) return tooLarge

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ items: [], error: 'invalid_body' }, { status: 400 })
  }

  // Plasa a doua: `content-length` poate lipsi (transfer chunked).
  const b64 = typeof body.imageBase64 === 'string' ? body.imageBase64
    : typeof body.docBase64 === 'string' ? body.docBase64 : ''
  if (b64.length > MAX_BODY) return tooLarge

  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  // Feliile 1..N ale aceleiasi poze nu mai consuma din cota — doar felia 0.
  // Lipsa campului (PDF, XML, apel direct) inseamna document intreg => se conteaza.
  const sliceIndex = Number(body.sliceIndex)
  const countThisScan = !Number.isFinite(sliceIndex) || sliceIndex <= 0
  const imageBase64 = str(body.imageBase64)
  const docBase64 = str(body.docBase64)
  const mimeType = str(body.mimeType)
  const fileName = str(body.fileName)

  try {
    if (imageBase64) {
      return await runVisionScan(userClient, user.id, imageBase64, mimeType || 'image/jpeg', countThisScan)
    }

    let text = ''
    if (docBase64) {
      const buf = Buffer.from(docBase64, 'base64')
      const mime = mimeType
      if (mime.includes('pdf') || fileName.toLowerCase().endsWith('.pdf')) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse: (buf: Buffer) => Promise<{ text: string }> = require('pdf-parse/lib/pdf-parse.js')
        const parsed = await pdfParse(buf)
        text = parsed.text

        // PDF scanat (poza bagata direct in PDF, fara text real) => pdf-parse
        // intoarce aproape nimic. Router automat catre vedere, transparent
        // pentru utilizator — nu mai afiseaza eroare, doar trece pe alta cale.
        if (text.trim().length < 40) {
          const rendered = await pdfToImageBase64(buf)
          if (rendered) return await runVisionScan(userClient, user.id, rendered, 'image/jpeg')
        }

        // PDF-ul oficial ANAF al unei e-Facturi ("RO eFactura"): layout national
        // FIX => citit determinist in cod, fara AI (100% corect, gratuit, instant,
        // nu consuma din cota de scanari). Doar PDF-urile cu layout propriu al
        // furnizorului merg mai departe la modelul AI.
        const anaf = parseEfacturaAnafPdf(text)
        if (anaf) return NextResponse.json(anaf)
      } else {
        text = buf.toString('utf-8')
        // e-Factura XML (UBL): date structurate, citite determinist in cod — fara AI
        // si fara sa trunchiem la 5000 de caractere (o factura densa depasea limita si
        // se pierdeau produse). Calea normala e in client (useInvoiceScan); asta e plasa
        // de siguranta daca ruta e apelata direct cu un XML.
        if (isEfacturaXml(text)) {
          const parsed = parseEfacturaXml(text)
          if (parsed && parsed.items.length > 0) {
            // Determinist = gratuit: nu consuma din cota de scanari (aia apara Groq).
            return NextResponse.json({ supplier: parsed.supplier, items: parsed.items })
          }
          return NextResponse.json({ items: [], error: 'xml_no_products' })
        }
      }
    } else if (str(body.text)) {
      text = str(body.text)
    } else {
      return NextResponse.json({ items: [] }, { status: 400 })
    }

    // 12000 de caractere (~3.5k tokeni): o factura reala de ~25 de produse are
    // 5500-6500 de caractere de text extras — vechea taietura la 5000 pierdea
    // coada facturii (produse lipsa) FARA nicio eroare vizibila. Cu prompt
    // (~1.4k tokeni) + text (~3.5k) + max_tokens rezervat (3000) ramanem
    // confortabil sub bugetul de ~30k tokeni/minut al planului Groq gratuit.
    // Textul din OCR e ALTFEL decat cel extras dintr-un PDF: cifrele sunt des
    // citite gresit (0/O, 1/l/I, 5/S, 6/8), iar coloanele pot fi lipite sau
    // decalate. Promptul de baza presupune text curat, deci pe OCR modelul
    // "crede" cifre imposibile in loc sa le repare din context.
    const isOcr = str(body.source) === 'ocr'

    // CITIRE DETERMINISTA, inaintea modelului. Tabelele de factura au o ancora
    // stabila (cota TVA + UM) si coloane care se verifica intre ele
    // (valoare x cota ≈ TVA_lei). Cand se poate citi asa, NU mai chemam modelul:
    // rezultatul e identic la fiecare rulare, instant si gratuit.
    //
    // Asta rezolva problema de fond de pe text OCR: modelul, pus sa transcrie
    // zeci de randuri de tabel, sarea randuri DIFERITE la fiecare incercare
    // (25 / 31 / 35 de produse pe aceeasi poza). Un model nu e un parser.
    // Layout-urile pe care parserul nu le recunoaste cad in continuare pe model.
    const table = parseInvoiceTableText(text)
    if (table) {
      const asScanned = table.map(r => ({
        name: r.name,
        unit: r.unit,
        price_raw: r.price,
        price_includes_vat: false,   // coloana Valoare de pe factura e fara TVA
        pieces_per_box: piecesPerBox(r.name),
        discount: 0,
        vat: r.vat,
        sgr: 0,
        line_total: r.lineTotal,
        quantity: r.quantity,
      }))
      // Trece prin ACELEASI garduri ca rezultatul modelului: SGR, cutie/bucata,
      // randuri-fantoma, raportarea excluderilor. Nu duplicam nimic.
      const ratios = await getKnownRatios('', user.id)
      const result = validateAndSanitize({ items: asScanned }, ratios)
      const items = result && Array.isArray((result as { items?: unknown[] }).items)
        ? (result as { items: unknown[] }).items : []
      if (items.length > 0) {
        if (countThisScan) await logScan(userClient, user.id)
        return NextResponse.json({ ...(result as object), parser: 'tabel' })
      }
    }
    const OCR_HINT = `

ATENTIE — textul de mai jos vine din OCR pe o POZA, nu dintr-un PDF. Cifrele pot fi citite gresit (0/O, 1/l/I, 5/S, 6/8, 7/1) si coloanele pot fi decalate sau lipite.
- Verificarea cantitate x pret ≈ valoarea randului e OBLIGATORIE. Daca nu se potriveste, incearca sa CORECTEZI o cifra confundata (ex. "l2.50" = 12.50, "S.90" = 5.90) pana se verifica.
- Daca dupa incercari randul tot nu se verifica, pune price_raw=0 si line_total=0 — NU ghici un pret. Un rand marcat asa e semnalat utilizatorului; un pret inventat ii strica marja fara sa stie.
- Preturile de pe o factura reala sunt intre 0,10 si 10.000 lei. Un pret in afara intervalului e aproape sigur o citire gresita.`
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT + (isOcr ? OCR_HINT : '') },
      { role: 'user', content: text.slice(0, 12000) },
    ]
    // max_tokens e rezervat integral din bugetul TPM de Groq inainte sa vada raspunsul real,
    // deci trebuie tinut jos ca sa incapa alaturi de system prompt-ul, care tot creste cu regulile noi.
    // Marja e voit generoasa (nu doar strict cat incape acum) ca sa reziste la urmatoarele reguli adaugate.
    // Preferat sa scadem max_tokens (recuperarea din parseJson salveaza oricum ce apuca sa genereze)
    // decat slice-ul de text de mai sus, ca sa nu taiem input-ul (ex: legenda TVA de la finalul unui bon).
    const { raw } = await callGroqWithFallback(TEXT_MODELS, messages, TEXT_MAX_TOKENS)
    const parsed = parseJson(raw)
    const knownRatios = await getKnownRatios(typeof parsed?.supplier === 'string' ? parsed.supplier : '', user.id)
    const result = validateAndSanitize(parsed, knownRatios)
    if (result) await logScan(userClient, user.id)
    return NextResponse.json(result ?? { items: [] })

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    const [code, detail] = msg.split('::')
    if (code === 'groq_rate_limit') return NextResponse.json({ items: [], error: 'groq_rate_limit', detail }, { status: 503 })
    if (code === 'groq_too_large') return NextResponse.json({ items: [], error: 'groq_too_large', detail }, { status: 413 })
    if (code === 'groq_model_gone') return NextResponse.json({ items: [], error: 'groq_model_gone', detail }, { status: 503 })
    return NextResponse.json({ items: [], error: msg }, { status: 500 })
  }
}
