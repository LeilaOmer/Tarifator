// Nucleul agentului TikTok pentru Tarifator (DevizRapid).
//
// Un "agent" aici = o functie pura care primeste un context si intoarce un
// rezultat structurat. Genereaza intr-un singur apel Groq: idee, scenariu,
// descriere, hashtaguri si un prompt pentru generatoarele video (Veo, Kling,
// CapCut etc.). Logica sta separata de UI (vezi AGENTS.md): rutele API si UI
// doar cheama aceasta functie.
//
// IMPORTANT: continutul se bazeaza pe functionalitatile REALE ale Tarifator
// (vezi contextul TARIFATOR_CONTEXT de mai jos, extras din docs/PRODUCT.md si
// docs/VISION.md), nu pe presupuneri. Cand produsul se schimba, se actualizeaza
// contextul de mai jos, nu doar promptul.

// Adevarul despre produs, condensat pentru model. Fara diacritice (conventia
// codului din acest proiect). Sursa: docs/PRODUCT.md + docs/VISION.md.
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

const SYSTEM_PROMPT = `Esti un content strategist pentru TikTok care promoveaza aplicatia Tarifator (DevizRapid).
Primesti contextul REAL al produsului si, optional, o tema. Generezi UN concept de clip TikTok complet.

${TARIFATOR_CONTEXT}

Raspunzi DOAR cu JSON valid, fara text in plus, fara markdown, fara backticks.
Structura EXACTA a raspunsului:
{
  "idea": "conceptul clipului intr-o fraza (unghiul + cui i se adreseaza)",
  "hook": "primele 2-3 secunde, replica de deschidere care opreste scroll-ul",
  "script": "scenariul complet, pe scene, cu indicatii de imagine si replici. Foloseste formatul:\\n[Scena 1 - 0-3s] ...\\n[Scena 2 - 3-8s] ...\\n[CTA] ...",
  "description": "descrierea (caption) pentru postare, scurta si captivanta, cu emoji potrivite si un CTA",
  "hashtags": ["#lista", "#de", "#hashtaguri", "relevante pentru Romania si nisa (meseriasi, comercianti, business, aplicatii)"],
  "videoPrompt": "un prompt in ENGLEZA pentru generatoare text-to-video (Veo, Kling, Runway) sau montaj CapCut: descrie scenele vizuale, tipul de plan, atmosfera, textul pe ecran. Optimizat pentru unelte AI video."
}

Reguli:
- Scenariul si descrierea sunt in ROMANA naturala (diacriticele sunt OK in text).
- videoPrompt este in ENGLEZA (uneltele video functioneaza mai bine asa).
- 8-15 hashtaguri, mix de nisa si generale, fiecare incepand cu #.
- Totul trebuie sa fie fidel functiilor REALE ale Tarifator de mai sus.`

export interface TikTokContent {
  idea: string
  hook: string
  script: string
  description: string
  hashtags: string[]
  videoPrompt: string
}

export interface GenerateOptions {
  // Tema optionala data de user (ex: "pentru electricieni", "despre scanare factura").
  // Daca lipseste, agentul alege singur un unghi bazat pe produs.
  topic?: string
}

// Genereaza un concept de clip TikTok complet, ancorat in produsul real.
// Arunca eroare daca lipseste cheia Groq sau daca modelul nu intoarce JSON valid.
export async function generateTikTokContent(opts: GenerateOptions = {}): Promise<TikTokContent> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY lipseste')

  const userMessage = opts.topic?.trim()
    ? `Tema ceruta: ${opts.topic.trim()}`
    : 'Fara tema anume — alege tu cel mai bun unghi pentru un clip nou, bazat pe o functie reala a Tarifator.'

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      // Continut creativ -> temperatura mai mare decat la extractie (0.1).
      temperature: 0.8,
      response_format: { type: 'json_object' },
    }),
  })

  if (!res.ok) {
    throw new Error(`Groq a raspuns cu status ${res.status}`)
  }

  const data = await res.json()
  const raw: string = data.choices?.[0]?.message?.content || '{}'

  let parsed: Partial<TikTokContent>
  try {
    // response_format=json_object garanteaza JSON, dar pastram un fallback cu
    // regex ca la celelalte rute, in caz ca modelul mai adauga text.
    const match = raw.match(/\{[\s\S]*\}/)
    parsed = JSON.parse(match ? match[0] : raw)
  } catch {
    throw new Error('Modelul nu a intors JSON valid')
  }

  return {
    idea: parsed.idea?.trim() || '',
    hook: parsed.hook?.trim() || '',
    script: parsed.script?.trim() || '',
    description: parsed.description?.trim() || '',
    hashtags: Array.isArray(parsed.hashtags)
      ? parsed.hashtags.map((h) => String(h).trim()).filter(Boolean)
      : [],
    videoPrompt: parsed.videoPrompt?.trim() || '',
  }
}
