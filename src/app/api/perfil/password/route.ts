import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { current, nueva, confirmar } = await request.json()

  if (!current || !nueva || !confirmar) {
    return NextResponse.json({ error: 'Completá todos los campos' }, { status: 400 })
  }
  if (nueva.length < 6) {
    return NextResponse.json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' }, { status: 400 })
  }
  if (nueva !== confirmar) {
    return NextResponse.json({ error: 'Las contraseñas nuevas no coinciden' }, { status: 400 })
  }

  // Fetch current hash
  const { data: user, error } = await supabase
    .from('usuarios')
    .select('password_hash')
    .eq('id', session.id)
    .single()

  if (error || !user) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
  }

  const valid = await bcrypt.compare(current, user.password_hash)
  if (!valid) {
    return NextResponse.json({ error: 'La contraseña actual es incorrecta' }, { status: 400 })
  }

  const newHash = await bcrypt.hash(nueva, 10)

  const { error: updateError } = await supabase
    .from('usuarios')
    .update({ password_hash: newHash, intentos_fallidos: 0 })
    .eq('id', session.id)

  if (updateError) {
    return NextResponse.json({ error: 'Error al actualizar la contraseña' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
