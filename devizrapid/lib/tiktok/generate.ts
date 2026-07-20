// Nucleul agentului TikTok pentru Tarifator (DevizRapid).
//
// Un "agent" aici = o functie pura care primeste un context si intoarce un
// rezultat structurat si TIPIZAT. Genereaza continut de clip TikTok ancorat in
// functionalitatile REALE ale produsului (vezi TARIFATOR_CONTEXT, extras din
// docs/PRODUCT.md + docs/VISION.md), nu inventat.
//
// Pentru ACEEASI idee produce 3 variante, fiecare condusa de o STRATEGIE DE
// MARKETING diferita (nu doar un stil de scriere): educational, amuzant,
// controversat. Fiecare strategie isi defineste obiectivul, etapa de funnel,
// audienta, parghia psihologica, tipul de CTA si KPI-ul (vezi TIKTOK_STRATEGIES).
//
// Decizie de arhitectura (ADR-025): strategia e logica de business — traieste
// DETERMINIST in cod, nu in AI (la fel ca aritmetica preturilor, ADR-001).
// Modelul primeste strategia ca brief si produce doar continutul care o serveste;
// metadatele strategiei se ataseaza in cod, nu se cer de la model.
//
// Design pentru testabilitate: apelul catre Groq e injectabil (ChatFn), iar
// parsarea/normalizarea sunt functii pure exportate — asa testele ruleaza fara
// retea, fara cheie API si fara cost. Logica sta separata de UI (vezi AGENTS.md).

// ---------------------------------------------------------------------------
// Strategii de marketing (contractul de business, tipizat)
// ---------------------------------------------------------------------------

// Cele 3 strategii. `as const` -> tip literal + lista iterabila la runtime.
export const TIKTOK_STRATEGY_IDS = ['educational', 'funny', 'controversial'] as const
export type TikTokStrategyId = (typeof TIKTOK_STRATEGY_IDS)[number]

// Etapa din palnia de marketing pe care o serveste strategia.
export type FunnelStage = 'awareness' | 'consideration' | 'conversion'

// O strategie de marketing completa: NU doar "cum suna", ci CE urmareste.
export interface MarketingStrategy {
  id: TikTokStrategyId
  label: string // eticheta pentru UI (ro)
  objective: string // ce urmareste clipul
  funnelStage: FunnelStage // unde in palnie actioneaza
  audience: string // cui i se adreseaza in primul rand
  lever: string // parghia psihologica folosita
  ctaType: string // tipul de call-to-action urmarit
  kpi: string // ce inseamna succes (metrica de urmarit)
  styleBrief: string // stilul de scriere — DERIVA din strategie
}

// Sursa unica de adevar pentru strategii. Cand se schimba marketingul, se
// editeaza AICI (si ADR-025), nu in prompt.
export const TIKTOK_STRATEGIES: Record<TikTokStrategyId, MarketingStrategy> = {
  educational: {
    id: 'educational',
    label: 'Educational',
    objective: 'Arata valoarea reala si castiga increderea; pozitioneaza aplicatia ca instrument serios',
    funnelStage: 'consideration',
    audience: 'Meseriasi/comercianti care cauta o solutie dar sunt sceptici',
    lever: 'Autoritate si competenta — demonstrezi ca rezolvi corect problema',
    ctaType: 'Soft: invitatie la incercare gratuita (primele 3 fise/calcule)',
    kpi: 'Salvari (saves) si click pe profil/link — semnal de consideration',
    styleBrief:
      'Scrie calm, clar, demonstrativ. Arata aplicatia rezolvand pas cu pas o ' +
      'problema reala. Fara glume; mizezi pe valoare concreta.',
  },
  funny: {
    id: 'funny',
    label: 'Amuzant',
    objective: 'Reach maxim si shareability; notorietate in varful palniei',
    funnelStage: 'awareness',
    audience: 'Publicul larg de meseriasi/comercianti, inclusiv cei care nu cauta activ',
    lever: 'Relatabilitate si umor — te regasesti, razi si dai share',
    ctaType: 'Share: trimite unui prieten din breasla care se regaseste',
    kpi: 'Share-uri si vizualizari (coeficient de viralitate)',
    styleBrief:
      'Scrie ca o sceneta comica, cu exagerare si punchline. Relatable, sa ' +
      'provoace rasul si share-ul. Fara sa jignesti pe cineva.',
  },
  controversial: {
    id: 'controversial',
    label: 'Controversat',
    objective: 'Engagement in comentarii; declanseaza dezbaterea (semnal puternic pentru algoritm)',
    funnelStage: 'awareness',
    audience: 'Oameni cu opinii despre breasla (prestatori/comercianti cu experienta)',
    lever: 'Provocare si apartenenta la breasla — iei o pozitie, ceilalti reactioneaza',
    ctaType: 'Comment: "tu ce parere ai?" — invita raspunsul in comentarii',
    kpi: 'Comentarii si rata de engagement',
    styleBrief:
      'Ia o pozitie transanta de la prima replica. Invita contra-argumente. ' +
      'Corect, fara dezinformare, fara atac la persoana, fara clickbait mincinos.',
  },
}

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

// O varianta dintr-un set: imparte aceeasi idee cu celelalte, dar e condusa de
// o strategie de marketing diferita (atasata determinist din cod).
export interface TikTokVariant {
  strategy: MarketingStrategy
  hook: string
  script: string
  description: string
  hashtags: string[]
  cta: string
  videoPrompt: string
}

