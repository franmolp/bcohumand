import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const hoy = new Date().toLocaleDateString('en-CA')

  const { data: palabraHoy } = await supabaseAdmin
    .from('juegos_palabras')
    .select('id, palabra, pista')
    .eq('fecha', hoy)
    .single()

  const { data: partida } = await supabaseAdmin
    .from('juegos_partidas')
    .select('id, intentos, resuelta, created_at')
    .eq('usuario_id', session.id)
    .eq('juego', 'wordle')
    .eq('fecha', hoy)
    .maybeSingle()

  const largo = palabraHoy?.palabra?.length ?? 5
  const gameOver = partida ? partida.resuelta === true : false

  if (partida) {
    const { data: intentos } = await supabaseAdmin
      .from('juegos_intentos')
      .select('orden, palabra, resultado')
      .eq('partida_id', partida.id)
      .order('orden')

    return NextResponse.json({
      tieneHoy: !!palabraHoy,
      largo,
      pista: palabraHoy?.pista ?? null,
      jugado: gameOver,
      resuelta: gameOver ? partida.resuelta : null,
      intentos: intentos ?? [],
      palabraCorrecta: gameOver ? (palabraHoy?.palabra ?? null) : null,
    })
  }

  return NextResponse.json({
    tieneHoy: !!palabraHoy,
    largo,
    pista: palabraHoy?.pista ?? null,
    jugado: false,
    resuelta: null,
    intentos: [],
    palabraCorrecta: null,
  })
}
