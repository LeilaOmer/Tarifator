import jsPDF from 'jspdf'
import { Item, RoundStep, RoundMode, calcItem, fmt2 } from './calc'

const noDiac = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '')

const upper = (s: string) => noDiac(s).toUpperCase()

const fmtDate = () =>
  new Date().toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' })

export type PdfResult = { blob: Blob; filename: string }

// Deschide fisa de partajare nativa (WhatsApp, email, etc.) cu PDF-ul atasat,
// in loc sa deschida un tab de browser din care trebuie ales manual "deschide
// ca PDF" inainte sa poata fi trimis mai departe. Apelata din pagina, dupa ce
// utilizatorul a vazut preview-ul si a apasat efectiv "Trimite".
export async function sharePdfBlob({ blob, filename }: PdfResult): Promise<boolean> {
  if (typeof navigator !== 'undefined' && 'share' in navigator && 'canShare' in navigator) {
    const file = new File([blob], filename, { type: 'application/pdf' })
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] })
        return true
      } catch {
        return false // utilizatorul a anulat partajarea — nu mai deschidem alt tab peste asta
      }
    }
  }
  window.open(URL.createObjectURL(blob), '_blank')
  return true
}

export async function exportPDFContabil(
  items: Item[], adaos: number, step: RoundStep, mode: RoundMode, supplier: string, vatPayer = true
): Promise<PdfResult> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const W = 297; const margin = 10; let y = 15

  doc.setFontSize(13); doc.setFont('helvetica', 'bold')
  doc.text('Calculator Pret Vanzare', margin, y); y += 6
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100)
  doc.text(
    `Data: ${fmtDate()}  |  Furnizor: ${noDiac(supplier || '-')}  |  Adaos: ${adaos}%  |  Rotunjire: ${step === 'none' ? 'fara' : step + ' lei (' + (mode === 'nearest' ? 'corect' : 'in sus') + ')'}${!vatPayer ? '  |  Non-platitor TVA' : ''}`,
    margin, y
  )
  y += 8

  const hasSgr = items.some(i => parseFloat(i.sgr) > 0)

  let cols: { label: string; x: number; w: number }[]
  if (!vatPayer) {
    cols = hasSgr
      ? [
          { label: 'Denumire', x: margin, w: 65 },
          { label: 'UM', x: 77, w: 10 },
          { label: 'Pret furn.', x: 88, w: 22 },
          { label: 'Disc%', x: 111, w: 14 },
          { label: 'Pret net', x: 126, w: 22 },
          { label: `TVA furn.`, x: 149, w: 22 },
          { label: 'Pret intrare', x: 172, w: 26 },
          { label: `Adaos ${adaos}%`, x: 199, w: 26 },
          { label: 'Pret vanzare', x: 226, w: 44 },
          { label: '+SGR', x: 271, w: 16 },
        ]
      : [
          { label: 'Denumire', x: margin, w: 70 },
          { label: 'UM', x: 82, w: 10 },
          { label: 'Pret furn.', x: 93, w: 24 },
          { label: 'Disc%', x: 118, w: 16 },
          { label: 'Pret net', x: 135, w: 24 },
          { label: `TVA furn.`, x: 160, w: 24 },
          { label: 'Pret intrare', x: 185, w: 28 },
          { label: `Adaos ${adaos}%`, x: 214, w: 28 },
          { label: 'Pret vanzare', x: 243, w: 44 },
        ]
  } else {
    cols = hasSgr
      ? [
          { label: 'Denumire', x: margin, w: 62 },
          { label: 'UM', x: 73, w: 10 },
          { label: 'Pret furn.', x: 84, w: 20 },
          { label: 'Disc%', x: 105, w: 12 },
          { label: 'Pret net', x: 118, w: 20 },
          { label: `Adaos ${adaos}%`, x: 139, w: 22 },
          { label: 'F.TVA', x: 162, w: 18 },
          { label: 'Cota', x: 181, w: 12 },
          { label: 'TVA', x: 194, w: 18 },
          { label: 'Vanzare', x: 213, w: 57 },
          { label: '+SGR', x: 270, w: 17 },
        ]
      : [
          { label: 'Denumire', x: margin, w: 70 },
          { label: 'UM', x: 82, w: 12 },
          { label: 'Pret furn.', x: 96, w: 22 },
          { label: 'Disc%', x: 120, w: 14 },
          { label: 'Pret net', x: 136, w: 22 },
          { label: `Adaos ${adaos}%`, x: 160, w: 24 },
          { label: 'F.TVA', x: 186, w: 20 },
          { label: 'Cota', x: 208, w: 14 },
          { label: 'TVA', x: 224, w: 20 },
          { label: 'Pret final', x: 246, w: 24 },
          { label: 'Rotunjit', x: 272, w: 22 },
        ]
  }

  doc.setFillColor(240, 240, 245)
  doc.rect(margin, y - 4, W - 2 * margin, 7, 'F')
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(60, 60, 60)
  cols.forEach(c => doc.text(c.label, c.x, y))
  y += 6

  doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30)
  items.forEach((item, idx) => {
    const c = calcItem(item, adaos, step, mode, vatPayer)
    if (idx % 2 === 0) { doc.setFillColor(252, 252, 252); doc.rect(margin, y - 3.5, W - 2 * margin, 6, 'F') }
    doc.setFontSize(8)
    let vals: string[]
    if (!c.vatPayer) {
      vals = hasSgr
        ? [
            upper(item.name), upper(item.unit), fmt2(c.sp),
            c.disc > 0 ? `${c.disc}%` : '-',
            fmt2(c.netPrice), fmt2(c.inVatAmt), fmt2(c.costWithVat), fmt2(c.adaosAmt),
            fmt2(c.final), c.sgr > 0 ? fmt2(c.sgr) : '-',
          ]
        : [
            upper(item.name), upper(item.unit), fmt2(c.sp),
            c.disc > 0 ? `${c.disc}%` : '-',
            fmt2(c.netPrice), fmt2(c.inVatAmt), fmt2(c.costWithVat), fmt2(c.adaosAmt),
            fmt2(c.final),
          ]
    } else {
      vals = hasSgr
        ? [
            upper(item.name), upper(item.unit), fmt2(c.sp),
            c.disc > 0 ? `${c.disc}%` : '-',
            fmt2(c.netPrice), fmt2(c.sellExVat - c.netPrice),
            fmt2(c.sellExVat), `${item.vat}%`, fmt2(c.vatAmt),
            fmt2(c.final), c.sgr > 0 ? fmt2(c.sgr) : '-',
          ]
        : [
            upper(item.name), upper(item.unit), fmt2(c.sp),
            c.disc > 0 ? `${c.disc}%` : '-',
            fmt2(c.netPrice), fmt2(c.sellExVat - c.netPrice),
            fmt2(c.sellExVat), `${item.vat}%`, fmt2(c.vatAmt), fmt2(c.withVat), fmt2(c.final),
          ]
    }
    cols.forEach((col, i) => doc.text(vals[i], col.x, y))
    y += 6
    if (y > 185) { doc.addPage(); y = 15 }
  })

  doc.setFontSize(7); doc.setTextColor(160, 160, 160)
  doc.text('Generat de Tarifator', W / 2, 200, { align: 'center' })
  return { blob: doc.output('blob'), filename: `Calcul-Contabil-${fmtDate()}.pdf` }
}

