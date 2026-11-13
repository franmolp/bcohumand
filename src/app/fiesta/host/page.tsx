import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import HostClient from './client'

export const metadata = { title: 'Fiesta Beauty Co. — Pantalla' }

// Pantalla del proyector: solo admin (logueado en la laptop)
export default async function FiestaHostPage() {
  const s = await getSession()
  if (!s || (s.rol !== 'admin' && s.rol !== 'Admin')) redirect('/login')
  return <HostClient />
}
