import { requireAuth } from '@/lib/auth'
import AdminDashboard from './admin'
import EmpleadoDashboard from './empleado'
import Confetti from '@/components/Confetti'

export default async function DashboardPage() {
  const session = await requireAuth()
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  const isHR    = session.rol === 'HR'
  return (
    <>
      <Confetti />
      {(isAdmin || isHR) ? <AdminDashboard session={session} /> : <EmpleadoDashboard session={session} />}
    </>
  )
}
