import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { FiestaConfig, Pregunta, Trivia } from '@/lib/fiesta'

// Configuración de la fiesta de aniversario (código secreto, encendida/apagada y preguntas de la
// trivia). Se guarda en `configuracion` (clave 'fiesta'), así no hace falta ninguna tabla nueva.
const CLAVE = 'fiesta'
const nuevoCodigo = () => Math.random().toString(36).slice(2, 8)

async function esAdmin() {
  const s = await getSession()
  return !!s && (s.rol === 'admin' || s.rol === 'Admin')
}

async function leer(): Promise<FiestaConfig> {
  const { data } = await supabaseAdmin.from('configuracion').select('valor').eq('clave', CLAVE).maybeSingle()
  const v = data?.valor as (Partial<FiestaConfig> & { preguntas?: Pregunta[] }) | null
  // Antes había una sola lista de preguntas: se convierte en "Trivia 1"
  const trivias: Trivia[] = Array.isArray(v?.trivias) ? v!.trivias
    : Array.isArray(v?.preguntas) && v!.preguntas.length ? [{ id: 't1', nombre: 'Trivia 1', preguntas: v!.preguntas }] : []
  return { codigo: v?.codigo || '', activa: v?.activa ?? true, trivias }
}
async function guardar(c: FiestaConfig) {
  const { error } = await supabaseAdmin.from('configuracion').upsert({ clave: CLAVE, valor: c }, { onConflict: 'clave' })
  if (error) throw new Error(error.message)
}

export async function GET() {
  if (!(await esAdmin())) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
  const c = await leer()
  if (!c.codigo) { c.codigo = nuevoCodigo(); await guardar(c) }
  return NextResponse.json(c)
}

export async function PUT(req: NextRequest) {
  if (!(await esAdmin())) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
  const body = await req.json().catch(() => ({})) as { activa?: boolean; trivias?: Trivia[]; nuevoCodigo?: boolean }
  const c = await leer()
  if (typeof body.activa === 'boolean') c.activa = body.activa
  if (Array.isArray(body.trivias)) c.trivias = body.trivias
  if (body.nuevoCodigo || !c.codigo) c.codigo = nuevoCodigo()
  try { await guardar(c) } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }) }
  return NextResponse.json(c)
}
