import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'

// GET - Obtener un empleado
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data, error } = await supabase
    .from('usuarios')
    .select('id, usuario, reloj, nombre, email, estado_cuenta, telefono, dni, fecha_nacimiento, ultimo_login, fecha_creacion, equipo:equipos(id,nombre), rol:roles(id,nombre)')
    .eq('id', id)
    .single()

  if (error) {
    return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 })
  }

  return NextResponse.json(data)
}

// PUT - Actualizar empleado
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const body = await request.json()
    const { nombre, email, equipo_id, rol_id, telefono, dni, fecha_nacimiento, reloj, password, estado_cuenta, usuario } = body

    const updates: Record<string, unknown> = {}
    if (nombre !== undefined) updates.nombre = nombre
    if (email !== undefined) updates.email = email.toLowerCase().trim()
    if (equipo_id !== undefined) updates.equipo_id = equipo_id
    if (rol_id !== undefined) updates.rol_id = rol_id
    if (telefono !== undefined) updates.telefono = telefono
    if (dni !== undefined) updates.dni = dni
    if (fecha_nacimiento !== undefined) updates.fecha_nacimiento = fecha_nacimiento || null
    if (reloj !== undefined) updates.reloj = reloj
    if (estado_cuenta !== undefined) updates.estado_cuenta = estado_cuenta
    if (usuario !== undefined) updates.usuario = usuario.toLowerCase().trim()

    if (password) {
      updates.password_hash = await bcrypt.hash(password, 10)
      updates.salt = 'bcrypt'
    }

    const { data, error } = await supabase
      .from('usuarios')
      .update(updates)
      .eq('id', id)
      .select('id, usuario, reloj, nombre, email, estado_cuenta, telefono, dni, fecha_nacimiento, equipo:equipos(id,nombre), rol:roles(id,nombre)')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// DELETE - Eliminar empleado (hard delete, usar con cuidado)
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { error } = await supabase
    .from('usuarios')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
