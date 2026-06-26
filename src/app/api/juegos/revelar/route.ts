import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })

  const { data: palabraHoy } = await supabaseAdmin
    .from('juegos_palabras')
    .select('id, palabra, pista')
    .eq('fecha', hoy)
    .single()

  if (!palabraHoy) return NextResponse.json({ error: 'No hay palabra para hoy' }, { status: 404 })

  const pista = palabraHoy.pista ?? null
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'

  // Admins pueden jugar pero no se guarda la partida
  if (isAdmin) return NextResponse.json({ ok: true, yaRevelado: false, pista })

  // Crear partida solo si no existe — el created_at queda como momento de revelación
  const { data: existente } = await supabaseAdmin
    .from('juegos_partidas')
    .select('id, resuelta')
    .eq('usuario_id', session.id)
    .eq('juego', 'wordle')
    .eq('fecha', hoy)
    .maybeSingle()

  if (existente) return NextResponse.json({ ok: true, yaRevelado: true, pista })

  await supabaseAdmin
    .from('juegos_partidas')
    .insert({ usuario_id: session.id, juego: 'wordle', fecha: hoy, intentos: 0, tiempo_seg: 0, resuelta: false })

  return NextResponse.json({ ok: true, yaRevelado: false, pista })
}
