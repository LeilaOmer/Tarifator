import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deletePrompt, deleteLabel, confirmDelete } from './confirm'

describe('textele de confirmare', () => {
  it('spune CE se sterge si ca nu se poate anula', () => {
    expect(deletePrompt('fisa "Renovare baie"')).toBe(
      'Stergi fisa "Renovare baie"?\n\nActiunea NU se poate anula.',
    )
  })

  it('nota suplimentara intra inaintea avertismentului', () => {
    expect(deletePrompt('firma', 'Fisele asociate raman, dar fara firma.')).toBe(
      'Stergi firma?\n\nFisele asociate raman, dar fara firma. Actiunea NU se poate anula.',
    )
  })

  it('eticheta spune ce face butonul, nu "Inchide"', () => {
    expect(deleteLabel('clientul Popescu SRL')).toBe('Sterge clientul Popescu SRL')
  })

  it('in afara browserului NU confirma — o stergere nu se strecoara la SSR', () => {
    // Rulam in Node, deci `window` lipseste. Daca cineva schimba garda in
    // `return true`, testul pica.
    expect(confirmDelete('fisa')).toBe(false)
  })
})

// Garda la nivel de repo. Testul de mai sus verifica helperul; acesta verifica
// UTILIZAREA lui, adica exact defectul gasit la audit: butoane care STERG dar
// sunt anuntate "Inchide" cititoarelor de ecran, si stergeri fara confirmare.
const root = join(__dirname, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

const PAGINI_CU_STERGERE = [
  'app/quotes/page.tsx',
  'app/companies/[id]/quotes/page.tsx',
  'app/clients/page.tsx',
  'app/services/page.tsx',
  'app/calcule/page.tsx',
  'app/quotes/[id]/page.tsx',
  'app/settings/page.tsx',
]

describe('REGRESIE: butoanele care sterg', () => {
  it.each(PAGINI_CU_STERGERE)('%s cere confirmare inainte de stergere', file => {
    const src = read(file)
    expect(src).toContain('confirmDelete(')
    // `confirm(` nativ, direct: ocolea helperul si scapa de garda de SSR.
    expect(src).not.toMatch(/(?<![.\w])confirm\(['"`]/)
  })

  it('niciun buton de stergere nu se mai numeste "Inchide"', () => {
    for (const file of PAGINI_CU_STERGERE) {
      const src = read(file)
      for (const line of src.split('\n')) {
        if (!line.includes('aria-label="Inchide"')) continue
        // Un "×" care chiar inchide ceva are voie sa se numeasca "Inchide";
        // unul care apeleaza o stergere, nu.
        expect(line, `${file}: ${line.trim()}`).not.toMatch(/handleDelete|deleteCompany|DeleteItem/)
      }
    }
  })
})
