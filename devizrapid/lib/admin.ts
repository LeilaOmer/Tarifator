// Emailul de admin (proprietarul). Se seteaza in variabila de mediu
// NEXT_PUBLIC_ADMIN_EMAIL (o pui in Vercel). E "public" doar ca sa putem
// arata/ascunde linkul de admin in UI — accesul REAL e verificat pe server
// (ruta cere token valid + email == acest email), deci emailul nu e un secret.
export const ADMIN_EMAIL = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || '').trim().toLowerCase()

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!ADMIN_EMAIL && (email || '').trim().toLowerCase() === ADMIN_EMAIL
}
