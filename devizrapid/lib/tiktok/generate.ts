// Nucleul agentului TikTok pentru Tarifator (DevizRapid).
//
// Un "agent" aici = o functie pura care primeste un context si intoarce un
// rezultat structurat si TIPIZAT. Genereaza continut de clip TikTok ancorat in
// functionalitatile REALE ale produsului (vezi TARIFATOR_CONTEXT, extras din
// docs/PRODUCT.md + docs/VISION.md), nu inventat.
//
// Pentru ACEEASI idee poate produce 3 variante cu tonuri diferite:
// educational, amuzant si controversat (vezi generateTikTokVariants).
//
// Design pentru testabilitate: apelul catre Groq e injectabil (ChatFn), iar
// parsarea/normalizarea sunt functii pure exportate — asa testele ruleaza fara
// retea, fara cheie API si fara cost. Logica sta separata de UI (vezi AGENTS.md).

// ---------------------------------------------------------------------------
// Tipuri (contractul public, tipizat cu TypeScript)
// ---------------------------------------------------------------------------

// Cele trei tonuri cerute. `as const` -> tip literal + lista iterabila la runtime.
export const TIKTOK_TONES = ['educational', 'funny', 'controversial'] as const
export type TikTokTone = (typeof TIKTOK_TONES)[number]

// Etichete pentru UI (in romana).
export const TIKTOK_TONE_LABELS: Record<TikTokTone, string> = {
  educational: 'Educational',
  funny: 'Amuzant',
  controversial: 'Controversat',
}

// Un concept de clip complet, de sine statator (o singura varianta cu idee).
export interface TikTokContent {
  idea: string
  hook: string
  script: string
  description: string
  hashtags: string[]
  videoPrompt: string
}

// O varianta tonala dintr-un set: imparte aceeasi idee cu celelalte, difera tonul.
export interface TikTokVariant {
  tone: TikTokTone
  hook: string
  script: string
  description: string
  hashtags: string[]
  videoPrompt: string
}

// Set de 3 variante pentru ACEEASI idee (cate una pentru fiecare ton).
export interface TikTokVariantSet {
  topic: string | null
  idea: string
  variants: TikTokVariant[]
}

export interface GenerateOptions {
  // Tema optionala data de user (ex: "pentru electricieni", "despre scanare factura").
  // Daca lipseste, agentul alege singur un unghi bazat pe produs.
  topic?: string
}

export interface ChatMessage {
  role: 'system' | 'user'
  content: string
}

// Abstractie peste modelul de chat: primeste mesaje, intoarce textul brut.
// Implicit merge la Groq; in teste se injecteaza o versiune falsa.
export type ChatFn = (messages: ChatMessage[]) => Promise<string>

export interface GenerateDeps {
  chat?: ChatFn
}

// ---------------------------------------------------------------------------
// Contextul REAL despre produs (sursa: docs/PRODUCT.md + docs/VISION.md).
// Fara diacritice (conventia codului). Cand produsul se schimba, se actualizeaza
// AICI, nu doar in prompt.
// ---------------------------------------------------------------------------

