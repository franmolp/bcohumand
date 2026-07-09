import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

interface BrutaFila { anio: number; mes: number; nombre: string; bruto: number }

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('liquidaciones_bruto')
    .select('anio, mes, bruto')
    .eq('usuario_id', session.id)
    .order('anio', { ascending: true })
    .order('mes', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!['admin', 'Admin'].includes(session.rol)) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const body = await request.json().catch(() => ({})) as { filas?: BrutaFila[] }
  const filas = body.filas
  if (!Array.isArray(filas) || !filas.length) return NextResponse.json({ error: 'Sin datos' }, { status: 400 })

  const nombres = [...new Set(filas.map(f => f.nombre))]
  const { data: usuarios } = await supabaseAdmin.from('usuarios').select('id, nombre').in('nombre', nombres)

  const norm = (s: string) => s.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const userMap = new Map((usuarios ?? []).map((u: { id: string; nombre: string }) => [norm(u.nombre), u.id]))

  const records = filas.map(f => ({
    anio: f.anio,
    mes: f.mes,
    nombre_excel: f.nombre,
    usuario_id: (userMap.get(norm(f.nombre)) as string) ?? null,
    bruto: Math.round(f.bruto),
  }))

  const { error } = await supabaseAdmin
    .from('liquidaciones_bruto')
    .upsert(records, { onConflict: 'anio,mes,nombre_excel' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: records.length })
}
