import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export type { GoogleReview } from '@/types/google-reviews'

export async function GET() {
  // Lee de Supabase — cero llamadas a SerpAPI en el camino feliz
  const { data: rows } = await supabaseAdmin
    .from('google_reviews')
    .select('author, avatar, rating, text, date')

  if (rows && rows.length > 0) {
    const shuffled = [...rows].sort(() => Math.random() - 0.5)
    return NextResponse.json({ reviews: shuffled })
  }

  // Fallback solo si la tabla está vacía (primer deploy / tabla recién creada)
  const key = process.env.SERPAPI_KEY
  if (!key) return NextResponse.json({ reviews: [] })

  try {
    const dataId = process.env.GOOGLE_PLACE_DATA_ID
    if (!dataId) return NextResponse.json({ reviews: [] })

    const url = `https://serpapi.com/search.json?engine=google_maps_reviews&data_id=${dataId}&hl=es&sort_by=newestFirst&api_key=${key}`
    const res = await fetch(url)
    if (!res.ok) return NextResponse.json({ reviews: [] })

    const data = await res.json()
    type SerpReview = { user?: { name?: string; thumbnail?: string }; rating?: number; date?: string; snippet?: string }
    const raw: SerpReview[] = data.reviews ?? data.reviews_results?.reviews ?? []
    const reviews = raw
      .filter(r => (r.rating ?? 0) >= 4 && r.snippet?.trim())
      .map(r => ({
        author: r.user?.name ?? 'Cliente',
        avatar: r.user?.thumbnail ?? null,
        rating: r.rating ?? 5,
        text: r.snippet ?? '',
        date: r.date ?? '',
      }))

    const shuffled = [...reviews].sort(() => Math.random() - 0.5)
    return NextResponse.json({ reviews: shuffled })
  } catch {
    return NextResponse.json({ reviews: [] })
  }
}