export async function exportPDFMagazin(
  items: Item[], adaos: number, step: RoundStep, mode: RoundMode, supplier: string, vatPayer = true
): Promise<PdfResult> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210; const margin = 15; let y = 20

  doc.setFontSize(14); doc.setFont('helvetica', 'bold')
  doc.text('Lista Preturi Vanzare', margin, y); y += 7
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100)
  doc.text(`${fmtDate()}${supplier ? '  |  ' + supplier : ''}`, margin, y); y += 10

  doc.setFillColor(240, 240, 245)
  doc.rect(margin, y - 4, W - 2 * margin, 7, 'F')
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(60, 60, 60)
  doc.text('Denumire produs', margin, y)
  doc.text('UM', 130, y)
  doc.text('Pret vanzare', W - margin, y, { align: 'right' })
  y += 7

  doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30)
  items.forEach((item, idx) => {
    const { final, sgr } = calcItem(item, adaos, step, mode, vatPayer)
    if (idx % 2 === 0) { doc.setFillColor(252, 252, 252); doc.rect(margin, y - 3.5, W - 2 * margin, 6.5, 'F') }
    doc.setFontSize(9)
    doc.text(upper(item.name), margin, y)
    doc.text(upper(item.unit), 130, y)
    doc.setFont('helvetica', 'bold')
    doc.text(fmt2(final) + ' RON', W - margin, y, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    if (sgr > 0) {
      doc.setFontSize(7); doc.setTextColor(45, 106, 79) // Verde Smarald #2D6A4F
      doc.text(`+${fmt2(sgr)} SGR`, W - margin, y + 4, { align: 'right' })
      doc.setFontSize(9); doc.setTextColor(30, 30, 30)
      y += 4
    }
    y += 7
    if (y > 270) { doc.addPage(); y = 20 }
  })

  doc.setFontSize(7); doc.setTextColor(160, 160, 160)
  doc.text('Generat de Tarifator', W / 2, 285, { align: 'center' })
  return { blob: doc.output('blob'), filename: `Lista-Preturi-${fmtDate()}.pdf` }
}
