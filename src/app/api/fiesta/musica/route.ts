import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

// Buscador de canciones para la trivia musical: usa la API pública de búsqueda de Apple (iTunes),
// que devuelve un fragmento de 30 s de cada tema (previewUrl). Solo admin.
export async function GET(req: NextRequest) {
  const s = await getSession()
  if (!s || (s.rol !== 'admin' && s.rol !== 'Admin')) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json([])
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&country=AR&limit=10`
  const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) }).catch(() => null)
  if (!r?.ok) return NextResponse.json({ error: 'No se pudo buscar en Apple Music' }, { status: 502 })
  const d = await r.json() as { results?: { trackName: string; artistName: string; previewUrl?: string; artworkUrl100?: string }[] }
  return NextResponse.json((d.results ?? []).filter(x => x.previewUrl).map(x => ({
    nombre: x.trackName, artista: x.artistName, preview: x.previewUrl, artwork: x.artworkUrl100?.replace('100x100', '300x300'),
  })))
}
