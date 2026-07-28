import { describe, it, expect } from 'vitest'
import { piecesPerBox, boxRatioFromName, parseEfacturaXml } from './efactura'

describe('piecesPerBox — bax REAL vs DIMENSIUNE', () => {
  // Configuratii de ambalaj: se imparte pe bucata.
  it.each([
    ['COCA COLA 2.5L x 6 PET', 6],
    ['BERE URSUS 1X24', 24],
    ['SUC 0.33L X 12', 12],
    ['APA MINERALA 500ML x 4', 4],
    ['BERE TIMISOREANA 0,5L X 20 DOZA', 20],
  ])('%s => %i bucati', (name, expected) => expect(piecesPerBox(name)).toBe(expected))

  // REGRESIA CRITICA: denumirile de non-bauturi contin dimensiuni cu acelasi
  // tipar. Inainte de fix, tabla de 250 lei iesea la 0,125 lei/bucata.
  it.each([
    ['TABLA ZINCATA 1000 x 2000', 1],
    ['FOLIE POLIETILENA 100 x 150 CM', 1],
    ['PLACA OSB 1250 x 2500 x 12', 1],
    ['SIPCA LEMN 50 x 30 MM', 1],
    ['GEAM TERMOPAN 120 x 140', 1],
    ['PROFIL RIGIPS 20 x 20 x 1.5', 1],
    ['PLASA SUDATA 2000 x 3000 MM', 1],
  ])('%s => NU se imparte (%i)', (name, expected) => expect(piecesPerBox(name)).toBe(expected))

  // Formele fara spatii erau deja tratate corect — nu le stricam.
  it.each([
    ['CABLU MYF 3x2.5 MMP', 1],
    ['SURUB M8x50', 1],
    ['BURGHIU 5x100', 1],
    ['APA PLATA 2L', 1],
  ])('%s => %i (nemodificat)', (name, expected) => expect(piecesPerBox(name)).toBe(expected))

  // AMBALAJUL SCRIS CU "BUC"/"B", nu cu "x N". Asa scriu furnizorii de dulciuri
  // si tigari — si asa e scrisa regula in BUSINESS_RULES cap. 7 ("24BUC/CUT" =>
  // 24) si in promptul din parse-invoice. Codul nu o implementa: toate cele 12
  // produse la cutie de pe o factura reala ieseau cu raportul 1, deci pretul
  // CUTIEI era vandut ca pret de BUCATA (macaron la 64 lei in loc de ~2,60).
  // Denumirile de mai jos sunt verbatim din OCR-ul unei facturi reale.
  it.each([
    ['MAGURA MACARON 35GR BANOFFEE 24BUC/CUT', 24],
    ['MAGURA 42G CIOCOLATA 24 BUC/CUT', 24],
    ['MAGURA 35G LAPTE 24BUC/CUT', 24],
    ['NAP MILKA ALUNE 30G 30B/CUT', 30],          // 30G inainte de 30B: se ia B-ul
    ['BISC MILKA 40 G/24B CHOCO COW CUTIE', 24],
    ['MILKA CAKE CHOC 35 GR 24 BUC', 24],
    ['KAT KAT TAT CACAO 24B/CUT X 28G', 24],      // "X 28G" e gramajul, nu numarul
    ['NAP SPIRALE LICA 104 GR FRPAD. 18BUC/CUT', 18],
    ['BATON CIOC ROM 30G 36B AUTENTIC', 36],
    ['CIOC MILKA 100G ALUNE INTREGI /17 B', 17],
    ['NAPJOE 1606 CIOCO GL CR CACAO 12 B', 12],
    // Denumire TAIATA de OCR — cazul e scris explicit in promptul rutei.
    ['ALBENI CAKE 30 GR CACAO SI CARAMEL GLZ (18', 18],
  ])('%s => %i bucati/cutie', (name, expected) => expect(boxRatioFromName(name)).toBe(expected))

  // REGRESIA de temut la fixul de mai sus: GRAMAJUL sa nu fie citit ca numar de
  // bucati. Toate denumirile astea sunt de pe aceeasi factura reala.
  it.each([
    ['CIOC MILKA 87G BISC LU', 1],
    ['JUMBO 1.3 KG NAP DOINA', 1],
    ['JUMBO 1 KG NUGA ALUNE STAFIDE', 1],
    ['TADU 450 GR PALEURI CR CACAO', 1],
    ['MAGURA MACARON 35GR CAPPUCCINO', 1],        // fara raport => il ia de la "frate"
    ['CAKE 40 GR OLALA CU SOS DE CIOC NEAGRA', 1],
    ['NAP CU RAHAT 60GR BOGATI ZMEURA PE', 1],
    ['BISC MILKA 150G CHOCO BISCUITS', 1],
    ['SIROP 250 ML BAUTURA', 1],
    ['FAINA 1 KG', 1],
  ])('%s => NU are raport in denumire (%i)', (name, expected) => expect(boxRatioFromName(name)).toBe(expected))
})

