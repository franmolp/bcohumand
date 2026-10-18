import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

// Citas por empleada desde BCO Turnos (reemplaza el reporte de Fresha): llenan fresha_citas_detalle, que usan los Informes.
// La llama el proceso nocturno (CRON_SECRET) o un admin. Por defecto: del 1° del mes (o del anterior, los primeros 5 días) al fin del mes siguiente.
// Se puede pedir otro rango con ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD. Necesita INTEGRACION_SECRET (el mismo que ya comparten los dos sistemas).
type Fila = { humand_id: string; nombre: string; fecha: string; estado: string; categoria: string; servicio: string; duracion_min: number; franja_inicio: string | null; franja_fin: string | null; venta_neta: number }

const iso = (d: Date) => d.toISOString().slice(0, 10)
function rangoPorDefecto() {
  const hoy = new Date(Date.now() - 3 * 3600e3)
  const a = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - (hoy.getUTCDate() <= 5 ? 1 : 0), 1))
  const b = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 2, 0))
  return { desde: iso(a), hasta: iso(b) }
}

async function correr(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const viaCron = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`
  if (!viaCron) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    if (session.rol !== 'admin' && session.rol !== 'Admin') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
  }
  const secreto = process.env.INTEGRACION_SECRET
  if (!secreto) return NextResponse.json({ error: 'Falta INTEGRACION_SECRET' }, { status: 500 })
  const p = req.nextUrl.searchParams, def = rangoPorDefecto()
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(p.get('desde') ?? '') ? p.get('desde')! : def.desde
  const hasta = /^\d{4}-\d{2}-\d{2}$/.test(p.get('hasta') ?? '') ? p.get('hasta')! : def.hasta
  const url = (process.env.BCO_TURNOS_URL || 'https://bco-turnos.vercel.app').replace(/\/$/, '')
  const r = await fetch(`${url}/api/integraciones/humand/citas?desde=${desde}&hasta=${hasta}`, { headers: { Authorization: `Bearer ${secreto}` }, cache: 'no-store', signal: AbortSignal.timeout(50000) })
  const j = await r.json().catch(() => null) as { filas?: Fila[]; error?: string } | null
  if (!r.ok || !j?.filas) return NextResponse.json({ error: j?.error ?? `BCO Turnos respondió ${r.status}` }, { status: 502 })

  const { data: usuarios } = await supabaseAdmin.from('usuarios').select('id')
  const existen = new Set((usuarios ?? []).map(u => u.id))
  const records = j.filas.filter(f => existen.has(f.humand_id)).map(f => ({
    usuario_id: f.humand_id, nombre_empleada: f.nombre, fecha: f.fecha, estado: f.estado, categoria: f.categoria, servicio: f.servicio,
    duracion_min: f.duracion_min, franja_inicio: f.franja_inicio, franja_fin: f.franja_fin, venta_neta: f.venta_neta,
  }))
  // BCO Turnos es la fuente: se reemplaza todo el rango
  const { error: delErr } = await supabaseAdmin.from('fresha_citas_detalle').delete().gte('fecha', desde).lte('fecha', hasta)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
  for (let i = 0; i < records.length; i += 500) {
    const { error } = await supabaseAdmin.from('fresha_citas_detalle').insert(records.slice(i, i + 500))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  await supabaseAdmin.from('configuracion').upsert({ clave: 'ultima_importacion_citas_fresha', valor: { fecha: new Date().toISOString(), origen: 'bco_turnos' } }, { onConflict: 'clave' })
  // Los informes de esos meses se vuelven a calcular
  const meses: string[] = []
  for (let m = desde.slice(0, 7); m <= hasta.slice(0, 7);) { meses.push(m); const [y, mm] = m.split('-').map(Number); m = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}` }
  await supabaseAdmin.from('informes_cache').delete().in('mes', meses)
  return NextResponse.json({ ok: records.length, desde, hasta, sinUsuario: j.filas.length - records.length })
}

export const POST = correr
export const GET = correr
export const maxDuration = 60
