import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

function puntosPorIntentos(intentos: number, resuelta: boolean) {
  if (!resuelta) return 0
  return Math.max(1, 11 - intentos)
}

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const tipo = request.nextUrl.searchParams.get('tipo') ?? 'hoy'
  const tz = 'America/Argentina/Buenos_Aires'
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: tz })
  const ayerDate = new Date(); ayerDate.setDate(ayerDate.getDate() - 1)
  const ayer = ayerDate.toLocaleDateString('en-CA', { timeZone: tz })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  const adminIds = new Set(isAdmin ? [session.id] : [])

  if (tipo === 'hoy') {
    const { data: partidas } = await supabaseAdmin
      .from('juegos_partidas')
      .select('usuario_id, intentos, tiempo_seg, resuelta')
      .eq('fecha', hoy)
      .eq('juego', 'wordle')

    if (!partidas?.length) return NextResponse.json({ ranking: [], jugando: 0 })

    const partidasFiltradas = partidas.filter(p => !adminIds.has(p.usuario_id))
    if (!partidasFiltradas.length) return NextResponse.json({ ranking: [], jugando: 0 })

    const ids = [...new Set(partidasFiltradas.map(p => p.usuario_id))]
    const { data: usuarios } = await supabaseAdmin
      .from('usuarios')
      .select('id, nombre')
      .in('id', ids)

    const nombreMap = new Map((usuarios ?? []).map(u => [u.id, u.nombre]))

    const ranking = partidasFiltradas
      .filter(p => p.resuelta === true)
      .map(p => ({
        nombre: nombreMap.get(p.usuario_id) ?? '—',
        intentos: p.intentos,
        tiempo_seg: p.tiempo_seg,
        resuelta: p.resuelta,
      }))
      .sort((a, b) => {
        if (a.intentos !== b.intentos) return a.intentos - b.intentos
        return a.tiempo_seg - b.tiempo_seg
      })

    const jugando = partidasFiltradas.filter(p => p.resuelta === false).length
    return NextResponse.json({ ranking, jugando })
  }

  if (tipo === 'ayer') {
    const { data: palabraAyer } = await supabaseAdmin
      .from('juegos_palabras')
      .select('palabra')
      .eq('fecha', ayer)
      .single()

    const { data: partidas } = await supabaseAdmin
      .from('juegos_partidas')
      .select('usuario_id, intentos, tiempo_seg, resuelta')
      .eq('fecha', ayer)
      .eq('juego', 'wordle')
      .eq('resuelta', true)

    if (!partidas?.length) return NextResponse.json({ ranking: [], palabra: palabraAyer?.palabra ?? null })

    const partidasFiltradas = partidas.filter(p => !adminIds.has(p.usuario_id))

    const ids = [...new Set(partidasFiltradas.map(p => p.usuario_id))]
    const { data: usuarios } = await supabaseAdmin
      .from('usuarios')
      .select('id, nombre')
      .in('id', ids)

    const nombreMap = new Map((usuarios ?? []).map(u => [u.id, u.nombre]))

    const ranking = partidasFiltradas
      .map(p => ({
        nombre: nombreMap.get(p.usuario_id) ?? '—',
        intentos: p.intentos,
        tiempo_seg: p.tiempo_seg,
        resuelta: p.resuelta,
      }))
      .sort((a, b) => {
        if (a.intentos !== b.intentos) return a.intentos - b.intentos
        return a.tiempo_seg - b.tiempo_seg
      })

    return NextResponse.json({ ranking, palabra: palabraAyer?.palabra ?? null })
  }

  if (tipo === 'mes') {
    const now = new Date()
    const inicioMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

    const [{ data: partidas }, { count: totalPalabras }] = await Promise.all([
      supabaseAdmin
        .from('juegos_partidas')
        .select('usuario_id, intentos, resuelta')
        .eq('juego', 'wordle')
        .gte('fecha', inicioMes)
        .lte('fecha', hoy)
        .eq('resuelta', true),
      supabaseAdmin
        .from('juegos_palabras')
        .select('id', { count: 'exact', head: true })
        .gte('fecha', inicioMes)
        .lte('fecha', hoy),
    ])

    if (!partidas?.length) return NextResponse.json({ ranking: [], totalPalabras: totalPalabras ?? 0 })

    const partidasFiltradas = partidas.filter(p => !adminIds.has(p.usuario_id))

    const ids = [...new Set(partidasFiltradas.map(p => p.usuario_id))]
    const { data: usuarios } = await supabaseAdmin
      .from('usuarios')
      .select('id, nombre')
      .in('id', ids)

    const nombreMap = new Map((usuarios ?? []).map(u => [u.id, u.nombre]))

    const acum = new Map<string, { nombre: string; puntos: number; partidas: number; resueltas: number }>()
    for (const p of partidasFiltradas) {
      const nombre = nombreMap.get(p.usuario_id) ?? '—'
      const prev = acum.get(p.usuario_id) ?? { nombre, puntos: 0, partidas: 0, resueltas: 0 }
      acum.set(p.usuario_id, {
        nombre,
        puntos: prev.puntos + puntosPorIntentos(p.intentos, p.resuelta),
        partidas: prev.partidas + 1,
        resueltas: prev.resueltas + (p.resuelta ? 1 : 0),
      })
    }

    const ranking = [...acum.values()].sort((a, b) => b.puntos - a.puntos)
    return NextResponse.json({ ranking, totalPalabras: totalPalabras ?? 0 })
  }

  return NextResponse.json({ error: 'tipo inválido' }, { status: 400 })
}
