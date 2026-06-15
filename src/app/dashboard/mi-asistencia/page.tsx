import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import MiAsistenciaClient from './client'

export default async function MiAsistenciaPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  return <MiAsistenciaClient user={session} />
}
