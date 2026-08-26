import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { crearNotificaciones } from '@/lib/notificaciones'

export async function ejecutarAsistenciaIncompleta(fechaOverride?: string) {
  // Fecha en huso horario Argentina, no la del runtime del server (que en Vercel es UTC)
  const hoyStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  let ayerStr = fechaOverride ?? ''
  if (!ayerStr) {
    const ayerD = new Date(hoyStr + 'T12:00:00')
    ayerD.setDate(ayerD.getDate() - 1)
    ayerStr = ayerD.toISOString().split('T')[0]
  }
  const [, m, d] = ayerStr.split('-')
  const ayerLabel = `${parseInt(d)}/${parseInt(m)}`

  const { data: filas, error } = await supabase
    .from('asistencia_procesada')
    .select('usuario_id, estado')
    .eq('fecha', ayerStr)
    .in('estado', ['Incompleto', 'Sin fichada'])

  if (error) throw new Error(error.message)
  if (!filas?.length) return { ok: true, enviadas: 0 }

  // Incompleto = una sola marcación (entrada o salida). Sin fichada = tuvo turno
  // pero no quedó ninguna marcación. Cada caso recibe su propio texto.
  const incompletos = [...new Set(filas.filter(f => f.estado === 'Incompleto').map(f => f.usuario_id))]
  const sinFichada = [...new Set(filas.filter(f => f.estado === 'Sin fichada').map(f => f.usuario_id))]

  if (incompletos.length) {
    await crearNotificaciones(incompletos, {
      titulo: 'Revisá tu fichada de ayer',
      mensaje: `El ${ayerLabel} quedó registrada una sola marcación. Acordate de fichar al entrar y al salir: además de que tu asistencia y liquidación queden bien, fichar correctamente evita sanciones. Tocá para revisarlo.`,
      tipo: 'asistencia_incompleta',
      url: '/dashboard/mi-asistencia',
    })
  }

  if (sinFichada.length) {
    await crearNotificaciones(sinFichada, {
      titulo: 'Ayer no quedó registrada tu fichada',
      mensaje: `El ${ayerLabel} tuviste turno pero no se registró ninguna marcación. Acordate de fichar siempre al entrar y al salir para que tu jornada quede registrada y evitar sanciones; si fuiste, avisale a tu encargada. Tocá para revisarlo.`,
      tipo: 'asistencia_incompleta',
      url: '/dashboard/mi-asistencia',
    })
  }

  return { ok: true, enviadas: incompletos.length + sinFichada.length }
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
    const fecha = request.nextUrl.searchParams.get('fecha') ?? undefined
    return NextResponse.json(await ejecutarAsistenciaIncompleta(fecha))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
