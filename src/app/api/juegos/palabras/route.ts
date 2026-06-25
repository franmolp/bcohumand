import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { data, error } = await supabaseAdmin
    .from('juegos_palabras')
    .select('id, palabra, fecha')
    .order('fecha', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { palabra, fecha } = await request.json()
  if (!palabra || !fecha) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })

  const clean = palabra.toUpperCase().trim()
  if (!/^[A-ZÑ]{2,15}$/.test(clean))
    return NextResponse.json({ error: 'La palabra debe tener 2–15 letras (A-Z, Ñ)' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('juegos_palabras')
    .insert({ palabra: clean, fecha, creado_por: session.id })
    .select('id, palabra, fecha')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
