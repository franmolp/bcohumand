import { requireAuth } from '@/lib/auth'
import AdminDashboard from './admin'
import EmpleadoDashboard from './empleado'
import Flores from '@/components/Flores'
import Aniversario from '@/components/Aniversario'

export default async function DashboardPage() {
  const session = await requireAuth()
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  const isHR    = session.rol === 'HR'
  return (
    <>
      <Flores />
      <Aniversario />
      {(isAdmin || isHR) ? <AdminDashboard session={session} /> : <EmpleadoDashboard session={session} />}
    </>
  )
}