// Set de 3 variante pentru ACEEASI idee, cate una per strategie.
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

// Schema campurilor de continut (fara strategy/idea), refolosita in prompturi.
const BODY_JSON_SHAPE =
  '"hook": "primele 2-3 secunde, replica ce opreste scroll-ul", ' +
  '"script": "scenariul complet pe scene, cu indicatii de imagine si replici, ' +
  'in formatul \\"[Scena 1 - 0-3s] ...\\n[Scena 2 - 3-8s] ...\\n[CTA] ...\\"", ' +
  '"description": "caption scurt si captivant pentru postare, cu emoji", ' +
  '"hashtags": ["#lista", "#de", "#hashtaguri"], ' +
  '"cta": "replica de call-to-action, aliniata la tipul cerut de strategie", ' +
  '"videoPrompt": "prompt in ENGLEZA pentru generatoare text-to-video (Veo, Kling, ' +
  'Runway) sau montaj CapCut: descrie scenele vizuale, tipul de plan, atmosfera, ' +
  'textul pe ecran"'

// Reguli comune de stil pentru orice iesire.
const OUTPUT_RULES =
  'Reguli: scenariul, descrierea si cta sunt in ROMANA naturala (diacriticele sunt ' +
  'OK). videoPrompt este in ENGLEZA. 8-15 hashtaguri, fiecare incepand cu #. Totul ' +
  'trebuie sa fie fidel functiilor REALE ale Tarifator. Raspunzi DOAR cu JSON valid, ' +
  'fara text in plus, fara markdown, fara backticks.'

// Descrie o strategie ca brief pentru model (derivat din TIKTOK_STRATEGIES).
function strategyBrief(s: MarketingStrategy): string {
  return (
    `- ${s.id}: obiectiv = ${s.objective}; etapa = ${s.funnelStage}; ` +
    `audienta = ${s.audience}; parghie = ${s.lever}; CTA = ${s.ctaType}; ` +
    `succes (KPI) = ${s.kpi}. STIL: ${s.styleBrief}`
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

// Prompt pentru 3 variante ale ACELEIASI idei, fiecare condusa de o strategie.
export function buildVariantsSystemPrompt(): string {
  const briefs = TIKTOK_STRATEGY_IDS.map((id) => strategyBrief(TIKTOK_STRATEGIES[id])).join('\n')
  const shapes = TIKTOK_STRATEGY_IDS.map(
    (id) => `{ "strategy": "${id}", ${BODY_JSON_SHAPE} }`,
  ).join(', ')
  return (
    'Esti un content strategist pentru TikTok care promoveaza aplicatia Tarifator ' +
    '(DevizRapid). Pornesti de la O SINGURA idee si o tratezi prin 3 STRATEGII de ' +
    'marketing diferite. Fiecare strategie are alt obiectiv, alta parghie si alt CTA ' +
    '— nu doar alt stil.\n\n' +
    TARIFATOR_CONTEXT +
    '\n\nCele 3 strategii (aceeasi idee, obiective diferite):\n' +
    briefs +
    '\n\nStructura EXACTA a raspunsului (JSON): { "idea": "ideea comuna, intr-o fraza", ' +
    `"variants": [ ${shapes} ] }\n\n` +
    'Toate cele 3 variante pornesc de la ACEEASI idee; difera strategia (obiectiv, ' +
    'parghie, CTA, stil).\n\n' +
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

// Normalizeaza campurile de continut (fara strategie — aceea se ataseaza separat).
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

// Accepta variantele fie ca lista ([{strategy,...}]), fie ca obiect ({educational:{...}}).
// Intoarce o harta id-strategie -> corp brut.
function indexVariants(raw: unknown): Map<TikTokStrategyId, Record<string, unknown>> {
  const map = new Map<TikTokStrategyId, Record<string, unknown>>()
  const isId = (t: unknown): t is TikTokStrategyId =>
    typeof t === 'string' && (TIKTOK_STRATEGY_IDS as readonly string[]).includes(t)

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && typeof item === 'object') {
        const id = (item as Record<string, unknown>).strategy
        if (isId(id)) map.set(id, item as Record<string, unknown>)
      }
    }
  } else if (raw && typeof raw === 'object') {
    for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
      if (isId(key) && val && typeof val === 'object') {
        map.set(key, val as Record<string, unknown>)
      }
    }
  }
  return map
}

// Parseaza un set de 3 variante. Ataseaza metadatele strategiei DETERMINIST din
// cod (nu din model). Variantele ies mereu in ordinea canonica a strategiilor.
// Arunca eroare daca lipseste vreo strategie — mai bine esec clar decat set incomplet.
export function parseVariantSet(raw: string, topic: string | null): TikTokVariantSet {
  const obj = extractJsonObject(raw)
  const idea = asString(obj.idea)
  if (!idea) throw new Error('Raspunsul nu contine o idee')

  const indexed = indexVariants(obj.variants)
  const missing = TIKTOK_STRATEGY_IDS.filter((id) => !indexed.has(id))
  if (missing.length > 0) {
    throw new Error(`Lipsesc strategii: ${missing.join(', ')}`)
  }

  const variants: TikTokVariant[] = TIKTOK_STRATEGY_IDS.map((id) => ({
    strategy: TIKTOK_STRATEGIES[id],
    ...normalizeBody(indexed.get(id)!),
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

// Genereaza 3 variante pentru ACEEASI idee, cate una per strategie de marketing.
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
