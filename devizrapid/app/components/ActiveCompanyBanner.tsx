'use client'
import { supabase } from '@/lib/supabase'
import { ensureAccountLocal } from '@/lib/session'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

export default function ActiveCompanyBanner() {
  const [name, setName] = useState<string | null>(null)
  const pathname = usePathname()

  useEffect(() => {
    let cancelled = false
    async function check() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { if (!cancelled) setName(null); return }

      // Daca s-a schimbat contul pe acest device, curatam starea firmei/modului
      // contului anterior (acelasi helper e apelat si in paginile care citesc firma).
      ensureAccountLocal(session.user.id)

      if (localStorage.getItem('dashboardMode') !== 'pro') { if (!cancelled) setName(null); return }
      const companyId = localStorage.getItem('activeCompanyId')
      if (!companyId) { if (!cancelled) setName(null); return }

      // Verificam ca firma apartine CONTULUI CURENT: RLS restrange `companies` la
      // firmele proprii, deci un id de la alt cont intoarce gol => curatam si ascundem.
      const { data: co } = await supabase.from('companies').select('name').eq('id', companyId).single()
      if (cancelled) return
      if (!co) {
        localStorage.removeItem('activeCompanyId')
        localStorage.removeItem('activeCompanyName')
        setName(null)
        return
      }
      // numele autoritar vine din DB (localStorage putea fi invechit)
      if (co.name !== localStorage.getItem('activeCompanyName')) localStorage.setItem('activeCompanyName', co.name)
      setName(co.name)
    }
    check()
    return () => { cancelled = true }
  }, [pathname])

  const publicPages = ['/', '/termeni', '/confidentialitate', '/upgrade', '/dashboard', '/pricing', '/calcule']
  if (!name || publicPages.includes(pathname)) return null

  return (
    <div className="sticky top-0 w-full z-[9998] bg-blue-600 text-white text-xs text-center py-1.5 font-semibold shrink-0">
      Firma activa: {name}
    </div>
  )
}
