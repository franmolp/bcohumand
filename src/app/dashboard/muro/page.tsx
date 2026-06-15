import { requireAuth } from '@/lib/auth'
import MuroClient from './client'

export default async function MuroPage() {
  const session = await requireAuth()
  return <MuroClient session={session} />
}
