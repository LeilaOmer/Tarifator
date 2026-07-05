import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseEfacturaXml, isEfacturaXml } from '@/lib/pricing/efactura'

function getSupabaseAdmin() {
  // Cheia anonima — foloseste pentru auth.getUser(token) si invoice_scan_logs.
  // NU schimba la service role aici: auth.getUser(token) valideaza gresit
  // (401 pentru toata lumea) daca clientul e creat cu cheia de service role.
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
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

// Raporturi bucati/cutie corectate manual anterior, DOAR de userul curent
// (created_by = userId), pentru acelasi furnizor. Scoparea per-user, nu global:
// altfel un user putea scrie un raport fals pe un furnizor comun si strica pe
// tacute preturile calculate de toti ceilalti (otravire cross-tenant).
async function getKnownRatios(supplierName: string, userId: string): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  const name = supplierName?.trim()
  if (!name) return map
  const { data } = await getServiceRoleClient()
    .from('product_box_ratios')
    .select('product_name, pieces_per_box')
    .eq('created_by', userId)
    .ilike('supplier_name', name)
  if (data) {
    for (const row of data as { product_name: string; pieces_per_box: number }[]) {
      map.set(normalizeName(row.product_name), row.pieces_per_box)
    }
  }
  return map
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
- Sub-liniile logistice ("Disponibil pe...", "Emporte immediat pe...") nu sunt produse.

FACTURA/AVIZ (doc_type=invoice), per produs:
- price_raw = pretul UNITAR tiparit, copiat exact. price_includes_vat = true daca coloana pretului e "cu TVA"/"TTI", false daca e "net"/"fara TVA"/neutra.
- unit = valoarea EXACTA din coloana UM, verbatim ("Buc","Cut","kg","ST"...). NU o traduce, NU o deduce din denumire. (codul decide dupa ea daca randul e cutie de impartit.)
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

async function callGroq(model: string, messages: unknown[], maxTokens = 4096) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + process.env.GROQ_API_KEY,
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
  if (!res.ok) throw new Error(data.error?.message || `Groq error ${res.status}`)
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

  const filtered = (d.items as unknown[]).filter((i: unknown) => {
    if (!i || typeof i !== 'object') return false
    const item = i as Record<string, unknown>
    if (typeof item.name !== 'string' || item.name.trim() === '') return false
    // Number(...) accepta si numere, si numere ca text ("2.64"): modelul le
    // intoarce inconsistent, iar daca ceream strict typeof==='number' un raspuns
    // cu preturi ca string ar fi fost filtrat COMPLET (0 produse => vision_failed).
    const priceRaw = Number(item.price_raw)
    const lineTotal = Number(item.line_total)
    const quantity = Number(item.quantity)
    if (isReceipt) return lineTotal > 0
    return priceRaw > 0 || (lineTotal > 0 && quantity > 0)
  }) as Record<string, unknown>[]

  if (isReceipt) {
    d.items = filtered.map(item => {
      const vatNum = Number(item.vat)
      const vat = (vatNum > 0 && vatNum <= 15) ? 11 : 21
      const sgr = Number(item.sgr) === 0.5 ? 0.5 : 0
      // Bon fiscal: pretul e mereu cu TVA inclus, iar impartirea la cantitate
      // (buc sau kg cantarite) si scaderea reducerii de card de fidelitate se
      // fac aici, deterministic — modelul doar citeste line_total/quantity/
      // card_discount exact cum apar tiparite, fara sa le combine el insusi.
      const lineTotal = Number(item.line_total) || 0
      const quantity = Number(item.quantity) > 0 ? Number(item.quantity) : 1
      const cardDiscount = Number(item.card_discount) > 0 ? Number(item.card_discount) : 0
      const netTotal = Math.max(lineTotal - cardDiscount, 0)
      const supplierPrice = Math.round((netTotal / quantity / (1 + vat / 100)) * 10000) / 10000
      const unit = typeof item.unit === 'string' && item.unit.trim() ? item.unit : 'buc'
      return { name: item.name, unit, supplier_price: supplierPrice, vat, discount: 0, sgr }
    })
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
    const sgr = Number(item.sgr) === 0.5 ? 0.5 : 0
    const itemDiscount = Number(item.discount)
    const discount = (itemDiscount > 0 && itemDiscount <= 100) ? itemDiscount : (globalDiscounts[vat] ?? 0)

    // Supapa de siguranta: pe facturi extrase din PDF cifrele de pe rand pot fi
    // lipite fara spatii ("buc92169.4687183.36") si modelul poate rupe gresit
    // price_raw. Daca avem quantity + line_total, price corect = line_total/quantity.
    const declaredPriceRaw = Number(item.price_raw)
    const lineTotal = Number(item.line_total) || 0
    const quantity = Number(item.quantity) || 0
    let priceRaw = declaredPriceRaw
    if (lineTotal > 0 && quantity > 0) {
      const derived = lineTotal / quantity
      if (!(declaredPriceRaw > 0) || Math.abs(declaredPriceRaw - derived) > Math.max(derived * 0.03, 0.01)) {
        priceRaw = derived
      }
    }
    const priceExVat = item.price_includes_vat === true ? priceRaw / (1 + vat / 100) : priceRaw

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

    return { name: item.name, unit: item.unit, vat, discount, sgr, priceExVat, isBoxUnit, ownRatio, siblingKey }
  })

  const siblingRatios = new Map<string, number>()
  for (const p of prep) {
    if (p.isBoxUnit && p.ownRatio > 1 && !siblingRatios.has(p.siblingKey)) {
      siblingRatios.set(p.siblingKey, p.ownRatio)
    }
  }

  d.items = prep.map(p => {
    const ratio = p.isBoxUnit
      ? (p.ownRatio > 1 ? p.ownRatio : (siblingRatios.get(p.siblingKey) ?? 1))
      : 1
    const supplierPrice = Math.round((p.priceExVat / ratio) * 10000) / 10000
    const rawUnit = String(p.unit ?? '').toLowerCase().trim()
    const unit = p.isBoxUnit ? 'buc' : (rawUnit.startsWith('buc') || !rawUnit ? 'buc' : rawUnit)
    return { name: p.name, unit, supplier_price: supplierPrice, vat: p.vat, discount: p.discount, sgr: p.sgr }
  })
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
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  imageBase64: string,
  mimeType: string,
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
  const raw = await callGroq('meta-llama/llama-4-scout-17b-16e-instruct', messages, 4000)
  const parsed = parseJson(raw)
  const result = validateAndSanitize(parsed, await getKnownRatios(typeof parsed?.supplier === 'string' ? parsed.supplier : '', userId))
  const items = result && Array.isArray((result as { items?: unknown[] }).items) ? (result as { items: unknown[] }).items : []
  if (items.length > 0) {
    await supabase.from('invoice_scan_logs').insert({ user_id: userId })
    return NextResponse.json(result)
  }
  // Zero produse extrase — atasam un fragment din raspunsul BRUT al modelului
  // ca sa putem diagnostica (parsare esuata? raspuns gol? alt format decat JSON?)
  // fara acces la logurile serverului.
  return NextResponse.json({
    items: [],
    error: 'vision_failed',
    debug: (raw || '').replace(/\s+/g, ' ').trim().slice(0, 300) || '(raspuns gol de la model)',
  })
}

