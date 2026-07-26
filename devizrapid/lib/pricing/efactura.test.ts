import { describe, it, expect } from 'vitest'
import { piecesPerBox, parseEfacturaXml } from './efactura'

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
