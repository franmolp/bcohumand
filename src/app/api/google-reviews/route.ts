import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'

type SerpReview = {
  user?: { name?: string; thumbnail?: string }
  rating?: number
  date?: string
  snippet?: string
}

export type GoogleReview = {
  author: string
  avatar: string | null
  rating: number
  text: string
  date: string
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

const fetchReviewsFromSerpAPI = unstable_cache(
  async (): Promise<GoogleReview[]> => {
    const key = process.env.SERPAPI_KEY
    if (!key) return []

    const dataId = await fetchDataId(key)
    if (!dataId) return []

    const url = `https://serpapi.com/search.json?engine=google_maps_reviews&data_id=${dataId}&hl=es&api_key=${key}`
    const res = await fetch(url)
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
  },
  ['google-reviews'],
  { revalidate: 3600 }
)

export async function GET() {
  try {
    const reviews = await fetchReviewsFromSerpAPI()
    const shuffled = [...reviews].sort(() => Math.random() - 0.5)
    return NextResponse.json({ reviews: shuffled })
  } catch {
    return NextResponse.json({ reviews: [] })
  }
}
