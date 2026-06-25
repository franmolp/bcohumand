import { requireAuth } from '@/lib/auth'
import JuegosClient from './client'

export default async function JuegosPage() {
  const session = await requireAuth()
  return <JuegosClient user={session} />
}
