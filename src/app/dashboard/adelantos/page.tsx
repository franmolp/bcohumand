import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AdelantosClient from './client'

export default async function AdelantosPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  return <AdelantosClient user={session} />
}
