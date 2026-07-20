// Nucleul agentului TikTok pentru Tarifator (DevizRapid).
//
// Un "agent" aici = o functie pura care primeste un context si intoarce un
// rezultat structurat si TIPIZAT. Genereaza continut de clip TikTok ancorat in
// functionalitatile REALE ale produsului (vezi TARIFATOR_CONTEXT, extras din
// docs/PRODUCT.md + docs/VISION.md), nu inventat.
//
// Pentru ACEEASI idee produce 3 variante. Fiecare varianta e definita de DOUA
// axe ORTOGONALE (nu una singura — vezi ADR-025/ADR-026):
//   - content_type = formatul creativ (CUM arata): educational, funny,
//     controversial, story...
//   - goal = obiectivul de marketing (CE urmareste): awareness, engagement,
//     conversion.
// Ele sunt separate ca sa poti mixa liber (ex. "educational" pentru "awareness"
// SAU pentru "conversion") si ca sa poti invata din date ce combinatie merge.
//
// Decizie de arhitectura: content_type + goal sunt logica de business — traiesc
// DETERMINIST in cod, nu in AI (ca aritmetica preturilor, ADR-001). Modelul
// primeste brieful si produce doar continutul; axele se ataseaza in cod.
//
// Design pentru testabilitate: apelul catre Groq e injectabil (ChatFn), iar
// parsarea/normalizarea sunt functii pure exportate — asa testele ruleaza fara
// retea, fara cheie API si fara cost. Logica sta separata de UI (vezi AGENTS.md).

export const GROQ_MODEL = 'llama-3.3-70b-versatile'

// ---------------------------------------------------------------------------
// Axa 1: content_type (formatul creativ). Extensibila.
// ---------------------------------------------------------------------------

export const CONTENT_TYPE_IDS = ['educational', 'funny', 'controversial', 'story'] as const
export type TikTokContentType = (typeof CONTENT_TYPE_IDS)[number]

export interface ContentTypeDef {
  id: TikTokContentType
  label: string
  styleBrief: string // CUM se scrie
}

export const CONTENT_TYPES: Record<TikTokContentType, ContentTypeDef> = {
  educational: {
    id: 'educational',
    label: 'Educativ',
    styleBrief:
      'Scrie calm, clar, demonstrativ. Arata aplicatia rezolvand pas cu pas o ' +
      'problema reala. Fara glume; mizezi pe valoare concreta si utila.',
  },
  funny: {
    id: 'funny',
    label: 'Amuzant',
    styleBrief:
      'Scrie ca o sceneta comica, cu exagerare si punchline. Relatable, sa ' +
      'provoace rasul si share-ul. Fara sa jignesti pe cineva.',
  },
  controversial: {
    id: 'controversial',
    label: 'Controversat',
    styleBrief:
      'Ia o pozitie transanta de la prima replica. Invita contra-argumente. ' +
      'Corect, fara dezinformare, fara atac la persoana, fara clickbait mincinos.',
  },
  story: {
    id: 'story',
    label: 'Poveste',
    styleBrief:
      'Poveste la persoana I, cu inceput-cuprins-final: un meserias/comerciant ' +
      'real cu o problema, momentul de cotitura si rezultatul. Autentic, emotional.',
  },
}

// ---------------------------------------------------------------------------
// Axa 2: goal (obiectivul de marketing). Determina CTA-ul si KPI-ul.
// ---------------------------------------------------------------------------

export const GOAL_IDS = ['awareness', 'engagement', 'conversion'] as const
export type TikTokGoal = (typeof GOAL_IDS)[number]

export interface GoalDef {
  id: TikTokGoal
  label: string
  intent: string // ce urmareste
  ctaType: string // tipul de call-to-action potrivit obiectivului
  kpi: string // ce inseamna succes (metrica de urmarit)
}

export const GOALS: Record<TikTokGoal, GoalDef> = {
  awareness: {
    id: 'awareness',
    label: 'Notorietate',
    intent: 'Reach maxim, sa fii vazut de cat mai multi — varful palniei',
    ctaType: 'Share: trimite unui prieten din breasla care se regaseste',
    kpi: 'Vizualizari si share-uri (coeficient de viralitate)',
  },
  engagement: {
    id: 'engagement',
    label: 'Interactiune',
    intent: 'Reactii si comentarii — semnal puternic pentru algoritm',
    ctaType: 'Comment: "tu ce parere ai?" — invita raspunsul in comentarii',
    kpi: 'Comentarii si rata de engagement',
  },
  conversion: {
    id: 'conversion',
    label: 'Conversie',
    intent: 'Determina publicul sa incerce/sa se inscrie in aplicatie',
    ctaType: 'Soft: invitatie la incercare gratuita (primele 3 fise/calcule)',
    kpi: 'Click pe link, inscrieri si salvari (saves)',
  },
}

