import { NextRequest, NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'humand-secret-key-change-in-production'
)

function esOriginalHabilitado(usuario: string | null | undefined, rol: string | null | undefined): boolean {
  // Puede personificar cualquier admin, más la cuenta histórica "prueba".
  return usuario === 'prueba' || rol?.toLowerCase() === 'admin'
}

// Quién puede iniciar/continuar una impersonación: cualquier admin (o la cuenta
// histórica "prueba"). Si ya está impersonando, el id de la cuenta original
// viaja en el JWT (impersonadoPor); se re-verifica contra la base que esa cuenta
// siga siendo admin/prueba, para que un JWT viejo no sirva si le sacaron el rol.
async function resolverOriginalId(): Promise<{ ok: true; originalId: string; originalNombre: string } | { ok: false; error: string; status: number }> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autorizado', status: 401 }

  if (session.impersonadoPor) {
    const { data: orig } = await supabaseAdmin
      .from('usuarios')
      .select('id, nombre, usuario, estado_cuenta, rol:roles(nombre)')
      .eq('id', session.impersonadoPor)
      .single()
    const rolRaw = orig?.rol as { nombre: string } | { nombre: string }[] | null
    const rolNombre = Array.isArray(rolRaw) ? rolRaw[0]?.nombre : rolRaw?.nombre
    if (!orig || orig.estado_cuenta !== 'activo' || !esOriginalHabilitado(orig.usuario, rolNombre)) {
      return { ok: false, error: 'Tu cuenta ya no puede usar esta función', status: 403 }
    }
    return { ok: true, originalId: orig.id, originalNombre: orig.nombre }
  }

  if (esOriginalHabilitado(session.usuario, session.rol)) {
    return { ok: true, originalId: session.id, originalNombre: session.nombre }
  }
  return { ok: false, error: 'Solo un administrador puede usar esta función', status: 403 }
}

// GET — lista de empleados activos disponibles para impersonar
export async function GET() {
  const check = await resolverOriginalId()
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status })

  const { data, error } = await supabaseAdmin
    .from('usuarios')
    .select('id, nombre, usuario, foto_perfil, equipo:equipos(nombre), rol:roles(nombre)')
    .eq('estado_cuenta', 'activo')
    .neq('id', check.originalId)
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
  const check = await resolverOriginalId()
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
    impersonadoPor: check.originalId,
    impersonadoPorNombre: check.originalNombre,
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
