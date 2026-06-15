import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AsistenciaClient from './client'

export default async function AsistenciaPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  return <AsistenciaClient user={session} />
}
