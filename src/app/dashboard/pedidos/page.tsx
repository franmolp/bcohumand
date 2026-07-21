import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import PedidosClient from './client'

export default async function PedidosPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) redirect('/dashboard')

  return <PedidosClient session={session} />
}
