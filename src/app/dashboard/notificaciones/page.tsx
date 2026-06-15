import { requireAuth } from '@/lib/auth'
import NotificacionesClient from './client'

export default async function NotificacionesPage() {
  const session = await requireAuth()
  return <NotificacionesClient session={session} />
}
