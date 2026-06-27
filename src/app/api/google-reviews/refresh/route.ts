import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type SerpReview = {
  user?: { name?: string; thumbnail?: string }
  rating?: number
  date?: string
  snippet?: string
}

async function fetchDataId(key: string): Promise<string | null> {
  const dataId = process.env.GOOGLE_PLACE_DATA_ID
  if (dataId) return dataId
  const url = `https://serpapi.com/search.json?engine=google_maps&q=Beauty+Co+Centro+de+Belleza+y+Peluqueria+La+Plata&ll=@-34.9195,-57.9545,13z&api_key=${key}`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  return (data.local_results?.[0]?.data_id as string) ?? null
}

export async function GET() {

  const key = process.env.SERPAPI_KEY
  if (!key) return NextResponse.json({ error: 'no_key' }, { status: 500 })

  const dataId = await fetchDataId(key)
  if (!dataId) return NextResponse.json({ error: 'no_place' }, { status: 500 })

  const url = `https://serpapi.com/search.json?engine=google_maps_reviews&data_id=${dataId}&hl=es&sort_by=newestFirst&api_key=${key}`
  const res = await fetch(url)
  if (!res.ok) return NextResponse.json({ error: 'serpapi_error' }, { status: 500 })

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

  if (reviews.length === 0) return NextResponse.json({ updated: 0 })

  // Reemplaza todas las reseñas con el snapshot fresco
  await supabaseAdmin.from('google_reviews').delete().gt('id', 0)
  const { error } = await supabaseAdmin.from('google_reviews').insert(reviews)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ updated: reviews.length })
}
