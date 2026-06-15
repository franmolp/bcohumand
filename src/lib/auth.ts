import { jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import type { SessionUser } from '@/types'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'humand-secret-key-change-in-production'
)

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as unknown as SessionUser
  } catch {
    return null
  }
}

export async function requireAuth(): Promise<SessionUser> {
  const session = await getSession()
  if (!session) throw new Error('No autorizado')
  return session
}

export async function requireAdmin(): Promise<SessionUser> {
  const session = await requireAuth()
  if (session.rol?.toLowerCase() !== 'admin') throw new Error('Sin permisos de administrador')
  return session
}
