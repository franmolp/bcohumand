import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import EmpleadosClient from './client'

export default async function EmpleadosPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  const rol = session.rol?.toLowerCase()
  if (rol !== 'admin' && session.rol !== 'HR') redirect('/dashboard')
  return <EmpleadosClient />
}
