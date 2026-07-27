import { describe, it, expect } from 'vitest'
import { clientIp } from './rateLimit'

const req = (headers: Record<string, string>) =>
  new Request('https://exemplu.ro', { headers })

describe('clientIp — nu mai poate fi falsificat dintr-un header', () => {
  it('REGRESIE: valoarea din STANGA lantului e a clientului, nu se mai foloseste', () => {
    // Atacul: clientul trimite propriul X-Forwarded-For, proxy-ul ii adauga IP-ul
    // real la coada. Luand primul element, fiecare cerere primea o "identitate"
    // noua si plafonul zilnic era complet ocolit.
    expect(clientIp(req({ 'x-forwarded-for': '1.2.3.4, 89.120.5.7' }))).toBe('89.120.5.7')
  })

  it('un singur IP in lant (fara proxy intermediar)', () => {
    expect(clientIp(req({ 'x-forwarded-for': '89.120.5.7' }))).toBe('89.120.5.7')
  })

  it('headerul platformei are prioritate (clientul nu-l poate seta)', () => {
    expect(clientIp(req({
      'x-vercel-forwarded-for': '89.120.5.7',
      'x-forwarded-for': '1.2.3.4',      // falsificat
      'x-real-ip': '5.5.5.5',
    }))).toBe('89.120.5.7')
  })

  it('x-real-ip bate lantul falsificabil', () => {
    expect(clientIp(req({
      'x-real-ip': '89.120.5.7',
      'x-forwarded-for': '1.2.3.4, 9.9.9.9',
    }))).toBe('89.120.5.7')
  })

  it('lant cu mai multe salturi => ultimul, cel mai apropiat de noi', () => {
    expect(clientIp(req({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 89.120.5.7' }))).toBe('89.120.5.7')
  })

  it('spatii si valori goale nu produc chei fantoma', () => {
    expect(clientIp(req({ 'x-forwarded-for': ' , , 89.120.5.7 ,' }))).toBe('89.120.5.7')
    expect(clientIp(req({ 'x-forwarded-for': '  ' }))).toBe('')
  })

  it('fara niciun header => sir gol (allowDailyByIp trece atunci fail-open)', () => {
    expect(clientIp(req({}))).toBe('')
  })
})
