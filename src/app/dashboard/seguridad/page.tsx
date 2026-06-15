import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import SeguridadClient from './client'

export default async function SeguridadPage() {
  await requireAdmin().catch(() => redirect('/dashboard'))
  return <SeguridadClient />
}
