// Confirmarea stergerilor IREVERSIBILE, intr-un singur loc.
//
// PROBLEMA (gasita la audit, M6/M7): butoanele "×" din listele de fise, clienti,
// servicii, calcule si linii de fisa stergeau pe loc, la o singura atingere, fara
// intrebare si fara anulare. Pe telefon — unde e folosita aplicatia — "×" e la
// cativa pixeli de pretul randului si de zona de scroll. O atingere gresita
// stergea o fisa finalizata cu tot cu liniile ei, definitiv.
//
// Al doilea defect, in acelasi loc: toate aceste butoane aveau
// `aria-label="Inchide"`. Cine navigheaza cu cititor de ecran auzea "Inchide" si
// apasa ca sa inchida ceva — si stergea. Eticheta acum spune ce face butonul si
// pe CE anume, ca sa se poata distinge intre randuri.

/**
 * Textul intrebarii. Extras separat ca sa fie testabil fara DOM si ca toate
 * confirmarile sa sune la fel.
 *
 * @param what descrierea la acuzativ, cu articol: "fisa DR-202607-003",
 *             "clientul Popescu SRL", "linia Montaj priza".
 */
export function deletePrompt(what: string, note?: string): string {
  return `Stergi ${what}?\n\n` + (note ? note + ' ' : '') + 'Actiunea NU se poate anula.'
}

/** Eticheta pentru cititoarele de ecran, pe butonul de stergere al unui rand. */
export function deleteLabel(what: string): string {
  return `Sterge ${what}`
}

/**
 * Cere confirmarea. Intoarce `false` si in afara browserului (SSR), ca o
 * stergere sa nu se strecoare niciodata neconfirmata.
 */
export function confirmDelete(what: string, note?: string): boolean {
  if (typeof window === 'undefined') return false
  return window.confirm(deletePrompt(what, note))
}
