import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

// Cancelar la propia solicitud — solo mientras está pendiente de aprobación
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params

  const { data: solicitud } = await supabaseAdmin.from('solicitudes_puesto').select('usuario_id, estado').eq('id', id).single()
  if (!solicitud) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  if (solicitud.usuario_id !== session.id) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
  if (solicitud.estado !== 'pending') {
    return NextResponse.json({ error: 'Ya fue resuelta, no se puede cancelar' }, { status: 400 })
  }

  const { error } = await supabaseAdmin.from('solicitudes_puesto').update({ estado: 'cancelled' }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