const TARIFATOR_CONTEXT = `
TARIFATOR (DevizRapid) — ce este si ce face REAL:

Ce este:
- Aplicatie web (PWA — merge instalata pe telefon) pentru meseriasi si mici
  comercianti din Romania.
- Raspunde instant, corect si profesional la intrebarea "cat costa?".

Pentru cine:
- Prestatori de servicii: electricieni, instalatori, mecanici, coafori, zugravi etc.
- Mici comercianti: magazine, distribuitori, revanzatori.

Cele doua module (functionalitati reale):
1. Fise Servicii — pentru prestatori. Dictezi vocal ce ai lucrat, aplicatia
   recunoaste serviciile, pune cantitatile si preturile TALE, calculeaza totalul
   si genereaza un PDF de trimis clientului pe WhatsApp. Numar fisa: DR-YYYYMM-NNN.
2. Calculator Pret — pentru comercianti. Introduci sau SCANEZI factura de la
   furnizor (poza / PDF / e-Factura), iar aplicatia scoate pretul de vanzare cu
   adaos, TVA si rotunjire. Export PDF (varianta contabil / varianta magazin).

Fluxuri cheie reale:
- Fisa prin dictare: apesi butonul de microfon, vorbesti, vocea e transcrisa,
  serviciile sunt recunoscute, iese o fisa cu numar si PDF.
- Scanare factura: faci poza facturii, aplicatia citeste numerele, iar CODUL face
  aritmetica (TVA, cutie/bucata, discount, garantie SGR) — corect, nu "din burta".
- Calcul pret: cost intrare + adaos +/- TVA + rotunjire = pret de vanzare.

Principii reale (de folosit ca mesaj de incredere):
- Corectitudinea inainte de orice: toata aritmetica se face determinist in cod,
  nu de AI. Un pret gresit distruge increderea.
- Mobil-first, voce-first: instrumentul principal e telefonul, in mana, pe teren.
- Simplu pentru meserias, complet pentru firma.
- Pret accesibil: tinta e omul mic, nu corporatia.

Problema pe care o rezolva (pentru unghiuri/hook-uri):
- Prestatorul da un pret "din burta" sau pierde timp cu calcule pe hartie.
- Comerciantul greseste adaosul sau TVA-ul.
- Clientul nu primeste nimic clar in scris.
- Programele de facturare existente sunt scumpe, greoaie si facute pentru
  contabili, nu pentru omul de pe teren.

Abonamente (pentru context, NU de exagerat in reclama):
- Free: gratis (3 fise + 3 calcule / luna).
- Artizan: 59 lei. Mercator: 129 lei. Pro: 149 lei.

REGULI pentru continut:
- Nu inventa functii care nu exista mai sus (fara "emitere facturi fiscale", fara
  "contabilitate", fara integrari inexistente). Ramai la ce e REAL.
- Publicul e roman, needucat tehnic, ocupat, practic. Ton direct, prietenos, de
  incredere. Fara corporatism.
- Un clip TikTok bun are: hook in primele 2 secunde, o problema concreta, aratarea
  solutiei in aplicatie, si un call-to-action clar.
`.trim()

// Ce inseamna fiecare ton. Sunt DIFERITE — acelasi produs, alta abordare.
const TONE_BRIEFS: Record<TikTokTone, string> = {
  educational:
    'EDUCATIONAL: invata publicul ceva concret si util (cum economiseste timp, ' +
    'cum evita greseli de pret/TVA, cum trimite un document clar clientului). ' +
    'Ton calm, credibil, de expert prietenos. Fara glume, mizeaza pe valoare reala.',
  funny:
    'AMUZANT: umor si exagerare comica, scenete relatable din viata meseriasului ' +
    'sau comerciantului (ex: pretul "din burta" care iese prost). Face publicul sa ' +
    'rada si sa dea share. Fara sa jigneasca pe cineva.',
  controversial:
    'CONTROVERSAT: o opinie transanta care starneste dezbatere in comentarii ' +
    '(ex: "sa dai pret din burta e lipsa de respect fata de client"). Provocator, ' +
    'dar corect si fara dezinformare. Fara atacuri la persoana, fara clickbait mincinos.',
}

// Descrie schema unei variante o singura data (refolosita in prompturi).
const VARIANT_JSON_SHAPE =
  '"hook": "primele 2-3 secunde, replica ce opreste scroll-ul", ' +
  '"script": "scenariul complet pe scene, cu indicatii de imagine si replici, ' +
  'in formatul \\"[Scena 1 - 0-3s] ...\\n[Scena 2 - 3-8s] ...\\n[CTA] ...\\"", ' +
  '"description": "caption scurt si captivant pentru postare, cu emoji si un CTA", ' +
  '"hashtags": ["#lista", "#de", "#hashtaguri"], ' +
  '"videoPrompt": "prompt in ENGLEZA pentru generatoare text-to-video (Veo, Kling, ' +
  'Runway) sau montaj CapCut: descrie scenele vizuale, tipul de plan, atmosfera, ' +
  'textul pe ecran"'

