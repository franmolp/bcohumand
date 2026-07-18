import { requireAuth } from '@/lib/auth'
import ReconocimientosClient from './client'

export default async function ReconocimientosPage() {
  const session = await requireAuth()
  return <ReconocimientosClient session={session} />
}
