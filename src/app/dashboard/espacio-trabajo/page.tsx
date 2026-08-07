import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { resolverAccesoPuestos } from '@/lib/puestos'
import EspacioTrabajoClient from './client'
import PuestosEmpleadaView from './PuestosEmpleada'

export default async function EspacioTrabajoPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  const isHR = session.rol === 'HR'
  const isEncargada = session.rol === 'Encargada'
  const isGestion = isAdmin || isHR || isEncargada

  if (isGestion) return <EspacioTrabajoClient user={session} isAdminOrEncargada={isAdmin || isEncargada} />

  // Solo equipos habilitados por el admin: vista simplificada para solicitar puestos libres
  const acceso = await resolverAccesoPuestos(session.equipo)
  if (acceso.ok) return <PuestosEmpleadaView />

  redirect('/dashboard')
}
