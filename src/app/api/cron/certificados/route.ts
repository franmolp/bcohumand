import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  const authHeader = request.headers.get('authorization')
  const bearerSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (secret !== process.env.CRON_SECRET && bearerSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() // 0-indexed
  const mesStr = String(month + 1).padStart(2, '0')
  const inicioMes = `${year}-${mesStr}-01`
  const finMes = new Date(year, month + 1, 0)
  const finMesStr = `${year}-${mesStr}-${String(finMes.getDate()).padStart(2, '0')}`
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  const nombreMes = meses[month]

  // Buscar ausencias por salud del mes sin certificado cargado
  const { data: solicitudes, error } = await supabase
    .from('solicitudes')
    .select('usuario_id')
    .eq('tipo', 'Ausencia por Salud')
    .is('certificado_adjunto', null)
    .gte('fecha_inicio', inicioMes)
    .lte('fecha_inicio', finMesStr)
    .neq('estado', 'rejected')

  if (error) {
    console.error('[cron certificados] query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Deduplicate por usuario
  const usuarioIds = [...new Set((solicitudes ?? []).map(s => s.usuario_id).filter(Boolean))]

  if (!usuarioIds.length) {
    return NextResponse.json({ ok: true, enviadas: 0, mensaje: 'Sin ausencias pendientes de certificado' })
  }

  const { error: insertError } = await supabaseAdmin.from('notificaciones').insert(
    usuarioIds.map(id => ({
      usuario_id: id,
      titulo: 'Certificado médico pendiente',
      mensaje: `Tenés una ausencia por salud en ${nombreMes} sin certificado cargado. Subilo antes del ${finMes.getDate()}/${month + 1} o pasará a ausencia injustificada.`,
      tipo: 'certificado',
      leida: false,
    }))
  )

  if (insertError) {
    console.error('[cron certificados] insert error:', insertError)
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Notificar al admin
  const { data: adminRow } = await supabaseAdmin
    .from('usuarios')
    .select('id')
    .eq('email', 'francomoran@gmail.com')
    .single()
  if (adminRow) {
    await supabaseAdmin.from('notificaciones').insert({
      usuario_id: adminRow.id,
      titulo: `Certificados: ${usuarioIds.length} recordatorio${usuarioIds.length > 1 ? 's' : ''} enviado${usuarioIds.length > 1 ? 's' : ''}`,
      mensaje: `Se notificó a ${usuarioIds.length} empleada${usuarioIds.length > 1 ? 's' : ''} con ausencia por salud sin certificado en ${nombreMes}.`,
      tipo: 'aviso',
      leida: false,
    })
  }

  console.log(`[cron certificados] enviadas: ${usuarioIds.length}`)
  return NextResponse.json({ ok: true, enviadas: usuarioIds.length })
}
