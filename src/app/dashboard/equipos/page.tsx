import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import EquiposClient from './client'

export default async function EquiposPage() {
  await requireAdmin().catch(() => redirect('/dashboard'))
  return <EquiposClient />
}
