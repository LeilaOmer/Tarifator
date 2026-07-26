import { describe, it, expect } from 'vitest'
import { applyEditActions, normalizeOp, type EditAction } from './editActions'

const services = [
  { id: 's1', name: 'Teava PPR 20mm' },
  { id: 's2', name: 'Montaj priza' },
  { id: 's3', name: 'Manopera ora' },
]

type Line = { service_id: string; quantity: number }
const mk = (service_id: string, quantity: number): Line => ({ service_id, quantity })

// Fisa dictata initial: 3 m teava + 2 ore manopera.
const current: Line[] = [mk('s1', 3), mk('s3', 2)]

const apply = (actions: EditAction[], from: Line[] = current) =>
  applyEditActions(from, actions, services, mk)

describe('REGRESIA raportata: "mai adauga doua prize" nu mai sterge restul fisei', () => {
  it('pastreaza lucrarile existente si adauga priza', () => {
    const r = apply([{ op: 'add', label: 'priza', quantity: 2 }])
    expect(r.items).toEqual([mk('s1', 3), mk('s3', 2), mk('s2', 2)])
    expect(r.changed).toBe(true)
  })

  it('chiar daca modelul trimite o singura actiune, restul listei ramane intact', () => {
    // Exact forma care inainte inlocuia toata lista cu o singura linie.
    const r = apply([{ op: 'add', label: 'priza', quantity: 2 }])
    expect(r.items).toHaveLength(3)
    expect(r.items.map(i => i.service_id)).toContain('s1')
    expect(r.items.map(i => i.service_id)).toContain('s3')
  })

  it('o lista de actiuni GOALA nu sterge nimic', () => {
    const r = apply([])
    expect(r.items).toEqual(current)
    expect(r.changed).toBe(false)
  })
})

describe('operatii', () => {
  it('add pe o lucrare existenta CUMULEAZA cantitatea', () => {
    // "mai pune inca 2 metri de teava" cand sunt deja 3 => 5
    expect(apply([{ op: 'add', label: 'teava', quantity: 2 }]).items[0]).toEqual(mk('s1', 5))
  })

  it('set INLOCUIESTE cantitatea', () => {
    // "fa 5 metri de teava" => 5, nu 8
    expect(apply([{ op: 'set', label: 'teava', quantity: 5 }]).items[0]).toEqual(mk('s1', 5))
  })

  it('set pe o lucrare inexistenta o adauga', () => {
    const r = apply([{ op: 'set', label: 'priza', quantity: 4 }])
    expect(r.items).toContainEqual(mk('s2', 4))
  })

  it('remove scoate DOAR lucrarea ceruta', () => {
    const r = apply([{ op: 'remove', label: 'teava' }])
    expect(r.items).toEqual([mk('s3', 2)])
    expect(r.changed).toBe(true)
  })

  it('clear goleste lista (comanda explicita de stergere)', () => {
    const r = apply([{ op: 'clear' }])
    expect(r.items).toEqual([])
    expect(r.changed).toBe(true)
  })

  it('mai multe actiuni intr-o comanda se aplica in ordine', () => {
    const r = apply([
      { op: 'remove', label: 'teava' },
      { op: 'add', label: 'priza', quantity: 3 },
      { op: 'set', label: 'manopera', quantity: 8 },
    ])
    expect(r.items).toEqual([mk('s3', 8), mk('s2', 3)])
  })
})

describe('robustete — raspunsuri gresite ale modelului nu distrug fisa', () => {
  it('eticheta care nu se potriveste NU sterge nimic, doar se raporteaza', () => {
    const r = apply([{ op: 'add', label: 'zugravit tavan', quantity: 1 }])
    expect(r.items).toEqual(current)
    expect(r.unmatched).toEqual(['zugravit tavan'])
    expect(r.changed).toBe(false)
  })

  it('eticheta ambigua nu se leaga fortat de o lucrare', () => {
    const amb = [{ id: 'a', name: 'Montaj priza' }, { id: 'b', name: 'Montaj intrerupator' }]
    const r = applyEditActions([], [{ op: 'add', label: 'montaj', quantity: 1 }], amb, mk)
    expect(r.items).toEqual([])
    expect(r.unmatched).toEqual(['montaj'])
  })

  it('remove pe ceva inexistent nu schimba nimic', () => {
    const r = apply([{ op: 'remove', label: 'priza' }])
    expect(r.items).toEqual(current)
    expect(r.changed).toBe(false)
  })

  it('op necunoscut de la model cade pe "add", nu pe stergere', () => {
    const r = apply([{ op: 'bizar' as never, label: 'priza', quantity: 1 }])
    expect(r.items).toHaveLength(3)
  })

  it('eticheta goala e ignorata, nu sterge lista', () => {
    expect(apply([{ op: 'add', label: '', quantity: 1 }]).items).toEqual(current)
  })

  it('cantitati absurde sunt plafonate', () => {
    expect(apply([{ op: 'set', label: 'teava', quantity: 9e12 }]).items[0].quantity).toBe(100_000)
    expect(apply([{ op: 'set', label: 'teava', quantity: -5 }]).items[0].quantity).toBe(1)
    expect(apply([{ op: 'set', label: 'teava', quantity: NaN }]).items[0].quantity).toBe(1)
  })

  it('lista curenta nu e mutata (fara efecte secundare)', () => {
    const snapshot = JSON.parse(JSON.stringify(current))
    apply([{ op: 'clear' }])
    apply([{ op: 'add', label: 'priza', quantity: 9 }])
    expect(current).toEqual(snapshot)
  })
})

describe('normalizeOp — sinonime si necunoscute', () => {
  it.each([
    ['remove', 'remove'], ['sterge', 'remove'], ['scoate', 'remove'], ['delete', 'remove'],
    ['set', 'set'], ['schimba', 'set'],
    ['clear', 'clear'], ['reset', 'clear'],
    ['add', 'add'], ['adauga', 'add'], ['', 'add'], [undefined, 'add'], [null, 'add'],
  ])('%s => %s', (input, expected) => expect(normalizeOp(input)).toBe(expected))
})
