// Curata starea locala legata de cont (firma activa + mod de lucru). Aceste chei
// traiesc in localStorage, deci raman pe acelasi device dupa logout — daca nu le
// stergem, urmatorul cont care se logheaza pe telefonul asta ar vedea firma
// contului anterior. Apelata la logout si la stergerea contului.
export function clearAccountLocal() {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem('activeCompanyId')
  localStorage.removeItem('activeCompanyName')
  localStorage.removeItem('dashboardMode')
}

// De apelat SINCRON imediat dupa aflarea sesiunii, inainte de orice citire din
// localStorage: daca pe acest device s-a schimbat contul, starea veche (firma,
// modul) se curata pe loc — altfel o pagina ar putea apuca sa foloseasca firma
// contului anterior (bannerul curata si el, dar asincron, deci prea tarziu).
export function ensureAccountLocal(userId: string) {
  if (typeof localStorage === 'undefined') return
  if (localStorage.getItem('lastUserId') !== userId) {
    clearAccountLocal()
    localStorage.setItem('lastUserId', userId)
  }
}
