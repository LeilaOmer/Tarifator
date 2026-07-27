'use client'

// Citirea textului dintr-o POZA, local in browser (Tesseract.js / WASM).
//
// DE CE EXISTA: calea pozelor depindea de un model de VEDERE la un furnizor
// extern. In iulie 2026 acel model a disparut de pe planul gratuit si scanarea
// din poza a murit complet — fara ca aplicatia macar sa spuna de ce. OCR-ul
// local nu are cheie, nu are cota, nu are furnizor si nu poate fi depreciat de
// nimeni: ruleaza pe telefonul utilizatorului.
//
// LOCUL LUI IN FLUX: OCR-ul produce doar TEXT. Extragerea produselor ramane
// exact codul care merge deja pentru PDF-uri (modelul text + validateAndSanitize
// + gardurile deterministe). Nu duplicam nimic — poza devine inca o sursa de
// text, nu o cale separata.
//
// COMPROMIS ASUMAT: pe o poza stramba, mototolita sau prost luminata, OCR-ul e
// vizibil mai slab decat un model de vedere. Verificarile din aval
// (`reconcileUnitPrice`: cantitate x pret ≈ valoare) prind o parte din greseli,
// iar utilizatorul poate corecta manual fiecare rand. "Merge mai slab" e mai
// bun decat "nu merge deloc", dar nu e echivalent — de aceea, cand exista un
// model de vedere configurat pe server, ACELA are prioritate.

export type OcrProgress = (percent: number) => void

// Toate fisierele sunt servite de pe PROPRIA origine: CSP-ul are
// `connect-src 'self'`, deci un CDN ar fi blocat. Vezi public/tesseract/README.txt.
const BASE = '/tesseract'

let workerPromise: Promise<import('tesseract.js').Worker> | null = null

// Workerul se creeaza O SINGURA DATA si se reutilizeaza: initializarea incarca
// ~5 MB de WASM + model de limba, prea scump pentru fiecare felie de poza.
async function getWorker(onProgress?: OcrProgress) {
  if (!workerPromise) {
    const { createWorker } = await import('tesseract.js')
    workerPromise = createWorker('ron', 1, {
      workerPath: `${BASE}/worker.min.js`,
      corePath: `${BASE}/tesseract-core-simd-lstm.wasm.js`,
      langPath: BASE,
      gzip: true,
      logger: m => {
        if (onProgress && m.status === 'recognizing text') onProgress(Math.round(m.progress * 100))
      },
    }).then(async w => {
      // Parametri pentru TABELE de factura, nu pentru proza:
      //  - pageseg 6 = "un bloc uniform de text": citeste rand cu rand, stanga->
      //    dreapta, deci pastreaza "un rand = un produs". Modul automat (3)
      //    incearca sa detecteze coloane si amesteca randurile intre ele.
      //  - dpi 300 = Tesseract isi calibreaza altfel pragurile; fara el trateaza
      //    pozele de telefon ca text la 70 dpi si pierde cifrele mici.
      //  - spatiile intre cuvinte pastrate = coloanele raman separabile in text.
      await w.setParameters({
        tessedit_pageseg_mode: '6' as never,
        user_defined_dpi: '300',
        preserve_interword_spaces: '1',
      })
      return w
    }).catch(err => {
      workerPromise = null // o initializare esuata nu trebuie sa blocheze reincercarile
      throw err
    })
  }
  return workerPromise
}

/** Elibereaza workerul (memoria WASM ramane altfel ocupata pe telefon). */
export async function disposeOcr() {
  if (!workerPromise) return
  try { (await workerPromise).terminate() } catch { /* deja oprit */ }
  workerPromise = null
}

/**
 * Citeste textul dintr-o imagine (File / dataURL / canvas).
 * Intoarce textul brut, asa cum il vede Tesseract — pastrarea randurilor conteaza,
 * pentru ca promptul de extragere se bazeaza pe "un rand = un produs".
 */
