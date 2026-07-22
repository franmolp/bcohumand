import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { crearNotificaciones } from '@/lib/notificaciones'

const CATEGORIAS_LABELS: Record<string, string> = {
  cocina: 'Cocina',
  limpieza: 'Limpieza',
  manicuria: 'Manicuría',
  masajes: 'Masajes',
  cejas_pestanas: 'Cejas y Pestañas',
  depilacion: 'Depilación',
  peluqueria: 'Peluquería',
}

function hoyDiaARG(): number {
  const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  return new Date(dateStr + 'T12:00:00').getDay()
}

export async function GET() {
  const hoyDia = hoyDiaARG()

  const { data: config } = await supabaseAdmin
    .from('pedidos_config')
    .select('categorias_config')
    .eq('id', 1)
    .single()

  const categoriasConfig: Partial<Record<string, { notif: boolean; dia_cierre: number }>> = config?.categorias_config ?? {}

  let enviadas = 0

  for (const [cat, cfg] of Object.entries(categoriasConfig)) {
    if (!cfg?.notif) continue

    // Notificar el día anterior al día de cierre
    const diaRecordatorio = (cfg.dia_cierre - 1 + 7) % 7
    if (hoyDia !== diaRecordatorio) continue

    const { data: perms } = await supabaseAdmin
      .from('pedidos_permisos')
      .select('usuario_id')
      .eq('categoria', cat)

    const userIds = [...new Set((perms ?? []).map(p => p.usuario_id))]
    if (!userIds.length) continue

    const label = CATEGORIAS_LABELS[cat] ?? cat
    const mensaje = `La lista de ${label} cierra mañana. ¡No olvides agregar lo que necesitás!`

    await crearNotificaciones(userIds, {
      titulo: 'Recordatorio de pedido',
      mensaje,
      tipo: 'pedido_recordatorio',
    })
    enviadas += userIds.length
  }

  return NextResponse.json({ ok: true, enviadas })
}
