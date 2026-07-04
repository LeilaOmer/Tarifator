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
