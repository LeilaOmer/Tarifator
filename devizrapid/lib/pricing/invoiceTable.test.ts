import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseInvoiceTableText } from './invoiceTable'

// Text OCR REAL, de pe o factura fotografiata cu telefonul (SmartCash HQ).
// Particularitatea care a spart totul: preturile erau BIFATE CU PIXUL, deci
// OCR-ul citea creionul peste cifre ("40.42" => "40473", "7.78" => "77815").
const OCR = readFileSync(join(__dirname, '__fixtures__/ocr-smartcash.txt'), 'utf8')

describe('parseInvoiceTableText — factura reala din OCR', () => {
  const rows = parseInvoiceTableText(OCR)

  it('gaseste randurile de produs', () => {
    expect(rows).not.toBeNull()
    expect(rows!.length).toBe(38)
  })

  it('DETERMINIST: aceeasi intrare da exact acelasi rezultat', () => {
    // Motivul pentru care exista acest parser: modelul dadea 25 / 31 / 35 de
    // produse pe ACEEASI poza, la rulari diferite.
    expect(parseInvoiceTableText(OCR)).toEqual(parseInvoiceTableText(OCR))
  })

  it.each([
    ['NAPJOE 1606 CIOCO GL CR CACAO 12 B', 7.78, 33, 256.74],
    ['NAPJOE 160G CACAO 12 B ORIGINAL', 6.01, 24, 144.24],
    ['NAP SPIRALE LICA 104 GR FRPAD. 18BUC/CUT', 2.64, 36, 95.04],
    // Randul care iesea gresit: pretul citit "40473" peste bifa de pix.
    ['MAGURA MACARON 35GR BANOFFEE 24BUC/CUT', 40.42, 2, 80.84],
    // ...si cel care iesea gresit DIN CAUZA lui (imprumuta raportul de la "frate").
    ['MAGURA MACARON 35GR CAPPUCCINO', 40.42, 2, 80.84],
    ['BISC MILKA 150G CHOCO BISCUITS', 8.24, 28, 230.72],
    ['CAKE 40 GR OLALA CU SOS DE CIOC NEAGRA', 0.73, 48, 35.04],
    ['CIOCROM CEL DUBLU 50 GR 36 BUC', 2.23, 108, 240.84],
  ])('%s => %s lei', (name, price, qty, total) => {
    const r = rows!.find(x => x.name === name)
    expect(r, `randul "${name}" lipseste`).toBeDefined()
    expect(r!.price).toBeCloseTo(price, 2)
    expect(r!.quantity).toBe(qty)
    expect(r!.lineTotal).toBeCloseTo(total, 2)
  })

  it('repara virgula pierduta de OCR folosind coloana de TVA', () => {
    // "80.84" citit "8084"; 16.98 / 0.21 = 80.86 => valoarea corecta e 80.84.
    const r = rows!.find(x => x.name.startsWith('MAGURA MACARON 35GR BANOFFEE'))
    expect(r!.lineTotal).toBeCloseTo(80.84, 2)
  })

  it('citeste corect unitatea de masura (conteaza la cutie/bucata)', () => {
    expect(rows!.find(x => x.name.startsWith('MAGURA MACARON 35GR BAN'))!.unit).toBe('cut')
    expect(rows!.find(x => x.name.startsWith('BATON CIOC ROM 30G'))!.unit).toBe('buc')
  })

  it('curata numarul de rand din denumire, fara sa manance numele real', () => {
    // "AA NAP SPIRALE" => "NAP SPIRALE" (prefix scos), dar "NAP"/"MRS" raman.
    expect(rows!.some(x => x.name.startsWith('NAP SPIRALE'))).toBe(true)
    expect(rows!.some(x => x.name.startsWith('MRS TWIX'))).toBe(true)
    expect(rows!.some(x => x.name.startsWith('MAGURA 35G LAPTE'))).toBe(true)
    expect(rows!.some(x => x.name.startsWith('MRS MARS 51'))).toBe(true)
  })

  it('sare peste randurile ilizibile in loc sa inventeze', () => {
    // "CIOC MILKA 100 GOREO/728B  D110 Rue  5a  a  DAR  aa" nu are ancora valida.
    expect(rows!.some(x => x.name.includes('GOREO'))).toBe(false)
  })

  it('toate preturile sunt plauzibile (0,10 - 10.000 lei)', () => {
    for (const r of rows!) {
      expect(r.price).toBeGreaterThan(0.1)
      expect(r.price).toBeLessThan(10_000)
    }
  })
})

