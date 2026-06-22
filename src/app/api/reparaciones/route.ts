import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { crearNotificacion, crearNotificaciones, getAdminAndEncargadaIds } from '@/lib/notificaciones'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin' || session.rol === 'encargada' || session.rol === 'Encargada'

  if (isAdmin) {
    const { data, error } = await supabaseAdmin
      .from('reparaciones')
      .select('*')
      .order('creado_en', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  const { data, error } = await supabaseAdmin
    .from('reparaciones')
    .select('*')
    .eq('usuario_id', session.id)
    .order('creado_en', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin' || session.rol === 'encargada' || session.rol === 'Encargada'
  const body = await req.json()
  const { titulo, descripcion, categoria, prioridad, usuario_id, nombre_empleada } = body

  if (!titulo?.trim()) return NextResponse.json({ error: 'Título requerido' }, { status: 400 })

  const targetId = isAdmin && usuario_id ? usuario_id : session.id
  const targetNombre = isAdmin && nombre_empleada ? nombre_empleada : session.nombre

  const { data, error } = await supabaseAdmin
    .from('reparaciones')
    .insert({
      titulo: titulo.trim(),
      descripcion: descripcion?.trim() || null,
      categoria: categoria || 'otro',
      prioridad: prioridad || 'media',
      estado: 'pendiente',
      usuario_id: targetId,
      nombre_empleada: targetNombre,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify admins + encargadas when an employee creates a request
  if (!isAdmin) {
    const adminIds = await getAdminAndEncargadaIds()
    if (adminIds.length) {
      await crearNotificaciones(adminIds, {
        titulo: 'Nueva solicitud de reparación',
        mensaje: `${targetNombre}: ${titulo.trim()}`,
        tipo: 'reparacion_nueva',
      }).catch(() => {})
    }
  }

  // Notify the employee when admin creates on their behalf
  if (isAdmin && usuario_id && usuario_id !== session.id) {
    await crearNotificacion({
      usuario_id,
      titulo: 'Nueva solicitud cargada',
      mensaje: `${titulo.trim()} · Cargada por el admin`,
      tipo: 'reparacion_nueva',
    }).catch(() => {})
  }

  return NextResponse.json(data)
}