// Reguli comune de stil pentru orice iesire.
const OUTPUT_RULES =
  'Reguli: scenariul si descrierea sunt in ROMANA naturala (diacriticele sunt OK). ' +
  'videoPrompt este in ENGLEZA. 8-15 hashtaguri, fiecare incepand cu #. Totul ' +
  'trebuie sa fie fidel functiilor REALE ale Tarifator. Raspunzi DOAR cu JSON valid, ' +
  'fara text in plus, fara markdown, fara backticks.'

// Prompt pentru o singura varianta cu idee proprie.
export function buildSingleSystemPrompt(): string {
  return (
    'Esti un content strategist pentru TikTok care promoveaza aplicatia Tarifator ' +
    '(DevizRapid). Generezi UN concept de clip complet.\n\n' +
    TARIFATOR_CONTEXT +
    '\n\nStructura EXACTA a raspunsului (JSON):\n{ "idea": "conceptul intr-o fraza ' +
    '(unghiul + cui i se adreseaza)", ' +
    VARIANT_JSON_SHAPE +
    ' }\n\n' +
    OUTPUT_RULES
  )
}

// Prompt pentru 3 variante tonale ale ACELEIASI idei.
export function buildVariantsSystemPrompt(): string {
  return (
    'Esti un content strategist pentru TikTok care promoveaza aplicatia Tarifator ' +
    '(DevizRapid). Pornesti de la O SINGURA idee si o tratezi in 3 tonuri diferite.\n\n' +
    TARIFATOR_CONTEXT +
    '\n\nCele 3 tonuri (aceeasi idee, abordari diferite):\n' +
    `- educational: ${TONE_BRIEFS.educational}\n` +
    `- funny: ${TONE_BRIEFS.funny}\n` +
    `- controversial: ${TONE_BRIEFS.controversial}\n\n` +
    'Structura EXACTA a raspunsului (JSON): { "idea": "ideea comuna, intr-o fraza", ' +
    '"variants": [ { "tone": "educational", ' +
    VARIANT_JSON_SHAPE +
    ' }, { "tone": "funny", ' +
    VARIANT_JSON_SHAPE +
    ' }, { "tone": "controversial", ' +
    VARIANT_JSON_SHAPE +
    ' } ] }\n\nToate cele 3 variante pornesc de la ACEEASI idee, doar tonul difera.\n\n' +
    OUTPUT_RULES
  )
}

export function buildUserMessage(topic: string | null): string {
  return topic
    ? `Tema ceruta: ${topic}`
    : 'Fara tema anume — alege tu cel mai bun unghi pentru un clip nou, bazat pe o ' +
        'functie reala a Tarifator.'
}

// ---------------------------------------------------------------------------
// Parsare + normalizare (functii pure, testabile fara retea)
// ---------------------------------------------------------------------------

function asString(x: unknown): string {
  return typeof x === 'string' ? x.trim() : ''
}

function asStringArray(x: unknown): string[] {
  if (!Array.isArray(x)) return []
  return x.map((s) => String(s).trim()).filter(Boolean)
}

// Extrage obiectul JSON din raspunsul brut al modelului. response_format=json_object
// garanteaza JSON, dar pastram fallback-ul cu regex (ca la celelalte rute AI).
function extractJsonObject(raw: string): Record<string, unknown> {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Modelul nu a intors JSON')
  try {
    const parsed = JSON.parse(match[0])
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
    throw new Error('nu e obiect')
  } catch {
    throw new Error('Modelul nu a intors JSON valid')
  }
}

// Normalizeaza campurile comune de continut (folosit de ambele forme).
function normalizeBody(v: Record<string, unknown>): Omit<TikTokContent, 'idea'> {
  return {
    hook: asString(v.hook),
    script: asString(v.script),
    description: asString(v.description),
    hashtags: asStringArray(v.hashtags),
    videoPrompt: asString(v.videoPrompt),
  }
}

