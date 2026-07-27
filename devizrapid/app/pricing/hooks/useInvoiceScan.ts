'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Item } from '@/lib/pricing/calc'
import { parseEfacturaXml } from '@/lib/pricing/efactura'
import { dedupeScannedItems } from '@/lib/pricing/scanGuards'
import { slicesToText } from '@/lib/pricing/ocr'

type ScanResult = { supplier: string; items: Item[] }
type ApiItem = { name: string; unit: string; supplier_price: number; discount: number; vat: number; sgr: number; verified?: boolean }
// `excluded` = randuri pe care gardurile deterministe le-au scos din lista
// (garantie/ambalaj SGR sau rand-fantoma duplicat). Sunt EURISTICI si pot gresi
// — pe un comerciant de ambalaje sau pe un aviz fara coloana de cantitate pot
// scoate marfa reala. Pana acum greseau in tacere; acum se ARATA.
export type ExcludedRow = { name: string; reason: 'garantie' | 'duplicat' }
type ApiResult = { supplier?: string; items?: ApiItem[]; excluded?: ExcludedRow[]; error?: string; detail?: string; debug?: string }

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms))

// Oglindeste SCANS_PER_DAY din app/api/parse-invoice/route.ts (limita reala e
// impusa pe server; asta e doar pentru textul aratat utilizatorului).
const SCANS_PER_DAY = 50

// Cat sa asteptam inainte de a reincerca o felie respinsa pe limita de rata.
// Groq pune in mesaj "try again in 12.5s" / "in 1m30s" — il parsam si il
// plafonam (5..45s) ca sa nu blocam prea mult, dar suficient sa se elibereze
// fereastra de tokeni-pe-minut.
function retrySeconds(detail?: string): number {
  const m = detail?.match(/in (?:(\d+)m)?([\d.]+)s/)
  if (!m) return 20
  const secs = (m[1] ? parseInt(m[1], 10) * 60 : 0) + Math.ceil(parseFloat(m[2]))
  return Math.min(45, Math.max(5, secs + 1))
}

function readBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(f)
  })
}

function loadImage(f: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(f)
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = reject
    img.src = url
  })
}

function cropAndEncode(img: HTMLImageElement, sy: number, sh: number): string {
  // Latura maxima a unei felii. Fiecare pixel costa TOKENI la modelul de vedere,
  // iar planul gratuit are ~3-6K tokeni/minut in TOTAL (prompt + imagine +
  // max_tokens rezervat). La 2048 px, imaginea singura manca aproape tot
  // bugetul si cererea era respinsa — deci scanarea esua complet, nu doar
  // imprecis. O felie de ~1400 px ramane lizibila (feliile acopera oricum poza
  // pe bucati), dar incape in buget.
  const MAX = 1400
  const w = img.width
  const scale = Math.min(1, MAX / Math.max(w, sh))
  const dw = Math.round(w * scale)
  const dh = Math.round(sh * scale)
  const canvas = document.createElement('canvas')
  canvas.width = dw; canvas.height = dh
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')
  ctx.drawImage(img, 0, sy, w, sh, 0, 0, dw, dh)
  return canvas.toDataURL('image/jpeg', 0.82).split(',')[1]
}


// Impartire in felii orizontale suprapuse pentru a citi facturi dense: o poza
// intreaga cu multe randuri, redusa ca sa incapa in rezolutia modelului, are
// randuri prea mici de citit — feliile sunt fiecare redusa mai putin, deci mai
// multi pixeli per rand. Numarul de felii creste cu inaltimea pozei (mai multe
// randuri => mai multe felii), plafonat la 4 ca sa nu explodeze costul de tokeni.
// Suprapunere intre felii vecine ca sa nu taiem un rand exact la granita.
function splitImageIntoSlices(f: File): Promise<string[]> {
  return loadImage(f).then(img => {
    const H = img.height
    const n = Math.min(4, Math.max(2, Math.round(H / 1400)))
    const base = H / n
    const overlap = base * 0.08
    const slices: string[] = []
    for (let i = 0; i < n; i++) {
      const start = Math.max(0, Math.round(i * base - overlap))
      const end = Math.min(H, Math.round((i + 1) * base + overlap))
      slices.push(cropAndEncode(img, start, end - start))
    }
    return slices
  })
}

