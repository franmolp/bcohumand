import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export type { GoogleReview } from '@/types/google-reviews'

type SerpReview = {
  user?: { name?: string; thumbnail?: string }
  rating?: number
  date?: string
  snippet?: string
}

export async function GET() {
  // Camino feliz: leer de Supabase, cero llamadas a SerpAPI
  const { data: rows } = await supabaseAdmin
    .from('google_reviews')
    .select('author, avatar, rating, text, date')

  if (rows && rows.length > 0) {
    const shuffled = [...rows].sort(() => Math.random() - 0.5)
    return NextResponse.json({ reviews: shuffled })
  }

  // Fallback cuando la tabla está vacía (primer deploy): llama a SerpAPI y puebla la tabla
  const key = process.env.SERPAPI_KEY
  if (!key) return NextResponse.json({ reviews: [] })

  try {
    let dataId = process.env.GOOGLE_PLACE_DATA_ID ?? null
    if (!dataId) {
      const url = `https://serpapi.com/search.json?engine=google_maps&q=Beauty+Co+Centro+de+Belleza+y+Peluqueria+La+Plata&ll=@-34.9195,-57.9545,13z&api_key=${key}`
      const r = await fetch(url)
      if (r.ok) {
        const d = await r.json()
        dataId = d.local_results?.[0]?.data_id ?? null
      }
    }
    if (!dataId) return NextResponse.json({ reviews: [] })

    const url = `https://serpapi.com/search.json?engine=google_maps_reviews&data_id=${dataId}&hl=es&sort_by=newestFirst&api_key=${key}`
    const res = await fetch(url)
    if (!res.ok) return NextResponse.json({ reviews: [] })

    const data = await res.json()
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

    if (reviews.length > 0) {
      await supabaseAdmin.from('google_reviews').delete().gt('id', 0)
      await supabaseAdmin.from('google_reviews').insert(reviews)
    }

    const shuffled = [...reviews].sort(() => Math.random() - 0.5)
    return NextResponse.json({ reviews: shuffled })
  } catch {
    return NextResponse.json({ reviews: [] })
  }
}
