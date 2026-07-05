'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Item } from '@/lib/pricing/calc'
import { parseEfacturaXml } from '@/lib/pricing/efactura'
import { dedupeScannedItems } from '@/lib/pricing/scanGuards'

type ScanResult = { supplier: string; items: Item[] }
type ApiItem = { name: string; unit: string; supplier_price: number; discount: number; vat: number; sgr: number; verified?: boolean }
type ApiResult = { supplier?: string; items?: ApiItem[]; error?: string; detail?: string; debug?: string }

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms))

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
  const MAX = 2048
  const w = img.width
  const scale = Math.min(1, MAX / Math.max(w, sh))
  const dw = Math.round(w * scale)
  const dh = Math.round(sh * scale)
  const canvas = document.createElement('canvas')
  canvas.width = dw; canvas.height = dh
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')
  ctx.drawImage(img, 0, sy, w, sh, 0, 0, dw, dh)
  return canvas.toDataURL('image/jpeg', 0.88).split(',')[1]
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
      status === 429 ? 'Ai atins limita de 50 scanari pe zi. Revino maine.' :
      data.error === 'groq_rate_limit' ? `Serverul AI este aglomerat. Asteapta 15 secunde si incearca din nou.${suffix}` :
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
        if (data.items?.length) { onSuccess({ supplier: data.supplier || '', items: mapItems(dedupeScannedItems(data.items)) }); return }
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
      let fatalTooLarge: { status: number; data: ApiResult } | null = null
      for (const s of slices) {
        let r = await callApi({ imageBase64: s, mimeType: 'image/jpeg' }, token)
        let attempts = 0
        while (!r.ok && r.data.error === 'groq_rate_limit' && attempts < 2) {
          const wait = retrySeconds(r.data.detail)
          setError(`Se citeste factura... (astept ${wait}s, limita AI)`)
          await sleep(wait * 1000)
          r = await callApi({ imageBase64: s, mimeType: 'image/jpeg' }, token)
          attempts++
        }
        sliceRes.push(r.data)
        if (!r.ok && r.data.error === 'groq_rate_limit') rateLimited = true
        if (!r.ok && r.data.error === 'groq_too_large' && !fatalTooLarge) fatalTooLarge = { status: r.status, data: r.data }
      }
      setError('')

      const combinedItems = sliceRes.flatMap(r => r.items || [])
      const supplier = sliceRes.find(r => r.supplier)?.supplier || ''

      if (combinedItems.length > 0) {
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
      // Nimic gasit — aratam si un fragment din raspunsul brut al modelului.
      const debug = sliceRes.map(r => r.debug).find(Boolean)
      setError(errorMessage(200, { error: 'vision_failed', debug }))
    } catch {
      setError('Eroare de retea. Verifica conexiunea si incearca din nou.')
    } finally {
      setScanning(false)
    }
  }

  return { scanning, error, handleScan }
}
