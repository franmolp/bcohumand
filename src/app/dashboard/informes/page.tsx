import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import InformesClient from './client'

const ROLES_ALLOWED = ['Admin', 'admin']

export default async function InformesPage() {
  const session = await requireAuth()
  if (!ROLES_ALLOWED.includes(session.rol)) redirect('/dashboard')
  return <InformesClient user={session} />
}