// Cele doua notatii NU inseamna acelasi lucru, si de asta sunt doua functii:
//   "x 24"    = CONFIGURATIE DE BAX  -> pretul e pe ambalaj chiar daca UM=buc
//   "36 BUC"  = INFORMATIE DE AMBALARE -> factura vinde la BUCATA (BUSINESS_RULES cap. 7)
// Calea de e-Factura imparte tocmai cand UM=buc (codurile XBX/XCS ajung tot
// "buc"), deci daca `piecesPerBox` ar citi si "36 BUC", orice ciocolata cu
// numarul de bucati in denumire s-ar imparti: 2,23 lei/buc devenea 0,06.
describe('piecesPerBox NU citeste ambalarea — doar configuratia de bax', () => {
  it.each([
    ['CIOCROM CEL DUBLU 50 GR 36 BUC', 1],
    ['NAP JOE 46G XXL GLAZ LAPTE 20 B/SET PE', 1],
    ['MAGURA MACARON 35GR BANOFFEE 24BUC/CUT', 1],
    ['NAP MILKA ALUNE 30G 30B/CUT', 1],
    ['NAPJOE 1606 CIOCO GL CR CACAO 12 B', 1],
    ['ALBENI CAKE 30 GR CACAO SI CARAMEL GLZ (18', 1],
  ])('%s => %i pe calea e-Factura (UM=buc, pret pe bucata)', (name, expected) =>
    expect(piecesPerBox(name)).toBe(expected))

  // ...dar configuratia de bax ramane citita de amandoua.
  it.each([
    ['SUC 0.33L X 12', 12],
    ['BERE URSUS 1X24', 24],
  ])('%s => %i la ambele functii', (name, expected) => {
    expect(piecesPerBox(name)).toBe(expected)
    expect(boxRatioFromName(name)).toBe(expected)
  })
})

// Gardul de pret: chiar daca o dimensiune scapa filtrelor de mai sus, pretul
// rezultat nu poate cadea sub pragul de plauzibilitate.
describe('parseEfacturaXml — pretul nu se prabuseste pe marfa dimensionala', () => {
  const xml = (name: string, price: string, qty = '1') => `<?xml version="1.0"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <cac:AccountingSupplierParty><cac:Party><cac:PartyLegalEntity>
    <cbc:RegistrationName>DEPOZIT MAT SRL</cbc:RegistrationName>
  </cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty>
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity unitCode="H87">${qty}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount>${(parseFloat(price) * parseFloat(qty)).toFixed(2)}</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>${name}</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:Percent>21</cbc:Percent></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount>${price}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`

  it('tabla 1000x2000 la 250 lei ramane 250 lei, nu 0,125', () => {
    const r = parseEfacturaXml(xml('TABLA ZINCATA 1000 x 2000', '250.00'))
    expect(r?.items[0].supplier_price).toBe(250)
  })

  it('geam 120x140 la 480 lei ramane 480 lei', () => {
    const r = parseEfacturaXml(xml('GEAM TERMOPAN 120 x 140', '480.00'))
    expect(r?.items[0].supplier_price).toBe(480)
  })

  it('baxul de bere se imparte in continuare corect', () => {
    const r = parseEfacturaXml(xml('BERE URSUS 0.5L 1X24', '96.00'))
    expect(r?.items[0].supplier_price).toBe(4)   // 96 / 24
  })

  it('marfa la kg NU se imparte pe bucata (cap. 6 BUSINESS_RULES)', () => {
    const kg = xml('CIRESE', '27.03', '4.5').replace('unitCode="H87"', 'unitCode="KGM"')
    const r = parseEfacturaXml(kg)
    expect(r?.items[0].unit).toBe('kg')
    expect(r?.items[0].supplier_price).toBeCloseTo(27.03, 2)
  })
})
