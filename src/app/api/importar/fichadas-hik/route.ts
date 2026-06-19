import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { crearNotificaciones, getAdminIds } from '@/lib/notificaciones'

interface Row { reloj: string; fecha: string; hora: string }

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (session.rol !== 'admin' && session.rol !== 'Admin') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { rows?: Row[] }
  const rows = body.rows
  if (!Array.isArray(rows) || !rows.length) return NextResponse.json({ error: 'Sin datos' }, { status: 400 })

  const { data: usuarios } = await supabase.from('usuarios').select('id, reloj')
  const relojMap = new Map(
    (usuarios ?? []).filter(u => u.reloj).map(u => [u.reloj!.trim(), u.id])
  )

  const recordMap = new Map<string, Record<string, unknown>>()
  const noEncontrados = new Set<string>()
  const matchedIds = new Set<string>()
  const dates = new Set<string>()

  for (const row of rows) {
    const uid = relojMap.get(row.reloj.trim())
    if (!uid) { noEncontrados.add(row.reloj); continue }
    matchedIds.add(uid)
    dates.add(row.fecha)
    recordMap.set(`${uid}|${row.fecha}|${row.hora}`, { usuario_id: uid, fecha: row.fecha, hora: row.hora, uid: null })
  }

  const records = [...recordMap.values()]

  if (!records.length) return NextResponse.json({ ok: 0, noEncontrados: [...noEncontrados], total: rows.length })

  // Replace fichadas for the affected users + dates
  const { error: delErr } = await supabaseAdmin
    .from('asistencia_raw')
    .delete()
    .in('usuario_id', [...matchedIds])
    .in('fecha', [...dates])
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  const BATCH = 500
  for (let i = 0; i < records.length; i += BATCH) {
    const { error } = await supabaseAdmin.from('asistencia_raw').insert(records.slice(i, i + BATCH))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Notificar a admins cuántas fichadas se importaron
  const fechasStr = [...dates].sort().join(', ')
  const adminIds = await getAdminIds()
  if (adminIds.length) {
    await crearNotificaciones(adminIds, {
      titulo: 'Importación HIKVISION completada',
      mensaje: `Se importaron ${records.length} fichadas (${[...noEncontrados].length} relojes sin usuario). Fechas: ${fechasStr}.`,
      tipo: 'fichadas',
    })
  }

  return NextResponse.json({ ok: records.length, noEncontrados: [...noEncontrados], total: rows.length })
}
