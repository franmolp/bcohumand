import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

type SerpReview = {
  user?: { name?: string; thumbnail?: string }
  rating?: number
  date?: string
  snippet?: string
}

export type { GoogleReview } from '@/types/google-reviews'

async function fetchDataId(key: string): Promise<string | null> {
  const dataId = process.env.GOOGLE_PLACE_DATA_ID
  if (dataId) return dataId

  const url = `https://serpapi.com/search.json?engine=google_maps&q=Beauty+Co+Centro+de+Belleza+y+Peluqueria+La+Plata&ll=@-34.9195,-57.9545,13z&api_key=${key}`
  const res = await fetch(url, { next: { revalidate: 86400 } })
  if (!res.ok) return null
  const data = await res.json()
  return (data.local_results?.[0]?.data_id as string) ?? null
}

async function fetchReviews(key: string, dataId: string): Promise<GoogleReview[]> {
  const url = `https://serpapi.com/search.json?engine=google_maps_reviews&data_id=${dataId}&hl=es&api_key=${key}`
  const res = await fetch(url, { next: { revalidate: 3600 } })
  if (!res.ok) return []
  const data = await res.json()

  const raw: SerpReview[] = data.reviews ?? data.reviews_results?.reviews ?? []
  return raw
    .filter(r => (r.rating ?? 0) >= 3)
    .map(r => ({
      author: r.user?.name ?? 'Cliente',
      avatar: r.user?.thumbnail ?? null,
      rating: r.rating ?? 5,
      text: r.snippet ?? '',
      date: r.date ?? '',
    }))
}

export async function GET() {
  const key = process.env.SERPAPI_KEY
  if (!key) return NextResponse.json({ reviews: [], error: 'no_key' })

  try {
    const dataId = await fetchDataId(key)
    if (!dataId) return NextResponse.json({ reviews: [], error: 'no_place' })

    const reviews = await fetchReviews(key, dataId)
    const shuffled = [...reviews].sort(() => Math.random() - 0.5)
    return NextResponse.json({ reviews: shuffled })
  } catch (e) {
    console.error('[google-reviews]', e)
    return NextResponse.json({ reviews: [], error: String(e) })
  }
}
