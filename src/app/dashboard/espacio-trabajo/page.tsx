import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import EspacioTrabajoClient from './client'

export default async function EspacioTrabajoPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  const isHR = session.rol === 'HR'
  const isEncargada = session.rol === 'Encargada'
  const isCompras = session.rol === 'Compras'
  if (!isAdmin && !isHR && !isEncargada && !isCompras) redirect('/dashboard')
  return <EspacioTrabajoClient user={session} />
}
