import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

const tz = 'America/Argentina/Buenos_Aires'

async function checkAdmin() {
  const session = await getSession()
  if (!session) return null
  return (session.rol === 'admin' || session.rol === 'Admin') ? session : null
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await checkAdmin()
  if (!session) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { id } = await params
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: tz })

  const { data: existente } = await supabaseAdmin
    .from('juegos_palabras')
    .select('fecha')
    .eq('id', id)
    .single()

  if (existente && existente.fecha <= hoy)
    return NextResponse.json({ error: 'No se puede editar una palabra pasada o de hoy' }, { status: 400 })

  const { palabra, fecha, pista } = await request.json()
  if (!palabra || !fecha) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })

  const clean = palabra.toUpperCase().trim()
  if (!/^[A-ZÑ]{2,15}$/.test(clean))
    return NextResponse.json({ error: 'La palabra debe tener 2–15 letras (A-Z, Ñ)' }, { status: 400 })

  if (fecha <= hoy)
    return NextResponse.json({ error: 'La fecha debe ser futura' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('juegos_palabras')
    .update({ palabra: clean, fecha, pista: pista?.trim() || null })
    .eq('id', id)
    .select('id, palabra, fecha, pista')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await checkAdmin()
  if (!session) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { id } = await params
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: tz })

  const { data: palabra } = await supabaseAdmin
    .from('juegos_palabras')
    .select('fecha')
    .eq('id', id)
    .single()

  if (palabra && palabra.fecha <= hoy)
    return NextResponse.json({ error: 'No se puede eliminar una palabra pasada o de hoy' }, { status: 400 })

  const { error } = await supabaseAdmin.from('juegos_palabras').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
