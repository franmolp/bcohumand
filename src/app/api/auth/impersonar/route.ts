import { NextRequest, NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'humand-secret-key-change-in-production'
)

// Solo la cuenta de usuario "prueba" puede iniciar una impersonación. Si ya
// está impersonando a alguien, el id de esa cuenta prueba viaja en el propio
// JWT (impersonadoPor) y se usa para permitir cambiar de empleado sin volver
// a pasar por "prueba" primero.
async function resolverPruebaId(): Promise<{ ok: true; pruebaId: string } | { ok: false; error: string; status: number }> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autorizado', status: 401 }
  if (session.impersonadoPor) return { ok: true, pruebaId: session.impersonadoPor }
  if (session.usuario === 'prueba') return { ok: true, pruebaId: session.id }
  return { ok: false, error: 'Solo la cuenta de prueba puede usar esta función', status: 403 }
}

// GET — lista de empleados activos disponibles para impersonar
export async function GET() {
  const check = await resolverPruebaId()
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status })

  const { data, error } = await supabaseAdmin
    .from('usuarios')
    .select('id, nombre, usuario, foto_perfil, equipo:equipos(nombre), rol:roles(nombre)')
    .eq('estado_cuenta', 'activo')
    .neq('id', check.pruebaId)
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const empleados = (data ?? []).map(u => {
    const equipoRaw = u.equipo as { nombre: string } | { nombre: string }[] | null
    const rolRaw = u.rol as { nombre: string } | { nombre: string }[] | null
    return {
      id: u.id,
      nombre: u.nombre,
      usuario: u.usuario,
      foto_perfil: u.foto_perfil,
      equipo: (Array.isArray(equipoRaw) ? equipoRaw[0]?.nombre : equipoRaw?.nombre) ?? '',
      rol: (Array.isArray(rolRaw) ? rolRaw[0]?.nombre : rolRaw?.nombre) ?? '',
    }
  })

  return NextResponse.json(empleados)
}

// POST — arranca (o cambia) la impersonación hacia el empleado indicado
export async function POST(req: NextRequest) {
  const check = await resolverPruebaId()
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status })

  const body = await req.json().catch(() => ({})) as { empleadoId?: string }
  if (!body.empleadoId) return NextResponse.json({ error: 'empleadoId requerido' }, { status: 400 })

  const { data: empleado, error } = await supabaseAdmin
    .from('usuarios')
    .select('id, usuario, nombre, email, estado_cuenta, equipo:equipos(nombre), rol:roles(nombre)')
    .eq('id', body.empleadoId)
    .single()

  if (error || !empleado) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 })
  if (empleado.estado_cuenta !== 'activo') return NextResponse.json({ error: 'Esa cuenta no está activa' }, { status: 400 })

  const equipoRaw = empleado.equipo as { nombre: string } | { nombre: string }[] | null
  const rolRaw = empleado.rol as { nombre: string } | { nombre: string }[] | null
  const equipoNombre = Array.isArray(equipoRaw) ? equipoRaw[0]?.nombre : equipoRaw?.nombre
  const rolNombre = Array.isArray(rolRaw) ? rolRaw[0]?.nombre : rolRaw?.nombre

  const token = await new SignJWT({
    id: empleado.id,
    usuario: empleado.usuario,
    nombre: empleado.nombre,
    email: empleado.email,
    rol: rolNombre || 'empleado',
    equipo: equipoNombre || '',
    impersonadoPor: check.pruebaId,
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
