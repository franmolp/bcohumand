import { requireAuth } from '@/lib/auth'
import PerfilClient from './client'

export default async function PerfilPage() {
  const session = await requireAuth()
  return <PerfilClient user={session} />
}