function mapItems(apiItems: ApiItem[]): Item[] {
  return apiItems.map(i => ({
    id: crypto.randomUUID(),
    name: i.name || '',
    unit: i.unit || 'buc',
    supplierPrice: i.supplier_price ? String(i.supplier_price) : '',
    discount: i.discount ? String(i.discount) : '0',
    vat: (i.vat === 11 ? 11 : 21) as 11 | 21,
    sgr: i.sgr ? String(i.sgr) : '0',
  }))
}

// Deduplicarea (nume aproape identice intre feliile suprapuse, randul verificat
// castiga la pret diferit) traieste in lib/pricing/scanGuards.ts — logica pura,
// testata izolat, partajata.

export function useInvoiceScan(onSuccess: (result: ScanResult) => void) {
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const [excluded, setExcluded] = useState<ExcludedRow[]>([])

  // Excluderile din toate feliile unei poze, fara duplicate (aceeasi linie poate
  // aparea in doua felii suprapuse).
  function collectExcluded(results: ApiResult[]) {
    const seen = new Set<string>()
    const out: ExcludedRow[] = []
    for (const r of results) {
      for (const e of r.excluded ?? []) {
        const key = e.name.trim().toLowerCase()
        if (key && !seen.has(key)) { seen.add(key); out.push(e) }
      }
    }
    setExcluded(out)
  }

  async function callApi(body: Record<string, string>, token?: string): Promise<{ ok: boolean; status: number; data: ApiResult }> {
    const res = await fetch('/api/parse-invoice', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return { ok: res.ok && !data.error, status: res.status, data }
  }

  function errorMessage(status: number, data: ApiResult): string {
    // Detaliul brut de la Groq e afisat pe ecran (nu doar in logurile serverului,
    // la care nu avem acces direct) ca sa poata fi trimis mai departe pentru diagnostic.
    const suffix = data.detail ? ` [${data.detail}]` : ''
    return status === 401 ? 'Trebuie sa fii autentificat pentru a scana facturi.' :
      status === 429 ? `Ai atins limita de ${SCANS_PER_DAY} scanari pe zi. Revino maine.` :
      data.error === 'groq_rate_limit' ? `Serverul AI este aglomerat. Asteapta 15 secunde si incearca din nou.${suffix}` :
      // Degradare eleganta: cand citirea POZELOR nu e disponibila, restul cailor
      // (PDF, e-Factura) merg in continuare si sunt chiar mai exacte. Trimitem
      // omul acolo, in loc sa-l lasam cu o eroare tehnica si fara solutie.
      data.error === 'groq_model_gone' ? `Citirea din poza nu e disponibila momentan (problema la furnizorul AI, nu la poza ta). Incarca PDF-ul facturii sau XML-ul de e-Factura — acelea merg, si sunt chiar mai exacte.${suffix}` :
      data.error === 'groq_too_large' ? `Factura e prea lunga/complexa pentru a fi citita dintr-o singura cerere. Incearca sa o imparti (scaneaza doar o parte din pagina sau doar o pagina din PDF).${suffix}` :
      data.error === 'vision_failed' ? `Poza neclara sau unghi dificil, chiar si dupa citirea pe felii. Incearca o poza mai apropiata, cu lumina mai buna, sau incarca PDF-ul daca il ai.${data.debug ? ' [model: ' + data.debug + ']' : ''}` :
      `Eroare: ${data.error || 'necunoscuta'}`
  }

  async function handleScan(file: File) {
    // Limita de marime: apara serverul de un fisier urias (memorie/timp) si
    // respinge din start ceva ce oricum nu s-ar putea procesa.
    const MAX_BYTES = 15 * 1024 * 1024
    if (file.size > MAX_BYTES) {
      setError('Fisierul e prea mare (peste 15 MB). Incearca o poza mai mica sau un PDF.')
      return
    }
    setScanning(true)
    setError('')
    setExcluded([])
    try {
      // e-Factura XML = date structurate: le citim determinist in cod (100% corect,
      // gratuit, instant), fara AI si fara sa consumam din cota de scanari. Trebuie
      // interceptat INAINTE de calea AI — altfel XML-ul ajungea trunchiat la 5000 de
      // caractere la modelul de text, care il citea gresit si incomplet.
      const lowerName = file.name.toLowerCase()
      if (file.type.includes('xml') || lowerName.endsWith('.xml')) {
        const text = await file.text()
        const parsed = parseEfacturaXml(text)
        if (parsed && parsed.items.length > 0) {
          onSuccess({ supplier: parsed.supplier, items: mapItems(parsed.items) })
        } else {
          setError('Fisierul XML nu pare o e-Factura valida (nu am gasit produse in el).')
        }
        return
      }

      const isImage = file.type.startsWith('image/')
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!isImage) {
        const body = { docBase64: await readBase64(file), mimeType: file.type || 'application/pdf', fileName: file.name }
        const { ok, status, data } = await callApi(body, token)
        if (!ok) { setError(errorMessage(status, data)); return }
        // dedupe si aici: modelul poate scoate acelasi rand de doua ori
        // dintr-un PDF dens (vazut pe facturi reale), nu doar din felii de poza.
        if (data.items?.length) {
          collectExcluded([data])
          onSuccess({ supplier: data.supplier || '', items: mapItems(dedupeScannedItems(data.items)) })
          return
        }
        setError('Nu s-au gasit produse. Incearca o poza mai clara sau incarca PDF-ul.')
        return
      }

      // Citim poza pe felii orizontale suprapuse (feliile, cu suprapunere, o
      // acopera complet, iar prima felie contine antetul cu furnizorul). Fiecare
      // felie e redusa mai putin => text mai mare, mai multe randuri citite.
      const slices = await splitImageIntoSlices(file)

      // Le trimitem SECVENTIAL (una cate una): modelul de vedere are o limita de
      // tokeni-pe-minut (~30k pe tier-ul gratuit), iar o factura densa in 4 felii
      // depaseste acea limita daca sunt trimise in rafala => feliile de la coada
      // ar fi respinse si jumatate din factura ar lipsi. Daca o felie e respinsa
      // pe limita de rata (nu cota epuizata), o REINCERCAM dupa o pauza, in loc
      // sa abandonam restul facturii.
      const sliceRes: ApiResult[] = []
      let rateLimited = false
      let quotaExhausted = false
      let noVision = false
      let fatalTooLarge: { status: number; data: ApiResult } | null = null
      for (let idx = 0; idx < slices.length; idx++) {
        // sliceIndex: doar felia 0 consuma din cota zilnica — feliile sunt
        // bucati ale ACELEIASI facturi, nu scanari separate.
        const payload = { imageBase64: slices[idx], mimeType: 'image/jpeg', sliceIndex: String(idx) }
        let r = await callApi(payload, token)
        let attempts = 0
        while (!r.ok && r.data.error === 'groq_rate_limit' && attempts < 2) {
          const wait = retrySeconds(r.data.detail)
          setError(`Se citeste factura... (astept ${wait}s, limita AI)`)
          await sleep(wait * 1000)
          r = await callApi(payload, token)
          attempts++
        }
        sliceRes.push(r.data)
        // Cota ZILNICA a contului (429 de la noi, nu de la Groq): nu are rost sa
        // mai trimitem feliile urmatoare, si mai ales nu are voie sa cada in
        // ramura de "poza neclara" — asta ascundea motivul real.
        if (r.status === 429 || r.data.error === 'rate_limit') { quotaExhausted = true; break }
        // Niciun model de VEDERE disponibil pe server. Nu mai trimitem si restul
        // feliilor degeaba — trecem pe OCR local pentru tot documentul.
        if (r.data.error === 'groq_model_gone' || r.data.error === 'no_vision') { noVision = true; break }
        if (!r.ok && r.data.error === 'groq_rate_limit') rateLimited = true
        if (!r.ok && r.data.error === 'groq_too_large' && !fatalTooLarge) fatalTooLarge = { status: r.status, data: r.data }
      }
      setError('')

      if (quotaExhausted) {
        setError(`Ai atins limita de ${SCANS_PER_DAY} scanari pe zi. Revino maine.`)
        return
      }

      // ————— REZERVA: citim poza LOCAL, pe telefon —————
      // Fara model de vedere la furnizor, poza tot poate fi citita: OCR-ul din
      // browser scoate TEXTUL, iar textul intra exact in calea care merge deja
      // pentru PDF-uri. Mai slab decat un model de vedere pe poze strambe, dar
      // nu depinde de nimeni si nu poate fi oprit peste noapte.
      if (noVision) {
        setError('Citesc poza pe telefon (prima data dureaza mai mult)...')
        let text = ''
        try {
          text = await slicesToText(slices, p => setError(`Citesc poza pe telefon... ${p}%`))
        } catch {
          setError('Nu am putut citi poza pe telefon. Incarca PDF-ul facturii sau XML-ul de e-Factura.')
          return
        }
        setError('')
        if (text.trim().length < 40) {
          setError('Nu am gasit text in poza. Incearca o poza mai apropiata si mai bine luminata, sau incarca PDF-ul.')
          return
        }
        const { ok, status, data } = await callApi({ text }, token)
        if (!ok) { setError(errorMessage(status, data)); return }
        if (data.items?.length) {
          collectExcluded([data])
          onSuccess({ supplier: data.supplier || '', items: mapItems(dedupeScannedItems(data.items)) })
          return
        }
        setError('Am citit textul din poza, dar nu am recunoscut produse. Incearca o poza mai clara sau incarca PDF-ul.')
        return
      }

      const combinedItems = sliceRes.flatMap(r => r.items || [])
      const supplier = sliceRes.find(r => r.supplier)?.supplier || ''

      if (combinedItems.length > 0) {
        collectExcluded(sliceRes)
        onSuccess({ supplier, items: mapItems(dedupeScannedItems(combinedItems)) })
        // Rezultat PARTIAL: o felie tot n-a incaput in limita chiar si dupa
        // reincercari. Anuntam clar, ca sa nu para complet cand nu e.
        if (rateLimited) setError('Am citit doar o parte din produse (limita AI atinsa). Mai apasa o data peste ~1 minut ca sa completezi restul.')
        return
      }

      if (fatalTooLarge) { setError(errorMessage(fatalTooLarge.status, fatalTooLarge.data)); return }
      if (rateLimited) {
        // Aratam mesajul brut de la Groq: spune daca e limita pe MINUT ("in 30s"
        // => asteapta putin) sau pe ZI ("in 3h" => cota zilnica epuizata, revii
        // maine sau treci pe Dev tier). Fara el, userul nu stie cat sa astepte.
        const detail = sliceRes.map(r => r.detail).find(Boolean)
        setError(`Limita AI atinsa (plan gratuit Groq).${detail ? ' Groq: ' + detail : ' Asteapta ~1 minut si incearca din nou.'}`)
        return
      }
      // Daca feliile au esuat cu o EROARE reala (model scos din uz, 500 de la
      // server, orice altceva), aratam eroarea aia — nu "poza neclara".
      //
      // Aici era gaura care a costat cel mai mult: ramura implicita dadea vina
      // pe poza pentru ORICE esec neprevazut, iar utilizatorul refotografia la
      // nesfarsit o factura perfect lizibila. "Poza neclara" e o concluzie, si
      // are voie sa apara doar cand chiar stim ca modelul a citit si n-a gasit
      // nimic — nu ca sac in care aruncam tot ce nu intelegem.
      const realErr = sliceRes.find(r => r.error && r.error !== 'vision_failed')
      if (realErr) { setError(errorMessage(503, realErr)); return }

      // Nimic gasit, fara eroare => modelul chiar n-a extras produse.
      const debug = sliceRes.map(r => r.debug).find(Boolean)
      setError(errorMessage(200, { error: 'vision_failed', debug }))
    } catch {
      setError('Eroare de retea. Verifica conexiunea si incearca din nou.')
    } finally {
      setScanning(false)
    }
  }

  return { scanning, error, excluded, handleScan }
}
