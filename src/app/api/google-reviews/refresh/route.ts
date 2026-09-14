import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getConcursoConfig, armarEmpleadas, detectarEmpleadas, normalizar, esDelMesContest } from '@/lib/concurso-google'

type SerpReview = {
  review_id?: string
  link?: string
  user?: { name?: string; thumbnail?: string }
  rating?: number
  date?: string
  iso_date?: string
  snippet?: string
  details?: Record<string, string> // atributos estructurados (ej. "Estilista": "Claudia : buen trato")
}

// Texto a escanear/mostrar: comentario libre + campos estructurados (Servicios,
// Estilista, etc.). Muchas reseñas no tienen comentario pero completan estos
// campos, y ahí a veces figura el nombre de la empleada ("Estilista: Claudia").
function textoDeReview(r: SerpReview): string {
  const partes: string[] = []
  if (r.snippet?.trim()) partes.push(r.snippet.trim())
  if (r.details && typeof r.details === 'object') {
    for (const [k, v] of Object.entries(r.details)) {
      if (typeof v === 'string' && v.trim()) partes.push(`${k}: ${v.trim()}`)
    }
  }
  return partes.join(' · ')
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

// Trae una página de reseñas (opcionalmente con token de paginación) y el token
// de la siguiente página (null si es la última).
async function fetchPagina(dataId: string, key: string, token: string | null): Promise<{ reviews: SerpReview[]; next: string | null }> {
  let url = `https://serpapi.com/search.json?engine=google_maps_reviews&data_id=${dataId}&hl=es&sort_by=newestFirst&api_key=${key}`
  if (token) url += `&next_page_token=${encodeURIComponent(token)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('serpapi_error')
  const data = await res.json()
  const reviews: SerpReview[] = data.reviews ?? data.reviews_results?.reviews ?? []
  const next = (data.serpapi_pagination?.next_page_token as string) ?? null
  return { reviews, next }
}

// Clave estable por reseña: cada persona deja como mucho una reseña por lugar, así
// que si Google/SerpAPI no da un id, el nombre del autor sirve como clave (y no
// incluye el texto, que puede cambiar si la clienta edita → así tomamos la original).
function reviewKey(r: SerpReview): string {
  return r.review_id || r.link || `autor:${normalizar(r.user?.name ?? '')}`
}

function mapReview(r: SerpReview) {
  return {
    author: r.user?.name ?? 'Cliente',
    avatar: r.user?.thumbnail ?? null,
    rating: r.rating ?? 5,
    text: r.snippet ?? '',
    date: r.date ?? '',
  }
}

// Acumula las reseñas nuevas del mes del concurso (deduplicadas por review_key),
// detectando qué empleadas nombra cada una. Empieza por la página ya traída para
// el carrusel y sigue paginando hasta alcanzar reseñas ya guardadas (o tope de
// seguridad), para no gastar créditos de más.
async function acumularMenciones(
  primeraPagina: SerpReview[],
  primerToken: string | null,
  dataId: string,
  key: string,
  mes: string,
  aliases: Record<string, string[]>,
) {
  const { data: usuarios } = await supabaseAdmin
    .from('usuarios').select('id, nombre').eq('estado_cuenta', 'activo')
  const empleadas = armarEmpleadas(usuarios ?? [], aliases)

  const { data: existentes } = await supabaseAdmin
    .from('google_menciones').select('review_key').eq('mes', mes)
  const conocidas = new Set((existentes ?? []).map(r => r.review_key as string))

  const hoyISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })

  let pagina = primeraPagina
  let token = primerToken
  let vueltas = 0
  let total = 0
  let error: string | null = null
  let camposSinComentario: string[] = [] // diagnóstico: campos de una reseña sin comentario libre

  while (true) {
    const nuevas: Record<string, unknown>[] = []
    const backfill: { rk: string; iso: string }[] = []
    let vistaVieja = false // alguna reseña ANTERIOR al mes del concurso (newest-first → frenar)
    for (const r of pagina) {
      if ((r.rating ?? 0) < 4) continue
      if (!(typeof r.snippet === 'string' && r.snippet.trim()) && camposSinComentario.length === 0) {
        camposSinComentario = Object.keys(r) // primera reseña sin comentario que aparece
      }
      // Comentario + campos estructurados. Puede quedar vacío (reseña de solo estrellas):
      // igual se trae, para que el admin la vea y, comparando con Google, la asigne a mano.
      const texto = textoDeReview(r)
      const iso = typeof r.iso_date === 'string' && r.iso_date ? r.iso_date : null
      if (iso) {
        const m = iso.slice(0, 7)
        if (m > mes) continue                        // más nueva que el mes objetivo → seguir bajando
        if (m < mes) { vistaVieja = true; continue }  // más vieja → frenar después de esta página
      } else if (!esDelMesContest(r.date ?? '', mes, hoyISO)) {
        vistaVieja = true; continue
      }
      const rk = reviewKey(r)
      if (conocidas.has(rk)) { if (iso) backfill.push({ rk, iso }); continue }
      conocidas.add(rk)
      const detectados = detectarEmpleadas(texto, empleadas)
      nuevas.push({
        review_key: rk,
        author: r.user?.name ?? 'Cliente',
        avatar: r.user?.thumbnail ?? null,
        rating: r.rating ?? 5,
        texto,
        fecha_texto: r.date ?? '',
        fecha_iso: iso,
        mes,
        asignados: detectados,
        detectados,
        revisado: false,
      })
    }
    // Se inserta página por página para no perder lo traído si el request se corta.
    // ignoreDuplicates por si otra corrida insertó la misma review_key en paralelo.
    if (nuevas.length > 0) {
      const { error: upErr } = await supabaseAdmin.from('google_menciones').upsert(nuevas, { onConflict: 'review_key', ignoreDuplicates: true })
      if (upErr) { error = upErr.message; break }
      total += nuevas.length
    }
    // Backfill de la fecha exacta en reseñas ya guardadas sin ella (capturadas antes de tener iso_date).
    for (const b of backfill) {
      await supabaseAdmin.from('google_menciones').update({ fecha_iso: b.iso }).eq('review_key', b.rk).is('fecha_iso', null)
    }
    vueltas++
    // Se frena al llegar a reseñas anteriores al mes (newest-first), sin token, o al tope.
    if (vistaVieja || !token || vueltas >= 6) break
    const sig = await fetchPagina(dataId, key, token)
    pagina = sig.reviews
    token = sig.next
  }

  return { insertadas: total, error, camposSinComentario }
}

export async function ejecutarGoogleReviewsRefresh() {
  const key = process.env.SERPAPI_KEY
  if (!key) throw new Error('no_key')

  const dataId = await fetchDataId(key)
  if (!dataId) throw new Error('no_place')

  const { reviews: pagina1, next } = await fetchPagina(dataId, key, null)

  // Snapshot del carrusel (las ~10 más nuevas 4-5★ con texto) — igual que antes
  const reviews = pagina1
    .filter(r => (r.rating ?? 0) >= 4 && r.snippet?.trim())
    .map(mapReview)

  if (reviews.length > 0) {
    await supabaseAdmin.from('google_reviews').delete().gt('id', 0)
    const { error } = await supabaseAdmin.from('google_reviews').insert(reviews)
    if (error) throw new Error(error.message)
  }

  // Concurso de menciones: solo si está activo
  let mencionesNuevas = 0
  let mencionesTotal = 0
  let mencionesError: string | null = null
  let camposSinComentario: string[] = []
  try {
    const cfg = await getConcursoConfig()
    if (cfg.activo && cfg.mes) {
      const r = await acumularMenciones(pagina1, next, dataId, key, cfg.mes, cfg.aliases)
      mencionesNuevas = r.insertadas
      mencionesError = r.error
      camposSinComentario = r.camposSinComentario
      const { count } = await supabaseAdmin
        .from('google_menciones').select('*', { count: 'exact', head: true }).eq('mes', cfg.mes)
      mencionesTotal = count ?? 0
    }
  } catch (e) {
    mencionesError = e instanceof Error ? e.message : String(e)
    console.error('[concurso-google] acumular menciones falló:', e)
  }

  return { updated: reviews.length, mencionesNuevas, mencionesTotal, mencionesError, camposSinComentario }
}

// Ruta standalone (debug/manual) — el cron de Vercel llama a /api/cron/diario
export async function GET() {
  try {
    return NextResponse.json(await ejecutarGoogleReviewsRefresh())
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
