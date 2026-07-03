'use client'
import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

export default function ActiveCompanyBanner() {
  const [name, setName] = useState<string | null>(null)
  const pathname = usePathname()

useEffect(() => {
  async function check() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setName(null); return }
    if (localStorage.getItem('dashboardMode') !== 'pro') { setName(null); return }
    const { data: prof } = await supabase.from('profiles').select('account_type').eq('id', session.user.id).single()
    if (prof?.account_type !== 'pro') { setName(null); return }
    setName(localStorage.getItem('activeCompanyName') || null)
  }
  check()
}, [pathname])

  const publicPages = ['/', '/termeni', '/confidentialitate', '/upgrade', '/dashboard', '/pricing', '/calcule']
  if (!name || publicPages.includes(pathname)) return null

  return (
    <div className="sticky top-0 w-full z-[9998] bg-blue-600 text-white text-xs text-center py-1.5 font-semibold shrink-0">
      Firma activa: {name}
    </div>
  )
}