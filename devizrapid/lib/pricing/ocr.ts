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
  slices: string[],
  onProgress?: OcrProgress,
): Promise<string> {
  const out: string[] = []
  for (let i = 0; i < slices.length; i++) {
    const text = await imageToText(`data:image/jpeg;base64,${slices[i]}`, p => {
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