// Parseaza un raspuns cu o singura varianta (cu idee proprie).
export function parseContent(raw: string): TikTokContent {
  const obj = extractJsonObject(raw)
  const idea = asString(obj.idea)
  if (!idea) throw new Error('Raspunsul nu contine o idee')
  return { idea, ...normalizeBody(obj) }
}

// Accepta variantele fie ca lista ([{tone,...}]), fie ca obiect ({educational:{...}}).
// Intoarce o harta ton -> corp brut.
function indexVariants(raw: unknown): Map<TikTokTone, Record<string, unknown>> {
  const map = new Map<TikTokTone, Record<string, unknown>>()
  const isTone = (t: unknown): t is TikTokTone =>
    typeof t === 'string' && (TIKTOK_TONES as readonly string[]).includes(t)

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && typeof item === 'object') {
        const tone = (item as Record<string, unknown>).tone
        if (isTone(tone)) map.set(tone, item as Record<string, unknown>)
      }
    }
  } else if (raw && typeof raw === 'object') {
    for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
      if (isTone(key) && val && typeof val === 'object') {
        map.set(key, val as Record<string, unknown>)
      }
    }
  }
  return map
}

// Parseaza un set de 3 variante. Intoarce variantele mereu in ordinea canonica
// (educational, funny, controversial), indiferent cum le-a ordonat modelul.
// Arunca eroare daca lipseste vreun ton — mai bine esec clar decat set incomplet.
export function parseVariantSet(raw: string, topic: string | null): TikTokVariantSet {
  const obj = extractJsonObject(raw)
  const idea = asString(obj.idea)
  if (!idea) throw new Error('Raspunsul nu contine o idee')

  const indexed = indexVariants(obj.variants)
  const missing = TIKTOK_TONES.filter((t) => !indexed.has(t))
  if (missing.length > 0) {
    throw new Error(`Lipsesc variante: ${missing.join(', ')}`)
  }

  const variants: TikTokVariant[] = TIKTOK_TONES.map((tone) => ({
    tone,
    ...normalizeBody(indexed.get(tone)!),
  }))

  return { topic, idea, variants }
}

// ---------------------------------------------------------------------------
// Apelul real catre Groq (izolat, injectabil)
// ---------------------------------------------------------------------------

const groqChat: ChatFn = async (messages) => {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY lipseste')

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages,
      // Continut creativ -> temperatura mai mare decat la extractie (0.1).
      temperature: 0.85,
      // 3 variante complete incap confortabil aici.
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    }),
  })

  if (!res.ok) throw new Error(`Groq a raspuns cu status ${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content || '{}'
}

// ---------------------------------------------------------------------------
// API public al agentului
// ---------------------------------------------------------------------------

// Genereaza UN concept de clip (o singura varianta, cu idee proprie).
export async function generateTikTokContent(
  opts: GenerateOptions = {},
  deps: GenerateDeps = {},
): Promise<TikTokContent> {
  const chat = deps.chat ?? groqChat
  const topic = opts.topic?.trim() || null
  const raw = await chat([
    { role: 'system', content: buildSingleSystemPrompt() },
    { role: 'user', content: buildUserMessage(topic) },
  ])
  return parseContent(raw)
}

// Genereaza 3 variante (educational, amuzant, controversat) pentru ACEEASI idee.
export async function generateTikTokVariants(
  opts: GenerateOptions = {},
  deps: GenerateDeps = {},
): Promise<TikTokVariantSet> {
  const chat = deps.chat ?? groqChat
  const topic = opts.topic?.trim() || null
  const raw = await chat([
    { role: 'system', content: buildVariantsSystemPrompt() },
    { role: 'user', content: buildUserMessage(topic) },
  ])
  return parseVariantSet(raw, topic)
}
