import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'

export async function GET() {
  const { data, error } = await supabase.from('equipos').select('id, nombre').order('nombre')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
    const { nombre } = await request.json()
    if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })
    const { data, error } = await supabaseAdmin.from('equipos').insert({ nombre: nombre.trim() }).select().single()
    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Error al crear equipo' }, { status: 500 })
  }
}
