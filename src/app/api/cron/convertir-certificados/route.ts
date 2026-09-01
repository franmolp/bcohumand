import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/auth'
import { crearNotificaciones, getAdminIds } from '@/lib/notificaciones'

const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

type ConvertirMesResult =
  | { ok: false; error: string }
  | { ok: true; convertidas: number; mes: string; usuarioIds: string[]; inicioMes: string; finMes: string }

// Regenera la asistencia procesada SOLO de las empleadas afectadas (una por una,
// liviano y confiable). Regenerar el mes entero de todo el staff desde un cron
// es pesado y el self-fetch se corta por timeout — por eso antes fallaba en
// silencio y había que regenerar a mano.
async function regenerarUsuarios(origin: string, usuarioIds: string[], fechaInicio: string, fechaFin: string): Promise<number> {
  let total = 0
  for (const usuarioId of usuarioIds) {
    try {
      const res = await fetch(`${origin}/api/asistencia/regenerar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
        body: JSON.stringify({ fechaInicio, fechaFin, usuarioId }),
      })
      const data = await res.json().catch(() => ({}))
      total += data.procesados ?? 0
    } catch (e) {
      console.error('[convertir-certificados] regen usuario falló:', usuarioId, e)
    }
  }
  return total
}

async function convertirMes(year: number, month: number /* 0-indexed */): Promise<ConvertirMesResult> {
  const mesStr = String(month + 1).padStart(2, '0')
  const inicioMes = `${year}-${mesStr}-01`
  const finMes = `${year}-${mesStr}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`
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
    return { ok: false, error: error.message }
  }

  if (!solicitudes || solicitudes.length === 0) {
    console.log('[convertir-certificados] sin solicitudes sin certificado en', nombreMes, year)
    return { ok: true, convertidas: 0, mes: `${nombreMes} ${year}`, usuarioIds: [], inicioMes, finMes }
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
    return { ok: false, error: updateError.message }
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
  return { ok: true, convertidas: solicitudes.length, usuarioIds, mes: `${nombreMes} ${year}`, inicioMes, finMes }
}

// Cron automático (Vercel cron, día 1 de cada mes)
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  const authHeader = request.headers.get('authorization')
  const bearerSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (secret !== process.env.CRON_SECRET && bearerSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    // El día 1 cerramos el mes anterior
    const now = new Date()
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const result = await convertirMes(prevMonthDate.getFullYear(), prevMonthDate.getMonth())

    if (!result.ok) {
      const adminIds = await getAdminIds().catch(() => [] as string[])
      if (adminIds.length) {
        await crearNotificaciones(adminIds, {
          titulo: 'Error al convertir certificados vencidos',
          mensaje: `Falló la conversión automática de ausencias sin certificado. Error: ${result.error}`,
          tipo: 'aviso',
        }).catch(() => {})
      }
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    // Regenerar la asistencia solo de las empleadas afectadas (no debe tumbar la
    // respuesta si falla). Si no hubo conversiones, no hay nada que regenerar.
    let regenerados: number | null = null
    if (result.usuarioIds.length > 0) {
      const origin = new URL(request.url).origin
      regenerados = await regenerarUsuarios(origin, result.usuarioIds, result.inicioMes, result.finMes)
    }

    // Avisar a los admins del resultado (aunque sean 0 conversiones), para que
    // una falla silenciosa del cron no pase desapercibida hasta el mes siguiente.
    const adminIds = await getAdminIds().catch(() => [] as string[])
    if (adminIds.length) {
      await crearNotificaciones(adminIds, {
        titulo: 'Cierre de certificados médicos',
        mensaje: result.convertidas > 0
          ? `${result.convertidas} ausencia${result.convertidas !== 1 ? 's' : ''} de ${result.mes} sin certificado convertida${result.convertidas !== 1 ? 's' : ''} a injustificada.`
          : `Sin ausencias sin certificado para convertir en ${result.mes}.`,
        tipo: 'aviso',
      }).catch(() => {})
    }

    return NextResponse.json({ ...result, regenerados })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[convertir-certificados]', msg)
    const adminIds = await getAdminIds().catch(() => [] as string[])
    if (adminIds.length) {
      await crearNotificaciones(adminIds, {
        titulo: 'Error al convertir certificados vencidos',
        mensaje: `Falló la conversión automática de ausencias sin certificado. Error: ${msg}`,
        tipo: 'aviso',
      }).catch(() => {})
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
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
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })

    // Regenerar la asistencia de las empleadas afectadas también en el disparo manual.
    let regenerados: number | null = null
    if (result.usuarioIds.length > 0) {
      const origin = new URL(request.url).origin
      regenerados = await regenerarUsuarios(origin, result.usuarioIds, result.inicioMes, result.finMes)
    }

    return NextResponse.json({ ...result, regenerados })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al ejecutar conversión'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