export async function imageToText(
  image: File | string | HTMLCanvasElement,
  onProgress?: OcrProgress,
): Promise<string> {
  const worker = await getWorker(onProgress)
  const { data } = await worker.recognize(image)
  return (data.text || '').trim()
}

/**
 * OCR pe mai multe felii, in ORDINE, cu progres cumulat.
 * Feliile vin din aceeasi impartire folosita si pentru modelul de vedere: pe o
 * factura densa, o felie are mai multi pixeli per rand de text, deci se citeste
 * mai bine decat poza intreaga redusa la aceeasi latime.
 */
export async function slicesToText(
  slices: (string | HTMLCanvasElement)[],
  onProgress?: OcrProgress,
): Promise<string> {
  const out: string[] = []
  for (let i = 0; i < slices.length; i++) {
    const src = slices[i]
    const text = await imageToText(typeof src === 'string' ? `data:image/jpeg;base64,${src}` : src, p => {
      // progres pe felie -> progres pe tot documentul
      onProgress?.(Math.round(((i + p / 100) / slices.length) * 100))
    })
    if (text) out.push(text)
  }
  // Feliile se SUPRAPUN intentionat (ca sa nu taie un rand la granita), deci
  // randurile repetate sunt normale aici — deduplicarea produselor se face mai
  // departe, pe produse, nu pe text (`dedupeScannedItems`).
  return out.join('\n')
}


// ————— Pregatirea imaginii PENTRU OCR (nu pentru modelul de vedere) —————
//
// Cele doua au nevoi OPUSE, si e usor de gresit (am gresit):
//   - modelul de VEDERE plateste TOKENI per pixel => imagine MICA, JPEG comprimat;
//   - OCR-ul ruleaza local, nu plateste nimic => imagine MARE, contrast puternic,
//     FARA pierderi de compresie.
// Trimitand OCR-ului feliile facute pentru vedere (1400 px, JPEG 0.82) ii dadeam
// exact intrarea cea mai proasta posibila. Aici o pregatim cum trebuie.

const OCR_TARGET_WIDTH = 2400   // ~300 dpi pe o factura A4 fotografiata
const OCR_MAX_SLICE_H = 2400    // felii, ca sa nu explodeze memoria pe telefon

function loadImageEl(f: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(f)
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = reject
    img.src = url
  })
}

/**
 * Imaginea, pregatita pentru OCR: marita la ~2400 px latime, alb-negru, cu
 * contrast crescut, taiata in felii inalte de cel mult 2400 px.
 * Intoarce CANVAS-uri, nu base64 — Tesseract le citeste direct, deci nu mai
 * exista nicio trecere prin JPEG si nicio pierdere.
 */
export async function prepareImageForOcr(file: File): Promise<HTMLCanvasElement[]> {
  const img = await loadImageEl(file)
  const scale = OCR_TARGET_WIDTH / img.width
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)

  const n = Math.max(1, Math.ceil(h / OCR_MAX_SLICE_H))
  const sliceH = Math.ceil(h / n)
  const overlap = Math.round(sliceH * 0.06) // ca sa nu taiem un rand la granita

  const out: HTMLCanvasElement[] = []
  for (let i = 0; i < n; i++) {
    const dy = Math.max(0, i * sliceH - (i > 0 ? overlap : 0))
    const dh = Math.min(h - dy, sliceH + overlap)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = dh
    const ctx = canvas.getContext('2d')
    if (!ctx) continue
    // Alb-negru + contrast: filtrul de canvas e accelerat hardware, deci mult
    // mai rapid decat o bucla peste pixeli pe un telefon.
    ctx.filter = 'grayscale(1) contrast(1.6) brightness(1.05)'
    ctx.drawImage(img, 0, dy / scale, img.width, dh / scale, 0, 0, w, dh)
    out.push(canvas)
  }
  return out
}
