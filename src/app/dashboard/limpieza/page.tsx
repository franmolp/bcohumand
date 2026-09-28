import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { esEquipoLimpieza } from '@/lib/limpieza'
import LimpiezaClient from './client'

export default async function LimpiezaPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  const esLimpieza = esEquipoLimpieza(session.equipo)
  if (!isAdmin && !esLimpieza) redirect('/dashboard')

  return <LimpiezaClient isAdmin={isAdmin} />
}
