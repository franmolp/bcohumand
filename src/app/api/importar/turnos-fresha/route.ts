import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'

interface Row { nombre: string; fecha: string; inicio: string; fin: string; horas: number }

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const viaCron = cronSecret && auth === `Bearer ${cronSecret}`
  if (!viaCron) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    if (session.rol !== 'admin' && session.rol !== 'Admin') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as { rows?: Row[] }
  const rows = body.rows
  if (!Array.isArray(rows) || !rows.length) return NextResponse.json({ error: 'Sin datos' }, { status: 400 })

  const norm = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

  const { data: usuarios } = await supabase.from('usuarios').select('id, nombre')
  const nameMap = new Map((usuarios ?? []).map(u => [norm(u.nombre), u.id]))

  // Una empleada puede tener más de un bloque el mismo día (horario partido,
  // ej. 9-12 y 15-20) — se guarda cada bloque como su propia fila. Solo se
  // deduplica cuando el bloque es exactamente igual (mismo horario repetido),
  // no por usuario+fecha.
  const recordMap = new Map<string, Record<string, unknown>>()
  const noEncontrados = new Set<string>()

  for (const row of rows) {
    const uid = nameMap.get(norm(row.nombre))
    if (!uid) { noEncontrados.add(row.nombre); continue }
    recordMap.set(`${uid}|${row.fecha}|${row.inicio}|${row.fin}`, {
      usuario_id: uid,
      fecha: row.fecha,
      inicio_base: row.inicio,
      fin_base: row.fin,
      horas_base: row.horas,
    })
  }

  const records = [...recordMap.values()]

  // Borrar el rango completo de fechas del import para que empleadas sin horas
  // (día inhabilitado en Fresha) no queden como filas fantasma del import anterior
  const rawFechas = rows.map(r => r.fecha)
  const fechaMin = rawFechas.reduce((a, b) => a < b ? a : b)
  const fechaMax = rawFechas.reduce((a, b) => a > b ? a : b)
  const { error: delErr } = await supabaseAdmin
    .from('horarios_base')
    .delete()
    .gte('fecha', fechaMin)
    .lte('fecha', fechaMax)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  const BATCH = 500
  for (let i = 0; i < records.length; i += BATCH) {
    const { error } = await supabaseAdmin
      .from('horarios_base')
      .insert(records.slice(i, i + BATCH))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await supabaseAdmin
    .from('configuracion')
    .upsert({ clave: 'ultima_importacion_turnos', valor: { fecha: new Date().toISOString() } }, { onConflict: 'clave' })

  return NextResponse.json({ ok: records.length, noEncontrados: [...noEncontrados], total: rows.length })
}
