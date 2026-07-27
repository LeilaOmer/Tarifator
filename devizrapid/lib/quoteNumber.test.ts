import { describe, it, expect } from 'vitest'
import { shouldRetryNumber, quoteInsertMessage, UNIQUE_VIOLATION, NUMBER_RETRIES } from './quoteNumber'

describe('shouldRetryNumber — cand merita recitit maximul si incercat din nou', () => {
  it('fara eroare => gata, nu se reincearca', () => {
    expect(shouldRetryNumber(null, 0)).toBe(false)
  })

  it('numar deja luat => se reincearca', () => {
    expect(shouldRetryNumber({ code: UNIQUE_VIOLATION }, 0)).toBe(true)
    expect(shouldRetryNumber({ code: UNIQUE_VIOLATION }, NUMBER_RETRIES - 2)).toBe(true)
  })

  it('ultima incercare => se renunta, nu se bucleaza la infinit', () => {
    expect(shouldRetryNumber({ code: UNIQUE_VIOLATION }, NUMBER_RETRIES - 1)).toBe(false)
  })

  it('ORICE alta eroare se intoarce imediat, nu se reincearca', () => {
    // Reincercarea la o eroare de RLS / coloana lipsa / retea ar ascunde cauza
    // reala si ar face trei cereri degeaba.
    expect(shouldRetryNumber({ code: '42501' }, 0)).toBe(false)   // permisiune refuzata
    expect(shouldRetryNumber({ code: '42703' }, 0)).toBe(false)   // coloana inexistenta
    expect(shouldRetryNumber({}, 0)).toBe(false)                   // eroare fara cod
  })
})

describe('quoteInsertMessage — ce citeste omul cand nu se creeaza fisa', () => {
  it('coliziunea de numar nu se mai arata ca "duplicate key"', () => {
    const msg = quoteInsertMessage({
      code: UNIQUE_VIOLATION,
      message: 'duplicate key value violates unique constraint "quotes_unique_number"',
    })
    expect(msg).not.toMatch(/duplicate|constraint|quotes_unique_number/)
    expect(msg).toMatch(/Reincarca pagina/)
  })

  it('alte erori isi pastreaza mesajul — altfel nu mai stim ce s-a intamplat', () => {
    expect(quoteInsertMessage({ code: '42501', message: 'permission denied' })).toBe('permission denied')
  })

  it('fara eroare / fara mesaj => text de rezerva, niciodata "undefined"', () => {
    expect(quoteInsertMessage(null)).toBe('eroare necunoscuta')
    expect(quoteInsertMessage({ code: 'X' })).toBe('eroare necunoscuta')
  })
})
