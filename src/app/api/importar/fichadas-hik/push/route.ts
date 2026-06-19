import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { crearNotificaciones, getAdminIds } from '@/lib/notificaciones'

interface Row { reloj: string; fecha: string; hora: string }

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  const authHeader = req.headers.get('authorization')
  const bearerSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || (secret !== cronSecret && bearerSecret !== cronSecret)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as { rows?: Row[] }
  const rows = body.rows
  if (!Array.isArray(rows) || !rows.length) {
    return NextResponse.json({ error: 'Sin datos' }, { status: 400 })
  }

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

  const sortedDates = [...dates].sort()
  const fechasStr = sortedDates
    .map(d => { const [, m, day] = d.split('-'); return `${day}/${m}` })
    .join(', ')

  const adminIds = await getAdminIds()
  if (adminIds.length) {
    await crearNotificaciones(adminIds, {
      titulo: 'HIKVISION: fichadas importadas automáticamente',
      mensaje: `${records.length} fichadas${noEncontrados.size ? ` · ${noEncontrados.size} relojes sin usuario` : ''}. Fechas: ${fechasStr}.`,
      tipo: 'aviso',
    })
  }

  // Regenerar asistencia procesada para el rango de fechas importado
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  const host  = req.headers.get('host') ?? 'localhost:3000'
  fetch(`${proto}://${host}/api/asistencia/regenerar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cronSecret}` },
    body: JSON.stringify({ fechaInicio: sortedDates[0], fechaFin: sortedDates[sortedDates.length - 1] }),
  }).catch(() => {})

  return NextResponse.json({ ok: records.length, noEncontrados: [...noEncontrados], total: rows.length })
}
