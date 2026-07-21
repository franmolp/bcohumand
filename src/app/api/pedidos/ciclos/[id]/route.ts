import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

function nombreCicloAuto(): string {
  const hoy = new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'numeric', year: 'numeric' })
  return `Pedido desde ${hoy}`
}

function hoyISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const { data, error } = await supabaseAdmin
    .from('pedidos_ciclos')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const { estado, nombre } = body

  const ESTADOS_VALIDOS = ['abierto', 'cerrado', 'enviado']
  const update: Record<string, unknown> = {}
  if (estado && ESTADOS_VALIDOS.includes(estado)) update.estado = estado
  if (nombre?.trim()) update.nombre = nombre.trim()

  if (estado === 'cerrado' || estado === 'enviado') {
    update.cerrado_por = session.nombre
    update.cerrado_en = new Date().toISOString()
  }
  if (estado === 'abierto') {
    update.cerrado_por = null
    update.cerrado_en = null
  }

  if (!Object.keys(update).length) {
    return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('pedidos_ciclos')
    .update(update)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Al cerrar/enviar: verificar si ya hay un ciclo abierto y si no, crear uno nuevo
  if (estado === 'cerrado' || estado === 'enviado') {
    const { data: yaAbierto } = await supabaseAdmin
      .from('pedidos_ciclos')
      .select('id')
      .eq('estado', 'abierto')
      .limit(1)

    if (!yaAbierto?.length) {
      const hoy = hoyISO()
      await supabaseAdmin.from('pedidos_ciclos').insert({
        nombre: nombreCicloAuto(),
        fecha_apertura: hoy,
        fecha_cierre: hoy,
        estado: 'abierto',
      })
    }
  }

  return NextResponse.json({ ok: true })
}
