import { requireAuth } from '@/lib/auth'
import CalendarioClient from './client'

export default async function CalendarioPage() {
  const session = await requireAuth()
  return <CalendarioClient user={session} />
}