// ---------------------------------------------------------------------------
// Reteta = o pereche (content_type x goal). Cele doua axe fiind ortogonale,
// setul implicit alege 3 combinatii bune de pornire; le poti schimba aici.
// Constrangere MVP: content_type-urile din set sunt UNICE (cheia de potrivire
// cu raspunsul modelului).
// ---------------------------------------------------------------------------

export interface VariantRecipe {
  contentType: TikTokContentType
  goal: TikTokGoal
}

export const DEFAULT_RECIPES: VariantRecipe[] = [
  { contentType: 'educational', goal: 'conversion' },
  { contentType: 'funny', goal: 'awareness' },
  { contentType: 'controversial', goal: 'engagement' },
]

// ---------------------------------------------------------------------------
// Tipuri de continut (rezultatul agentului, tipizat)
// ---------------------------------------------------------------------------

// Un concept de clip complet, de sine statator (o singura varianta cu idee).
export interface TikTokContent {
  idea: string
  hook: string
  script: string
  description: string
  hashtags: string[]
  cta: string
  videoPrompt: string
}

// O varianta dintr-un set: imparte aceeasi idee cu celelalte, dar are propriile
// axe (content_type + goal), atasate DETERMINIST din reteta (cod), nu din model.
export interface TikTokVariant {
  contentType: TikTokContentType
  goal: TikTokGoal
  hook: string
  script: string
  description: string
  hashtags: string[]
  cta: string
  videoPrompt: string
}

// Set de 3 variante pentru ACEEASI idee.
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

// Schema campurilor de continut (fara axe/idea), refolosita in prompturi.
const BODY_JSON_SHAPE =
  '"hook": "primele 2-3 secunde, replica ce opreste scroll-ul", ' +
  '"script": "scenariul complet pe scene, cu indicatii de imagine si replici, ' +
  'in formatul \\"[Scena 1 - 0-3s] ...\\n[Scena 2 - 3-8s] ...\\n[CTA] ...\\"", ' +
  '"description": "caption scurt si captivant pentru postare, cu emoji", ' +
  '"hashtags": ["#lista", "#de", "#hashtaguri"], ' +
  '"cta": "replica de call-to-action, aliniata la tipul cerut de obiectiv", ' +
  '"videoPrompt": "prompt in ENGLEZA pentru generatoare text-to-video (Veo, Kling, ' +
  'Runway) sau montaj CapCut: descrie scenele vizuale, tipul de plan, atmosfera, ' +
  'textul pe ecran"'

// Reguli comune de stil pentru orice iesire.
const OUTPUT_RULES =
  'Reguli: scenariul, descrierea si cta sunt in ROMANA naturala (diacriticele sunt ' +
  'OK). videoPrompt este in ENGLEZA. 8-15 hashtaguri, fiecare incepand cu #. Totul ' +
  'trebuie sa fie fidel functiilor REALE ale Tarifator. Raspunzi DOAR cu JSON valid, ' +
  'fara text in plus, fara markdown, fara backticks.'

// Descrie o reteta ca brief pentru model (derivat din CONTENT_TYPES + GOALS).
function recipeBrief(r: VariantRecipe): string {
  const ct = CONTENT_TYPES[r.contentType]
  const g = GOALS[r.goal]
  return (
    `- content_type "${ct.id}" x goal "${g.id}": ` +
    `STIL: ${ct.styleBrief} ` +
    `OBIECTIV: ${g.intent}. CTA: ${g.ctaType}. Succes (KPI): ${g.kpi}.`
  )
}

// Prompt pentru o singura varianta cu idee proprie.
export function buildSingleSystemPrompt(): string {
  return (
    'Esti un content strategist pentru TikTok care promoveaza aplicatia Tarifator ' +
    '(DevizRapid). Generezi UN concept de clip complet, cu un call-to-action clar.\n\n' +
    TARIFATOR_CONTEXT +
    '\n\nStructura EXACTA a raspunsului (JSON):\n{ "idea": "conceptul intr-o fraza ' +
    '(unghiul + cui i se adreseaza)", ' +
    BODY_JSON_SHAPE +
    ' }\n\n' +
    OUTPUT_RULES
  )
}

