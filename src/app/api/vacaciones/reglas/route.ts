import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { leerReglas, CLAVE_REGLAS, type ReglasVacaciones, type GrupoCupo, type SemanaCerrada } from '@/lib/vacaciones-cupos'

export const dynamic = 'force-dynamic'

// Reglas de vacaciones (Solicitudes → Ajustes): duraciones, hasta cuándo se puede pedir, cupos por grupo y semanas cerradas
async function gestiona() {
  const s = await getSession()
  return !!s && ['admin', 'Admin', 'HR'].includes(s.rol)
}
const fecha = (f: unknown) => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : null

export async function GET() {
  if (!(await gestiona())) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  return NextResponse.json(await leerReglas())
}

export async function PUT(req: NextRequest) {
  if (!(await gestiona())) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as Partial<ReglasVacaciones>
  const semanas = [...new Set((Array.isArray(b.semanas) ? b.semanas : []).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 6))].sort((x, y) => x - y)
  if (!semanas.length) return NextResponse.json({ error: 'Elegí al menos una duración' }, { status: 400 })
  const grupos: GrupoCupo[] = (Array.isArray(b.grupos) ? b.grupos : []).map((g, i) => ({
    id: String(g.id || `g${Date.now()}${i}`).slice(0, 40),
    nombre: String(g.nombre ?? '').trim().slice(0, 60),
    plural: String(g.plural ?? '').trim().slice(0, 60) || String(g.nombre ?? '').trim().toLowerCase(),
    equipos: [...new Set((Array.isArray(g.equipos) ? g.equipos : []).map(Number).filter(Number.isFinite))],
    cupo: Math.min(20, Math.max(1, Math.round(Number(g.cupo) || 1))),
    por_turno: !!g.por_turno,
  })).filter(g => g.nombre && g.equipos.length)
  const cerradas: SemanaCerrada[] = (Array.isArray(b.cerradas) ? b.cerradas : [])
    .map(c => ({ desde: fecha(c.desde) ?? '', hasta: fecha(c.hasta) ?? fecha(c.desde) ?? '', motivo: String(c.motivo ?? '').trim().slice(0, 80) }))
    .filter(c => c.desde).map(c => c.hasta < c.desde ? { ...c, hasta: c.desde } : c)
    .sort((x, y) => x.desde.localeCompare(y.desde))
  const valor: ReglasVacaciones = { semanas, hasta: fecha(b.hasta), grupos, cerradas }
  const { error } = await supabaseAdmin.from('configuracion').upsert({ clave: CLAVE_REGLAS, valor }, { onConflict: 'clave' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(valor)
}
