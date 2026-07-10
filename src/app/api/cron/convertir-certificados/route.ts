import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/auth'

const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

async function convertirMes(year: number, month: number /* 0-indexed */) {
  const mesStr = String(month + 1).padStart(2, '0')
  const inicioMes = `${year}-${mesStr}-01`
  // Usamos < primer día del mes siguiente para cubrir toda la última hora del mes
  const nextMonth = month === 11 ? new Date(year + 1, 0, 1) : new Date(year, month + 1, 1)
  const inicioSiguiente = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`
  const nombreMes = meses[month]

  // Buscar solicitudes de salud sin certificado (NULL o string vacía)
  const { data: solicitudes, error } = await supabaseAdmin
    .from('solicitudes')
    .select('id, usuario_id')
    .eq('tipo', 'Ausencia por Salud')
    .or('certificado_adjunto.is.null,certificado_adjunto.eq.')
    .neq('estado', 'rejected')
    .gte('fecha_inicio', inicioMes)
    .lt('fecha_inicio', inicioSiguiente)

  if (error) {
    console.error('[convertir-certificados] query error:', error)
    return { error: error.message }
  }

  if (!solicitudes || solicitudes.length === 0) {
    console.log('[convertir-certificados] sin solicitudes sin certificado en', nombreMes, year)
    return { ok: true, convertidas: 0, mes: `${nombreMes} ${year}` }
  }

  const ids = solicitudes.map(s => s.id)
  const usuarioIds = [...new Set(solicitudes.map(s => s.usuario_id).filter(Boolean))]

  const { error: updateError } = await supabaseAdmin
    .from('solicitudes')
    .update({
      tipo: 'Ausencia Injustificada',
      comentario_admin: 'Convertida automáticamente a injustificada por falta de certificado médico',
    })
    .in('id', ids)

  if (updateError) {
    console.error('[convertir-certificados] update error:', updateError)
    return { error: updateError.message }
  }

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
    if (notifError) console.error('[convertir-certificados] notif error:', notifError)
  }

  console.log(`[convertir-certificados] convertidas: ${solicitudes.length}, usuarios: ${usuarioIds.length}, mes: ${nombreMes} ${year}`)
  return { ok: true, convertidas: solicitudes.length, usuariosAfectados: usuarioIds.length, mes: `${nombreMes} ${year}` }
}

// Cron automático (Vercel cron, día 1 de cada mes)
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  const authHeader = request.headers.get('authorization')
  const bearerSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (secret !== process.env.CRON_SECRET && bearerSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // El día 1 cerramos el mes anterior
  const now = new Date()
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const result = await convertirMes(prevMonthDate.getFullYear(), prevMonthDate.getMonth())

  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })

  // Regenerar asistencia del mes cerrado
  const host = request.headers.get('host')
  const protocol = host?.includes('localhost') ? 'http' : 'https'
  const mesStr = String(prevMonthDate.getMonth() + 1).padStart(2, '0')
  const inicioMes = `${prevMonthDate.getFullYear()}-${mesStr}-01`
  const nextMonth = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1, 1)
  const finMes = new Date(nextMonth.getTime() - 86400000)
  const finMesStr = `${finMes.getFullYear()}-${String(finMes.getMonth() + 1).padStart(2, '0')}-${String(finMes.getDate()).padStart(2, '0')}`

  const regenRes = await fetch(`${protocol}://${host}/api/asistencia/regenerar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
    body: JSON.stringify({ fechaInicio: inicioMes, fechaFin: finMesStr }),
  })
  const regenData = await regenRes.json().catch(() => ({}))

  return NextResponse.json({ ...result, regenerados: regenData.procesados ?? null })
}

// Trigger manual — solo admin (para ejecutar desde el panel)
export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
    const body = await request.json().catch(() => ({}))

    // Si viene { mes: 'YYYY-MM' } se procesa ese mes; si no, el mes anterior
    let year: number, month: number
    if (body.mes && /^\d{4}-\d{2}$/.test(body.mes)) {
      const [y, m] = body.mes.split('-').map(Number)
      year = y; month = m - 1
    } else {
      const now = new Date()
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      year = prev.getFullYear(); month = prev.getMonth()
    }

    const result = await convertirMes(year, month)
    if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al ejecutar conversión'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
