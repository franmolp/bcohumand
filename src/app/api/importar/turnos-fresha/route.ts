import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'

interface Row { nombre: string; fecha: string; inicio: string; fin: string; horas: number }

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (session.rol !== 'admin' && session.rol !== 'Admin') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { rows?: Row[] }
  const rows = body.rows
  if (!Array.isArray(rows) || !rows.length) return NextResponse.json({ error: 'Sin datos' }, { status: 400 })

  const norm = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

  const { data: usuarios } = await supabase.from('usuarios').select('id, nombre')
  const nameMap = new Map((usuarios ?? []).map(u => [norm(u.nombre), u.id]))

  const recordMap = new Map<string, Record<string, unknown>>()
  const noEncontrados = new Set<string>()

  for (const row of rows) {
    const uid = nameMap.get(norm(row.nombre))
    if (!uid) { noEncontrados.add(row.nombre); continue }
    // Last row wins for duplicate (usuario_id, fecha)
    recordMap.set(`${uid}|${row.fecha}`, {
      usuario_id: uid,
      fecha: row.fecha,
      inicio_base: row.inicio,
      fin_base: row.fin,
      horas_base: row.horas,
    })
  }

  const records = [...recordMap.values()]

  const BATCH = 500
  for (let i = 0; i < records.length; i += BATCH) {
    const { error } = await supabaseAdmin
      .from('horarios_base')
      .upsert(records.slice(i, i + BATCH), { onConflict: 'usuario_id,fecha' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await supabaseAdmin
    .from('configuracion')
    .upsert({ clave: 'ultima_importacion_turnos', valor: { fecha: new Date().toISOString() } }, { onConflict: 'clave' })

  return NextResponse.json({ ok: records.length, noEncontrados: [...noEncontrados], total: rows.length })
}
