import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { crearNotificaciones } from '@/lib/notificaciones'

// Recordatorio 24hs antes de la fecha límite de una invitación del muro:
// a quienes todavía NO confirmaron (ni que van ni que no) se les avisa.
// Se dispara desde el cron diario. "24hs antes" = el día cuyo límite es mañana (ART).
export async function ejecutarRecordatorioInvitaciones() {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  const d = new Date(hoy + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)
  const maniana = d.toISOString().slice(0, 10)

  // Invitaciones abiertas cuya fecha límite es mañana.
  const { data: invs } = await supabaseAdmin
    .from('muro_posts')
    .select('id')
    .eq('tipo', 'invitacion')
    .eq('cerrado', false)
    .eq('rsvp_limite', maniana)
  if (!invs?.length) return { ok: true, enviadas: 0 }

  const { data: activos } = await supabase.from('usuarios').select('id').eq('estado_cuenta', 'activo')
  const activeIds = (activos ?? []).map((u: { id: string }) => u.id)

  let enviadas = 0
  for (const inv of invs) {
    const { data: rsvps } = await supabaseAdmin.from('muro_rsvp').select('usuario_id').eq('post_id', inv.id)
    const respondieron = new Set((rsvps ?? []).map((r: { usuario_id: string }) => r.usuario_id))
    const faltan = activeIds.filter(id => !respondieron.has(id))
    if (faltan.length) {
      await crearNotificaciones(faltan, {
        titulo: '⏰ Mañana vence la confirmación',
        mensaje: 'Todavía no confirmaste tu asistencia a la invitación del Muro. Mañana es el último día — entrá y avisá si vas o no.',
        tipo: 'mural_post',
        url: '/dashboard/muro',
      }).catch(() => {})
      enviadas += faltan.length
    }
  }
  return { ok: true, enviadas }
}

// Ruta standalone para prueba manual (admin con CRON_SECRET).
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  const authHeader = request.headers.get('authorization')
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (secret !== process.env.CRON_SECRET && bearer !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  try {
    return NextResponse.json(await ejecutarRecordatorioInvitaciones())
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
