import { requireAuth } from '@/lib/auth'
import AdminDashboard from './admin'
import EmpleadoDashboard from './empleado'

export default async function DashboardPage() {
  const session = await requireAuth()
  const isAdmin     = session.rol === 'admin' || session.rol === 'Admin'
  const isHR        = session.rol === 'HR'
  const isEncargada = session.rol === 'encargada' || session.rol === 'Encargada'
  return (isAdmin || isHR || isEncargada) ? <AdminDashboard session={session} /> : <EmpleadoDashboard session={session} />
}
