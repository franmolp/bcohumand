import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

type Estado = 'correct' | 'present' | 'absent'

function sinTildes(s: string): string {
  return s
    .replace(/[ÁÀÂÄ]/g, 'A')
    .replace(/[ÉÈÊË]/g, 'E')
    .replace(/[ÍÌÎÏ]/g, 'I')
    .replace(/[ÓÒÔÖ]/g, 'O')
    .replace(/[ÚÙÛÜ]/g, 'U')
}

function calcularResultado(guess: string, target: string): Estado[] {
  const n = target.length
  const result: Estado[] = Array(n).fill('absent')
  const t = sinTildes(target).split('')
  const g = sinTildes(guess).split('')
  for (let i = 0; i < n; i++) {
    if (g[i] === t[i]) { result[i] = 'correct'; t[i] = '#'; g[i] = '*' }
  }
  for (let i = 0; i < n; i++) {
    if (g[i] === '*') continue
    const idx = t.indexOf(g[i])
    if (idx !== -1) { result[i] = 'present'; t[idx] = '#' }
  }
  return result
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { palabra } = await request.json()
  if (!palabra || typeof palabra !== 'string')
    return NextResponse.json({ error: 'Palabra inválida' }, { status: 400 })

  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  const guess = sinTildes(palabra.toUpperCase().trim())

  if (!/^[A-ZÑ]+$/.test(guess))
    return NextResponse.json({ error: 'Solo letras A-Z y Ñ' }, { status: 400 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'

  const { data: palabraHoy } = await supabaseAdmin
    .from('juegos_palabras')
    .select('id, palabra')
    .eq('fecha', hoy)
    .single()

  if (!palabraHoy)
    return NextResponse.json({ error: 'No hay palabra para hoy' }, { status: 404 })

  const target = palabraHoy.palabra.toUpperCase()

  if (guess.length !== target.length)
    return NextResponse.json({ error: `La palabra debe tener ${target.length} letras` }, { status: 400 })

  // Admins pueden jugar pero no se guardan resultados
  if (isAdmin) {
    const resultado = calcularResultado(guess, target)
    const resuelta = resultado.every(r => r === 'correct')
    return NextResponse.json({
      resultado,
      resuelta,
      gameOver: resuelta,
      intentosUsados: 0,
      palabraCorrecta: resuelta ? target : null,
    })
  }

  // Get or create partida
  let { data: partida } = await supabaseAdmin
    .from('juegos_partidas')
    .select('id, intentos, resuelta, created_at')
    .eq('usuario_id', session.id)
    .eq('juego', 'wordle')
    .eq('fecha', hoy)
    .maybeSingle()

  if (partida && partida.resuelta === true)
    return NextResponse.json({ error: 'Ya terminaste el juego de hoy' }, { status: 400 })

  if (!partida) {
    const { data: nueva } = await supabaseAdmin
      .from('juegos_partidas')
      .insert({ usuario_id: session.id, juego: 'wordle', fecha: hoy, intentos: 0, tiempo_seg: 0, resuelta: false })
      .select('id, intentos, resuelta, created_at')
      .single()
    partida = nueva
  }

  if (!partida) return NextResponse.json({ error: 'Error interno' }, { status: 500 })

  const resultado = calcularResultado(guess, target)
  const nuevoOrden = partida.intentos + 1
  const resuelta = resultado.every(r => r === 'correct')
  const tiempoSeg = Math.round((Date.now() - new Date(partida.created_at).getTime()) / 1000)

  await supabaseAdmin.from('juegos_intentos').insert({
    partida_id: partida.id,
    orden: nuevoOrden,
    palabra: guess,
    resultado,
  })

  const gameOver = resuelta
  await supabaseAdmin
    .from('juegos_partidas')
    .update({
      intentos: nuevoOrden,
      resuelta,
      tiempo_seg: gameOver ? tiempoSeg : 0,
    })
    .eq('id', partida.id)

  return NextResponse.json({
    resultado,
    resuelta,
    gameOver,
    intentosUsados: nuevoOrden,
    palabraCorrecta: gameOver ? target : null,
  })
}
