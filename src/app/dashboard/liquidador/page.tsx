import { requireAuth } from '@/lib/auth'
import LiquidadorClient from './client'

export default async function LiquidadorPage() {
  const session = await requireAuth()
  return <LiquidadorClient user={session} />
}
