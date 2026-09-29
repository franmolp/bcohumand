import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { crearNotificacion } from '@/lib/notificaciones'
import { esEquipoLimpieza } from '@/lib/limpieza'

function esAdmin(rol: string) { return rol === 'admin' || rol === 'Admin' }

// Cambia el estado de un pedido de limpieza (pendiente / resuelto). Lo puede hacer el
// equipo de limpieza o el admin. Al resolver, avisa a quien lo cargó.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!esAdmin(session.rol) && !esEquipoLimpieza(session.equipo)) {
    return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
  }

  const { id } = await params
  const { estado } = await req.json().catch(() => ({})) as { estado?: string }
  if (!estado || !['pendiente', 'resuelto'].includes(estado)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  }

  // Solo se opera sobre pedidos de limpieza (no otras categorías de mantenimiento).
  const { data: rep } = await supabaseAdmin
    .from('reparaciones')
    .select('id, categoria, titulo, usuario_id, estado')
    .eq('id', id)
    .single()
  if (!rep || rep.categoria !== 'limpieza') {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  // El equipo de limpieza puede marcar resuelto, pero NO reabrir (volver a pendiente):
  // eso solo el admin. Evita disparar notificaciones repetidas a quien la cargó.
  if (estado === 'pendiente' && !esAdmin(session.rol)) {
    return NextResponse.json({ error: 'Solo el admin puede reabrir una solicitud resuelta' }, { status: 403 })
  }

  const yaResuelta = rep.estado === 'resuelto'

  const { error } = await supabaseAdmin
    .from('reparaciones')
    .update({ estado, resuelto_en: estado === 'resuelto' ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Aviso a quien la cargó SOLO cuando pasa a resuelta (no si ya lo estaba).
  if (estado === 'resuelto' && !yaResuelta && rep.usuario_id && rep.usuario_id !== session.id) {
    await crearNotificacion({
      usuario_id: rep.usuario_id,
      titulo: 'Solicitud de limpieza resuelta',
      mensaje: rep.titulo,
      tipo: 'reparacion_actualizada',
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
