import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'
import { avisarTurnos } from '@/lib/bco-turnos'

// GET - Listar empleados
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const estado = searchParams.get('estado') || 'activo'
  const equipo = searchParams.get('equipo')
  const buscar = searchParams.get('q')

  const CAMPOS = 'id, usuario, reloj, nombre, email, estado_cuenta, foto_perfil, telefono, dni, fecha_nacimiento, ultimo_login, ultimo_acceso, ultimo_dispositivo, fecha_creacion, equipo:equipos(id,nombre), rol:roles(id,nombre)'
  const armar = (campos: string) => {
  let query = supabase
    .from('usuarios')
    .select(campos)
    .order('nombre')

  if (estado === 'archivado') {
    query = query.eq('estado_cuenta', 'archivado')
  } else if (estado === 'activo') {
    query = query.neq('estado_cuenta', 'archivado')
  }
  // 'todos' no filtra

  if (equipo) {
    query = query.eq('equipo_id', parseInt(equipo))
  }

  if (buscar) {
    query = query.or(`nombre.ilike.%${buscar}%,email.ilike.%${buscar}%`)
  }

  return query
  }
  // Con bco_turnos.sql trae también el interruptor "Usa BCO Turnos"
  let { data, error } = await armar(CAMPOS + ', usa_bco_turnos')
  if (error && /usa_bco_turnos/.test(error.message)) ({ data, error } = await armar(CAMPOS))

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// POST - Crear empleado
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { usuario, nombre, email, equipo_id, rol_id, telefono, dni, fecha_nacimiento, reloj, password, usa_bco_turnos } = body

    if (!nombre || !email || !password) {
      return NextResponse.json({ error: 'Nombre, email y contraseña son requeridos' }, { status: 400 })
    }

    const { data: existing } = await supabase
      .from('usuarios')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Ya existe un usuario con ese email' }, { status: 409 })
    }

    const password_hash = await bcrypt.hash(password, 10)

    const { data, error } = await supabase
      .from('usuarios')
      .insert({
        usuario: (usuario || email.split('@')[0]).toLowerCase().trim(),
        nombre,
        email: email.toLowerCase().trim(),
        equipo_id: equipo_id || null,
        rol_id: rol_id || 2,
        telefono: telefono || null,
        dni: dni || null,
        fecha_nacimiento: fecha_nacimiento || null,
        ...(usa_bco_turnos === false ? { usa_bco_turnos: false } : {}),
        reloj: reloj || null,
        password_hash,
        salt: 'bcrypt',
        estado_cuenta: 'activo',
      })
      .select('id, usuario, nombre, email, estado_cuenta, equipo:equipos(id,nombre), rol:roles(id,nombre)')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    avisarTurnos()
    return NextResponse.json(data, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
