import { NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'humand-secret-key-change-in-production'
)

// Vuelve a la cuenta "prueba" original, cerrando la impersonación activa.
export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!session.impersonadoPor) return NextResponse.json({ error: 'No estás viendo la app como otro empleado' }, { status: 400 })

  const { data: prueba, error } = await supabaseAdmin
    .from('usuarios')
    .select('id, usuario, nombre, email, equipo:equipos(nombre), rol:roles(nombre)')
    .eq('id', session.impersonadoPor)
    .single()

  if (error || !prueba) return NextResponse.json({ error: 'No se encontró la cuenta prueba' }, { status: 404 })

  const equipoRaw = prueba.equipo as { nombre: string } | { nombre: string }[] | null
  const rolRaw = prueba.rol as { nombre: string } | { nombre: string }[] | null
  const equipoNombre = Array.isArray(equipoRaw) ? equipoRaw[0]?.nombre : equipoRaw?.nombre
  const rolNombre = Array.isArray(rolRaw) ? rolRaw[0]?.nombre : rolRaw?.nombre

  const token = await new SignJWT({
    id: prueba.id,
    usuario: prueba.usuario,
    nombre: prueba.nombre,
    email: prueba.email,
    rol: rolNombre || 'empleado',
    equipo: equipoNombre || '',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(JWT_SECRET)

  const response = NextResponse.json({ ok: true })
  response.cookies.set('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })
  return response
}
