import { describe, it, expect } from 'vitest'
import { matchService, normalizeTerm } from './matchService'

// Potrivirea eticheta -> serviciu salvat e acum nucleul COMUN al ambelor rute
// vocale (/api/parse-quote si /api/edit-quote). Inainte, edit-quote cerea
// modelului sa echo-eze UUID-ul serviciului, iar orice id gresit facea linia sa
// dispara tacut din fisa.
const services = [
  { id: 's1', name: 'Teava PPR 20mm' },
  { id: 's2', name: 'Montaj priza' },
  { id: 's3', name: 'Montaj intrerupator' },
  { id: 's4', name: 'Schimbat baterie' },
  { id: 's5', name: 'Manopera ora' },
]

describe('normalizeTerm', () => {
  it('scoate diacriticele', () => expect(normalizeTerm('Țeavă')).toBe('teava'))
  it('scoate cantitatile si unitatile', () => expect(normalizeTerm('3 m de teava')).toBe('teava'))
  it('scoate numerele scrise in litere', () => expect(normalizeTerm('doua prize')).toBe('prize'))
  it('scoate cuvintele de umplutura', () => expect(normalizeTerm('niste teava de la')).toBe('teava'))
  it('intoarce gol pentru intrari fara continut', () => expect(normalizeTerm('3 de la')).toBe(''))
})

describe('matchService — potriveste ce trebuie', () => {
  it.each([
    ['teava', 's1'],
    ['Teava PPR 20mm', 's1'],
    ['țeavă', 's1'],
    ['3 m de teava', 's1'],
    ['montaj priza', 's2'],
    ['schimbat baterie', 's4'],
  ])('%s => %s', (label, id) => expect(matchService(label, services)?.id).toBe(id))
})

describe('matchService — REFUZA sa ghiceasca (mai bine nerecunoscut decat gresit)', () => {
  it('eticheta ambigua nu se leaga de niciun serviciu', () => {
    // "montaj" prinde la fel de bine "Montaj priza" si "Montaj intrerupator"
    expect(matchService('montaj', services)).toBeNull()
  })

  it('eticheta straina nu se leaga fortat', () => {
    expect(matchService('zugravit tavan', services)).toBeNull()
  })

  it('eticheta goala dupa normalizare => null', () => {
    expect(matchService('3 de la', services)).toBeNull()
  })

  it('lista goala de servicii => null, nu exceptie', () => {
    expect(matchService('teava', [])).toBeNull()
  })

  it('potrivirea exacta bate ambiguitatea', () => {
    // exista si "Montaj priza", si "Montaj intrerupator", dar numele e exact
    expect(matchService('Montaj priza', services)?.id).toBe('s2')
  })
})
