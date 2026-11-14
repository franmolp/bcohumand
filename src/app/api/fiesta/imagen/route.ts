import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

// Foto principal de un artículo de Wikipedia (para la trivia de ejemplo). Wikimedia permite usar sus
// imágenes enlazándolas directo. Si la original es muy grande se pide una versión de 1280 px.
export async function GET(req: NextRequest) {
  const s = await getSession()
  if (!s || (s.rol !== 'admin' && s.rol !== 'Admin')) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
  const titulo = req.nextUrl.searchParams.get('titulo')?.trim()
  if (!titulo) return NextResponse.json({ error: 'Falta el título' }, { status: 400 })
  const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titulo)}`, {
    headers: { 'User-Agent': 'BCOHumand-Fiesta/1.0 (trivia de aniversario Beauty Co.)', Accept: 'application/json' },
    cache: 'no-store', signal: AbortSignal.timeout(10000),
  }).catch(() => null)
  if (!r?.ok) return NextResponse.json({ error: 'No se pudo buscar en Wikipedia' }, { status: 502 })
  const d = await r.json() as { originalimage?: { source: string; width: number }; thumbnail?: { source: string } }
  const url = d.originalimage && d.originalimage.width <= 2000 ? d.originalimage.source
    : d.thumbnail?.source ? d.thumbnail.source.replace(/\/\d+px-/, '/1280px-') : d.originalimage?.source
  if (!url) return NextResponse.json({ error: 'El artículo no tiene imagen' }, { status: 404 })
  return NextResponse.json({ url })
}