// Prompt pentru variante ale ACELEIASI idei, cate una per reteta (content_type x goal).
export function buildVariantsSystemPrompt(recipes: VariantRecipe[] = DEFAULT_RECIPES): string {
  const briefs = recipes.map(recipeBrief).join('\n')
  const shapes = recipes
    .map((r) => `{ "content_type": "${r.contentType}", ${BODY_JSON_SHAPE} }`)
    .join(', ')
  return (
    'Esti un content strategist pentru TikTok care promoveaza aplicatia Tarifator ' +
    '(DevizRapid). Pornesti de la O SINGURA idee si o tratezi in mai multe variante. ' +
    'Fiecare varianta are un content_type (formatul creativ) si un goal (obiectivul), ' +
    'combinate asa:\n\n' +
    TARIFATOR_CONTEXT +
    '\n\nVariantele cerute (aceeasi idee, combinatii diferite):\n' +
    briefs +
    '\n\nStructura EXACTA a raspunsului (JSON): { "idea": "ideea comuna, intr-o fraza", ' +
    `"variants": [ ${shapes} ] }\n\n` +
    'Toate variantele pornesc de la ACEEASI idee; difera content_type-ul si obiectivul.\n\n' +
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

interface ContentBody {
  hook: string
  script: string
  description: string
  hashtags: string[]
  cta: string
  videoPrompt: string
}

function normalizeBody(v: Record<string, unknown>): ContentBody {
  return {
    hook: asString(v.hook),
    script: asString(v.script),
    description: asString(v.description),
    hashtags: asStringArray(v.hashtags),
    cta: asString(v.cta),
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

// Indexeaza variantele modelului dupa content_type (cheia de potrivire cu reteta).
// Accepta si lista ([{content_type,...}]) si obiect ({educational:{...}}).
function indexByContentType(raw: unknown): Map<TikTokContentType, Record<string, unknown>> {
  const map = new Map<TikTokContentType, Record<string, unknown>>()
  const isType = (t: unknown): t is TikTokContentType =>
    typeof t === 'string' && (CONTENT_TYPE_IDS as readonly string[]).includes(t)

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && typeof item === 'object') {
        const ct = (item as Record<string, unknown>).content_type
        if (isType(ct)) map.set(ct, item as Record<string, unknown>)
      }
    }
  } else if (raw && typeof raw === 'object') {
    for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
      if (isType(key) && val && typeof val === 'object') {
        map.set(key, val as Record<string, unknown>)
      }
    }
  }
  return map
}

// Parseaza un set de variante pe baza retetelor. content_type + goal se iau
// DETERMINIST din reteta (nu din model — sunt logica de business). Variantele ies
// in ordinea retetelor. Arunca eroare daca lipseste vreo reteta din raspuns.
export function parseVariantSet(
  raw: string,
  topic: string | null,
  recipes: VariantRecipe[] = DEFAULT_RECIPES,
): TikTokVariantSet {
  const obj = extractJsonObject(raw)
  const idea = asString(obj.idea)
  if (!idea) throw new Error('Raspunsul nu contine o idee')

  const indexed = indexByContentType(obj.variants)
  const missing = recipes.filter((r) => !indexed.has(r.contentType))
  if (missing.length > 0) {
    throw new Error(`Lipsesc variante: ${missing.map((r) => r.contentType).join(', ')}`)
  }

  const variants: TikTokVariant[] = recipes.map((r) => ({
    contentType: r.contentType,
    goal: r.goal,
    ...normalizeBody(indexed.get(r.contentType)!),
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
      model: GROQ_MODEL,
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

// Genereaza mai multe variante pentru ACEEASI idee, cate una per reteta
// (content_type x goal). Implicit foloseste DEFAULT_RECIPES (3 variante).
export async function generateTikTokVariants(
  opts: GenerateOptions = {},
  deps: GenerateDeps = {},
  recipes: VariantRecipe[] = DEFAULT_RECIPES,
): Promise<TikTokVariantSet> {
  const chat = deps.chat ?? groqChat
  const topic = opts.topic?.trim() || null
  const raw = await chat([
    { role: 'system', content: buildVariantsSystemPrompt(recipes) },
    { role: 'user', content: buildUserMessage(topic) },
  ])
  return parseVariantSet(raw, topic, recipes)
}
