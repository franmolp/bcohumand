import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import ComprasClient from './client'

const ROLES_ALLOWED = ['Admin', 'admin', 'HR', 'Compras', 'Encargada']

export default async function ComprasPage() {
  const session = await requireAuth()
  if (!ROLES_ALLOWED.includes(session.rol)) redirect('/dashboard')
  return <ComprasClient user={session} />
}
