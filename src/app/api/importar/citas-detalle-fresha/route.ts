import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'

interface Row {
  nombre: string
  fecha: string
  estado: string
  categoria: string
  servicio: string
  duracion_min: number
  franja_inicio: string | null
  franja_fin: string | null
  venta_neta: number
}

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

  const records: Record<string, unknown>[] = []
  const noEncontrados = new Set<string>()
  const dates = new Set<string>()
  const matchedIds = new Set<string>()

  for (const row of rows) {
    const uid = nameMap.get(norm(row.nombre))
    if (!uid) { noEncontrados.add(row.nombre); continue }
    dates.add(row.fecha)
    matchedIds.add(uid)
    records.push({
      usuario_id: uid,
      nombre_empleada: row.nombre,
      fecha: row.fecha,
      estado: row.estado,
      categoria: row.categoria,
      servicio: row.servicio,
      duracion_min: row.duracion_min,
      franja_inicio: row.franja_inicio,
      franja_fin: row.franja_fin,
      venta_neta: row.venta_neta,
    })
  }

  if (!records.length) return NextResponse.json({ ok: 0, noEncontrados: [...noEncontrados], total: rows.length })

  const { error: delErr } = await supabaseAdmin
    .from('fresha_citas_detalle')
    .delete()
    .in('usuario_id', [...matchedIds])
    .in('fecha', [...dates])
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  const BATCH = 500
  for (let i = 0; i < records.length; i += BATCH) {
    const { error } = await supabaseAdmin.from('fresha_citas_detalle').insert(records.slice(i, i + BATCH))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: records.length, noEncontrados: [...noEncontrados], total: rows.length })
}
