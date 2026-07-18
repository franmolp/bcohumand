import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'
import { crearNotificacion } from '@/lib/notificaciones'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const { accion } = body

  if (!['aprobado', 'oculto'].includes(accion)) {
    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
  }

  const { data: rec, error: fetchError } = await supabaseAdmin
    .from('reconocimientos')
    .select('id, id_receptor, id_emisor, categoria_pilar, anonimo, estado')
    .eq('id', id)
    .single()

  if (fetchError || !rec) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (rec.estado !== 'pendiente') return NextResponse.json({ error: 'Ya fue moderado' }, { status: 409 })

  const { error } = await supabaseAdmin
    .from('reconocimientos')
    .update({
      estado: accion,
      fecha_moderacion: new Date().toISOString(),
      moderado_por: session.id,
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notificar al receptor solo si se aprueba
  if (accion === 'aprobado') {
    const pilarLabel: Record<string, string> = {
      salvavidas: '🛟 Salvavidas',
      buena_vibra: '☀️ Buena vibra',
      iniciativa: '⚡ Iniciativa',
    }
    await crearNotificacion({
      usuario_id: rec.id_receptor,
      titulo: '¡Recibiste un reconocimiento!',
      mensaje: `Te reconocieron en el pilar ${pilarLabel[rec.categoria_pilar] ?? rec.categoria_pilar}`,
      tipo: 'reconocimiento_aprobado',
    })
  }

  return NextResponse.json({ ok: true })
}
