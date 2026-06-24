import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  const authHeader = request.headers.get('authorization')
  const bearerSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (secret !== process.env.CRON_SECRET && bearerSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Corremos el día 1 a las 00hs → el mes que acaba de cerrar es el anterior
  const now = new Date()
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevYear = prevMonthDate.getFullYear()
  const prevMonth = prevMonthDate.getMonth() // 0-indexed
  const prevMesStr = String(prevMonth + 1).padStart(2, '0')
  const inicioMes = `${prevYear}-${prevMesStr}-01`
  const lastDay = new Date(prevYear, prevMonth + 1, 0).getDate()
  const finMes = `${prevYear}-${prevMesStr}-${String(lastDay).padStart(2, '0')}`
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  const nombreMes = meses[prevMonth]

  // Buscar solicitudes de salud del mes cerrado sin certificado
  const { data: solicitudes, error } = await supabaseAdmin
    .from('solicitudes')
    .select('id, usuario_id')
    .eq('tipo', 'Ausencia por Salud')
    .is('certificado_adjunto', null)
    .neq('estado', 'rejected')
    .gte('fecha_inicio', inicioMes)
    .lte('fecha_inicio', finMes)

  if (error) {
    console.error('[cron convertir-certificados] query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!solicitudes || solicitudes.length === 0) {
    console.log('[cron convertir-certificados] sin solicitudes sin certificado en', nombreMes)
    return NextResponse.json({ ok: true, convertidas: 0 })
  }

  const ids = solicitudes.map(s => s.id)
  const usuarioIds = [...new Set(solicitudes.map(s => s.usuario_id).filter(Boolean))]

  // Convertir a Ausencia Injustificada
  const { error: updateError } = await supabaseAdmin
    .from('solicitudes')
    .update({
      tipo: 'Ausencia Injustificada',
      comentario_admin: 'Convertida automáticamente a injustificada por falta de certificado médico',
      hora_ultima_actividad: now.toISOString(),
    })
    .in('id', ids)

  if (updateError) {
    console.error('[cron convertir-certificados] update error:', updateError)
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Notificar a cada empleada afectada
  if (usuarioIds.length > 0) {
    const { error: notifError } = await supabaseAdmin.from('notificaciones').insert(
      usuarioIds.map(uid => ({
        usuario_id: uid,
        titulo: 'Ausencia convertida a injustificada',
        mensaje: `Tu ausencia por salud de ${nombreMes} fue convertida a ausencia injustificada por no haber cargado el certificado médico.`,
        tipo: 'aviso',
        leida: false,
      }))
    )
    if (notifError) console.error('[cron convertir-certificados] notif error:', notifError)
  }

  // Regenerar asistencia del mes cerrado para reflejar el cambio en asistencia_procesada
  const host = request.headers.get('host')
  const protocol = host?.includes('localhost') ? 'http' : 'https'
  const regenRes = await fetch(`${protocol}://${host}/api/asistencia/regenerar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify({ fechaInicio: inicioMes, fechaFin: finMes }),
  })
  const regenData = await regenRes.json().catch(() => ({}))

  console.log(`[cron convertir-certificados] convertidas: ${solicitudes.length}, usuarios: ${usuarioIds.length}, regenerados: ${regenData.procesados ?? '?'}`)
  return NextResponse.json({
    ok: true,
    convertidas: solicitudes.length,
    usuariosAfectados: usuarioIds.length,
    regenerados: regenData.procesados ?? null,
  })
}
