// Adresa publica a aplicatiei, intr-un SINGUR loc.
//
// PROBLEMA (gasita la audit): era scrisa de mana in sase fisiere — sitemap,
// robots, metadata canonica, Open Graph si in textul Termenilor. La o mutare de
// domeniu se schimba unele si se uitau altele, iar rezultatul nu e o eroare
// vizibila: sitemap-ul trimite motoarele de cautare la adrese moarte, iar
// `canonical` le spune sa indexeze o pagina care nu mai exista. Nimic nu cade,
// doar dispari din cautari.
//
// Se poate suprascrie din mediu (`NEXT_PUBLIC_SITE_URL`) ca mutarea sa fie o
// setare in Vercel, nu un commit.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://devizele-mele.vercel.app')
  .replace(/\/+$/, '')

/** Doar gazda, pentru textele care o citesc (ex. Termenii). */
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, '')