describe('parseInvoiceTableText — cade elegant pe ce nu recunoaste', () => {
  it('text fara tabel => null (apelantul foloseste modelul)', () => {
    expect(parseInvoiceTableText('Buna ziua, va trimit oferta atasata.')).toBeNull()
  })

  it('prea putine randuri => null, ca sa nu concuram modelul pe fragmente', () => {
    expect(parseInvoiceTableText('PRODUS UNIC 21% Buc 2 10.00 20.00 4.20')).toBeNull()
  })

  it('cota TVA veche (19%) se mapeaza la 21', () => {
    const t = ['A PRODUS UNU 19% Buc 2 5.00 10.00 1.90',
               'B PRODUS DOI 19% Buc 4 5.00 20.00 3.80',
               'C PRODUS TREI 19% Buc 1 5.00 5.00 0.95'].join('\n')
    const rows = parseInvoiceTableText(t)
    expect(rows).not.toBeNull()
    expect(rows!.every(r => r.vat === 21)).toBe(true)
  })

  it('cota redusa 11% e recunoscuta', () => {
    const t = ['A PAINE ALBA 11% Buc 10 2.00 20.00 2.20',
               'B LAPTE 1L 11% Buc 5 4.00 20.00 2.20',
               'C OUA 10B 11% Buc 3 10.00 30.00 3.30'].join('\n')
    expect(parseInvoiceTableText(t)!.every(r => r.vat === 11)).toBe(true)
  })

  // BUG REAL: OCR-ul pune adesea o ghilimea TIPOGRAFICA la inceputul randului
  // ("NAP MILKA...). `cleanName` stergea doar ghilimelele DREPTE ("), deci
  // caracterul ramanea lipit de denumire. Efectul nu era cosmetic: cheia regulii
  // "frate" din parse-invoice e "pret + primele 3 cuvinte", asa ca randul
  // mazgalit primea alta cheie decat geamanul lui curat si NU mai imprumuta
  // raportul bucati/cutie. Pe o factura reala, "NAP MILKA CACAO 30G 308/CUT"
  // (OCR peste "30B/CUT") a ramas neimpartit la 61,60 lei — 97 lei/bucata —
  // desi acelasi produs, cu acelasi pret, era pe factura si citit corect.
  it.each([
    ['\u201c', 'ghilimea tipografica stanga'],
    ['\u201d', 'ghilimea tipografica dreapta'],
    ['\u201e', 'ghilimea de jos'],
    ['\u00ab', 'ghilimea unghiulara'],
    ['\u2018', 'apostrof tipografic'],
    ['\u2019', 'apostrof tipografic dreapta'],
    ['\u2022', 'bulina'],
    ['\u00b7', 'punct median'],
  ])('%s (%s) la inceput NU ramane in denumire', prefix => {
    const t = [`${prefix}NAP MILKA CACAO 30G 30B/CUT 21% Cut 3 61.60 184.80 38.81`,
               'B PRODUS DOI 21% Buc 4 5.00 20.00 4.20',
               'C PRODUS TREI 21% Buc 1 5.00 5.00 1.05'].join('\n')
    const rows = parseInvoiceTableText(t)!
    expect(rows[0].name).toBe('NAP MILKA CACAO 30G 30B/CUT')
  })

  it('doua randuri ale aceluiasi produs dau ACEEASI cheie de frate', () => {
    // Cheia din parse-invoice: pret (in bani) + primele 3 cuvinte normalizate.
    // Daca gunoiul de la inceput supravietuieste, cheile difera si raportul nu
    // se mai imprumuta.
    const t = ['\u201cNAP MILKA CACAO 30G 308/CUT 21% Cut 3 61.60 184.80 38.81',
               'NAP MILKA CACAO 30G 30B/CUT 21% Cut 3 61.60 184.80 38.81',
               'C PRODUS TREI 21% Buc 1 5.00 5.00 1.05'].join('\n')
    const rows = parseInvoiceTableText(t)!
    const key = (n: string) => n.toLowerCase().split(/\s+/).slice(0, 3).join(' ')
    expect(key(rows[0].name)).toBe(key(rows[1].name))
  })
})
