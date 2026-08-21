import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { crearNotificaciones } from '@/lib/notificaciones'

export async function ejecutarAsistenciaIncompleta() {
  // Fecha en huso horario Argentina, no la del runtime del server (que en Vercel es UTC)
  const hoyStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  const ayerD = new Date(hoyStr + 'T12:00:00')
  ayerD.setDate(ayerD.getDate() - 1)
  const ayerStr = ayerD.toISOString().split('T')[0]
  const [, m, d] = ayerStr.split('-')
  const ayerLabel = `${parseInt(d)}/${parseInt(m)}`

  const { data: incompletos, error } = await supabase
    .from('asistencia')
    .select('usuario_id')
    .eq('fecha', ayerStr)
    .eq('estado', 'Incompleto')

  if (error) throw new Error(error.message)
  if (!incompletos?.length) return { ok: true, enviadas: 0 }

  const usuarioIds = [...new Set(incompletos.map(i => i.usuario_id))]

  await crearNotificaciones(usuarioIds, {
    titulo: 'Fichada incompleta ayer',
    mensaje: `${ayerLabel}: solo se registró una fichada (entrada o salida). Tocá para ver el detalle.`,
    tipo: 'asistencia_incompleta',
    url: '/dashboard/mi-asistencia',
  })

  return { ok: true, enviadas: usuarioIds.length }
}

// Ruta standalone (debug/manual) — el cron de Vercel llama a /api/cron/diario
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  const authHeader = request.headers.get('authorization')
  const bearerSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (secret !== process.env.CRON_SECRET && bearerSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  try {
    return NextResponse.json(await ejecutarAsistenciaIncompleta())
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
