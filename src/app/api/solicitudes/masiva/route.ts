import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { crearNotificaciones } from '@/lib/notificaciones'

// POST — crea Feriado/Local cerrado para todos los empleados activos
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sin permisos de administrador' }, { status: 403 })

  try {
    const body = await request.json()
    const { fecha_inicio, fecha_fin, motivo, comentario_admin } = body

    if (!fecha_inicio || !fecha_fin) {
      return NextResponse.json({ error: 'Fechas requeridas' }, { status: 400 })
    }

    const { data: empleados, error: empErr } = await supabase
      .from('usuarios')
      .select('id, nombre')
      .eq('estado_cuenta', 'activo')

    if (empErr) return NextResponse.json({ error: empErr.message }, { status: 500 })
    if (!empleados?.length) {
      return NextResponse.json({ error: 'No se encontraron empleados activos' }, { status: 400 })
    }

    const dias = Math.max(1, Math.round(
      (new Date(fecha_fin).getTime() - new Date(fecha_inicio).getTime()) / 86400000
    ) + 1)

    const now = new Date().toISOString()

    const inserts = empleados.map(emp => ({
      usuario_id:        emp.id,
      empleado_nombre:   emp.nombre,
      tipo:              'Feriado/Local cerrado',
      fecha_inicio,
      fecha_fin,
      dias,
      motivo:            motivo          || null,
      estado:            'approved',
      moderador:         session.nombre,
      comentario_admin:  comentario_admin || null,
      hora_ultima_actividad: now,
    }))

    const { error } = await supabase.from('solicitudes').insert(inserts)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Notificar a todos los empleados (excepto el admin que lo creó)
    try {
      const ids = empleados.map(e => e.id).filter(id => id !== session.id)
      if (ids.length) {
        const [fi, ff] = [fecha_inicio, fecha_fin].map(f => {
          const [y, m, d] = f.split('-').map(Number)
          return `${d}/${m}/${y}`
        })
        const rango = fecha_fin !== fecha_inicio ? `${fi} → ${ff}` : fi
        await crearNotificaciones(ids, {
          titulo: '🔒 Local cerrado',
          mensaje: rango + (motivo ? ` — ${motivo}` : ''),
          tipo: 'feriado',
        })
      }
    } catch { /* silently ignore */ }

    return NextResponse.json({ ok: true, count: inserts.length }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
