import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { DIA_CORTE_DEFAULT, CierresMap } from '@/lib/adelantos'

const CLAVE = 'adelantos_cierres'

async function leer(): Promise<CierresMap> {
  const { data } = await supabaseAdmin
    .from('configuracion')
    .select('valor')
    .eq('clave', CLAVE)
    .maybeSingle()
  const v = data?.valor
  return (v && typeof v === 'object') ? (v as CierresMap) : {}
}

// GET: mapa de cierres por período { "YYYY-MM": día }. Lo necesita cualquier
// usuario logueado para calcular bien a qué período cae cada adelanto.
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  return NextResponse.json(await leer())
}

// PUT: fija (o quita) el día de cierre de un período. Solo admin.
// body: { periodo: "YYYY-MM", dia: number | null }  — dia null o 8 => vuelve al default.
export async function PUT(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { periodo?: string; dia?: number | null }
  const periodo = body.periodo
  if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) {
    return NextResponse.json({ error: 'Período inválido' }, { status: 400 })
  }
  const dia = body.dia
  if (dia != null && (typeof dia !== 'number' || dia < 1 || dia > 28)) {
    return NextResponse.json({ error: 'El día de cierre debe estar entre 1 y 28' }, { status: 400 })
  }

  const cierres = await leer()
  // Guardar solo los que difieren del default, para mantener el mapa chico.
  if (dia == null || dia === DIA_CORTE_DEFAULT) delete cierres[periodo]
  else cierres[periodo] = dia

  const { error } = await supabaseAdmin
    .from('configuracion')
    .upsert({ clave: CLAVE, valor: cierres }, { onConflict: 'clave' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, cierres })
}