export async function POST(req: NextRequest) {
  // Auth check
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Rate limiting: max 50 scans/zi pentru toti userii (contor simplu in DB)
  const today = new Date().toISOString().slice(0, 10)
  const { count } = await supabase
    .from('invoice_scan_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', today)
  if ((count ?? 0) >= 50) {
    return NextResponse.json({ error: 'rate_limit', message: 'Limita de 50 scanari/zi atinsa.' }, { status: 429 })
  }

  const body = await req.json()

  // Limita de marime pe server (clientul poate fi ocolit): un base64 ~1.33x fata
  // de bytes, deci 15 MB fisier ≈ 21 MB string. Blocheaza fisiere uriase inainte
  // de a atinge pdf-parse / randare / Groq.
  const b64 = typeof body.imageBase64 === 'string' ? body.imageBase64
    : typeof body.docBase64 === 'string' ? body.docBase64 : ''
  if (b64.length > 22 * 1024 * 1024) {
    return NextResponse.json({ items: [], error: 'file_too_large', message: 'Fisier prea mare (max 15 MB).' }, { status: 413 })
  }

  try {
    if (body.imageBase64) {
      return await runVisionScan(supabase, user.id, body.imageBase64, body.mimeType || 'image/jpeg')
    }

    let text = ''
    if (body.docBase64) {
      const buf = Buffer.from(body.docBase64, 'base64')
      const mime: string = body.mimeType || ''
      if (mime.includes('pdf') || (body.fileName as string | undefined)?.toLowerCase().endsWith('.pdf')) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse: (buf: Buffer) => Promise<{ text: string }> = require('pdf-parse/lib/pdf-parse.js')
        const parsed = await pdfParse(buf)
        text = parsed.text

        // PDF scanat (poza bagata direct in PDF, fara text real) => pdf-parse
        // intoarce aproape nimic. Router automat catre vedere, transparent
        // pentru utilizator — nu mai afiseaza eroare, doar trece pe alta cale.
        if (text.trim().length < 40) {
          const imageBase64 = await pdfToImageBase64(buf)
          if (imageBase64) return await runVisionScan(supabase, user.id, imageBase64, 'image/jpeg')
        }
      } else {
        text = buf.toString('utf-8')
        // e-Factura XML (UBL): date structurate, citite determinist in cod — fara AI
        // si fara sa trunchiem la 5000 de caractere (o factura densa depasea limita si
        // se pierdeau produse). Calea normala e in client (useInvoiceScan); asta e plasa
        // de siguranta daca ruta e apelata direct cu un XML.
        if (isEfacturaXml(text)) {
          const parsed = parseEfacturaXml(text)
          if (parsed && parsed.items.length > 0) {
            await supabase.from('invoice_scan_logs').insert({ user_id: user.id })
            return NextResponse.json({ supplier: parsed.supplier, items: parsed.items })
          }
          return NextResponse.json({ items: [], error: 'xml_no_products' })
        }
      }
    } else if (body.text) {
      text = body.text
    } else {
      return NextResponse.json({ items: [] }, { status: 400 })
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text.slice(0, 5000) },
    ]
    // max_tokens e rezervat integral din bugetul TPM de Groq inainte sa vada raspunsul real,
    // deci trebuie tinut jos ca sa incapa alaturi de system prompt-ul, care tot creste cu regulile noi.
    // Marja e voit generoasa (nu doar strict cat incape acum) ca sa reziste la urmatoarele reguli adaugate.
    // Preferat sa scadem max_tokens (recuperarea din parseJson salveaza oricum ce apuca sa genereze)
    // decat slice-ul de text de mai sus, ca sa nu taiem input-ul (ex: legenda TVA de la finalul unui bon).
    const raw = await callGroq('llama-3.3-70b-versatile', messages, 3000)
    const parsed = parseJson(raw)
    const knownRatios = await getKnownRatios(typeof parsed?.supplier === 'string' ? parsed.supplier : '', user.id)
    const result = validateAndSanitize(parsed, knownRatios)
    if (result) await supabase.from('invoice_scan_logs').insert({ user_id: user.id })
    return NextResponse.json(result ?? { items: [] })

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    const [code, detail] = msg.split('::')
    if (code === 'groq_rate_limit') return NextResponse.json({ items: [], error: 'groq_rate_limit', detail }, { status: 503 })
    if (code === 'groq_too_large') return NextResponse.json({ items: [], error: 'groq_too_large', detail }, { status: 413 })
    return NextResponse.json({ items: [], error: msg }, { status: 500 })
  }
}
