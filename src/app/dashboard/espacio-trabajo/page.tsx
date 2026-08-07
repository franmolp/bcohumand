import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { tipoRecurso } from '@/lib/gaps'
import EspacioTrabajoClient from './client'
import PuestosEmpleadaView from './PuestosEmpleada'

export default async function EspacioTrabajoPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  const isHR = session.rol === 'HR'
  const isEncargada = session.rol === 'Encargada'
  const isCompras = session.rol === 'Compras'
  const isGestion = isAdmin || isHR || isEncargada || isCompras

  if (isGestion) return <EspacioTrabajoClient user={session} isAdminOrEncargada={isAdmin || isEncargada} />

  // Manicura/masajes: vista simplificada para solicitar puestos libres, no el panel de gestión
  if (tipoRecurso(session.equipo)) return <PuestosEmpleadaView />

  redirect('/dashboard')
}
