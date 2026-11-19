import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getConcursoConfig, armarEmpleadas, detectarEmpleadas, normalizar, esDelMesContest } from '@/lib/concurso-google'

type ResenaG = {
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
function textoDeReview(r: ResenaG): string {
  const partes: string[] = []
  if (r.snippet?.trim()) partes.push(r.snippet.trim())
  if (r.details && typeof r.details === 'object') {
    for (const [k, v] of Object.entries(r.details)) {
      if (typeof v === 'string' && v.trim()) partes.push(`${k}: ${v.trim()}`)
    }
  }
  return partes.join(' · ')
}

// Las reseñas salen de BCO Turnos (API oficial de Google, Clientes → Reseñas), ya no de SerpAPI.
// GET {BCO_TURNOS_URL}/api/integraciones/humand/resenas con INTEGRACION_SECRET. También trae la calificación y el total del local.
export type LugarGoogle = { data_id: string | null; rating: number | null; total: number; en: string }
type DeTurnos = { rating: number | null; total: number; resenas: { id: string; autor: string; foto: string | null; estrellas: number; texto: string; fecha_iso: string | null }[] }
async function traerDeTurnos(desde: string | null): Promise<DeTurnos> {
  const secreto = process.env.INTEGRACION_SECRET
  if (!secreto) throw new Error('Falta INTEGRACION_SECRET')
  const base = (process.env.BCO_TURNOS_URL || 'https://bco-turnos.vercel.app').replace(/\/$/, '')
  const res = await fetch(`${base}/api/integraciones/humand/resenas${desde ? `?desde=${desde}` : ''}`, { headers: { Authorization: `Bearer ${secreto}` }, cache: 'no-store' })
  const d = await res.json().catch(() => ({})) as DeTurnos & { error?: string }
  if (!res.ok) throw new Error(`BCO Turnos ${res.status}: ${d.error ?? 'sin detalle'}`)
  return d
}
// BCO Turnos llegó a guardar la misma reseña dos veces (id viejo de SerpAPI + id de la API de Google): se deja una
// sola por persona, día y estrellas. `alias`: id repetido → id que queda.
function sinRepetidas(lista: DeTurnos['resenas']) {
  const vistas = new Map<string, string>(), alias = new Map<string, string>(), quedan: DeTurnos['resenas'] = []
  for (const r of lista) {
    const k = `${normalizar(r.autor ?? '')}|${(r.fecha_iso ?? '').slice(0, 10)}|${r.estrellas}`
    const ya = vistas.get(k)
    if (ya) { alias.set(r.id, ya); continue }
    vistas.set(k, r.id); quedan.push(r)
  }
  return { quedan, alias }
}

// Concurso del mes: lo que quedó de SerpAPI o repetido pasa a la reseña de Google que corresponde (conservando la
// asignación hecha a mano) y lo que ya no está en Google se borra. Solo con la lista de BCO Turnos completa del mes.
async function limpiarMenciones(mes: string, resenas: DeTurnos['resenas'], alias: Map<string, string>) {
  if (!resenas.length) return { movidas: 0, borradas: 0 }
  const ids = new Set(resenas.map(r => r.id))
  const delMes = resenas.filter(r => (r.fecha_iso ?? '').slice(0, 7) === mes)
  const porAutor = new Map<string, string[]>()
  for (const r of delMes) { const k = normalizar(r.autor ?? ''); porAutor.set(k, [...(porAutor.get(k) ?? []), r.id]) }
  const { data: filas } = await supabaseAdmin.from('google_menciones').select('review_key, author, asignados, revisado').eq('mes', mes)
  const actuales = new Map((filas ?? []).map(f => [f.review_key as string, f]))
  let movidas = 0, borradas = 0
  for (const f of filas ?? []) {
    const key = f.review_key as string
    if (ids.has(key)) continue
    const candidatas = porAutor.get(normalizar((f.author as string) ?? '')) ?? []
    const destino = alias.get(key) ?? (candidatas.length === 1 ? candidatas[0] : null)
    if (!destino) { await supabaseAdmin.from('google_menciones').delete().eq('review_key', key); actuales.delete(key); borradas++; continue }
    const otra = actuales.get(destino)
    if (otra) {
      // Ya está la de Google: se le pasa la asignación revisada a mano (si la de Google no se revisó) y se borra la vieja
      if (f.revisado && !otra.revisado) await supabaseAdmin.from('google_menciones').update({ asignados: f.asignados, revisado: true }).eq('review_key', destino)
      await supabaseAdmin.from('google_menciones').delete().eq('review_key', key); actuales.delete(key); borradas++
    } else {
      await supabaseAdmin.from('google_menciones').update({ review_key: destino }).eq('review_key', key)
      actuales.delete(key); actuales.set(destino, { ...f, review_key: destino }); movidas++
    }
  }
  return { movidas, borradas }
}

const aResena = (r: DeTurnos['resenas'][number]): ResenaG => ({ review_id: r.id, user: { name: r.autor, thumbnail: r.foto ?? undefined }, rating: r.estrellas, iso_date: r.fecha_iso ?? undefined, date: '', snippet: r.texto })

// Clave estable por reseña: cada persona deja como mucho una reseña por lugar, así
// que si Google no da un id, el nombre del autor sirve como clave (y no
// incluye el texto, que puede cambiar si la clienta edita → así tomamos la original).
function reviewKey(r: ResenaG): string {
  return r.review_id || r.link || `autor:${normalizar(r.user?.name ?? '')}`
}

function mapReview(r: ResenaG) {
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
  primeraPagina: ResenaG[],
  mes: string,
  aliases: Record<string, string[]>,
) {
  const { data: usuarios } = await supabaseAdmin
    .from('usuarios').select('id, nombre').eq('estado_cuenta', 'activo')
  const empleadas = armarEmpleadas(usuarios ?? [], aliases)

  const { data: existentes } = await supabaseAdmin
    .from('google_menciones').select('review_key, author, texto, revisado').eq('mes', mes)
  const conocidas = new Set((existentes ?? []).map(r => r.review_key as string))
  // Las guardadas antes venían de SerpAPI con otro id: la misma persona (una reseña por local) se reconoce por el nombre
  const porAutor = new Map((existentes ?? []).map(r => [normalizar((r.author as string) ?? ''), r.review_key as string]))
  // Texto guardado de cada reseña: si la clienta la edita en Google, se actualiza acá
  const guardadas = new Map((existentes ?? []).map(r => [r.review_key as string, { texto: (r.texto as string) ?? '', revisado: !!r.revisado }]))

  const hoyISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })

  const pagina = primeraPagina
  let vueltas = 0
  let leidas = 0 // diagnóstico: reseñas escaneadas en total
  let total = 0
  let error: string | null = null
  let camposSinComentario: string[] = [] // diagnóstico: campos de una reseña sin comentario libre

  while (true) {
    const nuevas: Record<string, unknown>[] = []
    const backfill: { rk: string; iso: string }[] = []
    // Se frena SOLO cuando una página entera no tiene ninguna reseña del mes (o más
    // nueva). Antes se frenaba apenas aparecía una reseña vieja, pero como Google no
    // siempre viene 100% ordenado (y algunas reseñas no traen iso_date), eso dejaba
    // afuera reseñas del mes que venían un poco más abajo.
    let hayDelMesEnPagina = false
    let yaConocidas = 0 // del mes y ya guardadas en una corrida anterior
    for (const r of pagina) {
      leidas++
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
        if (m > mes) { hayDelMesEnPagina = true; continue } // más nueva → seguir bajando, no frenar
        if (m < mes) continue                                // más vieja → saltarla (no cuenta ni frena sola)
        hayDelMesEnPagina = true                             // del mes exacto
      } else if (esDelMesContest(r.date ?? '', mes, hoyISO)) {
        hayDelMesEnPagina = true
      } else {
        continue // sin iso y fecha relativa fuera del mes → saltarla
      }
      const rk0 = reviewKey(r), rk = conocidas.has(rk0) ? rk0 : porAutor.get(normalizar(r.user?.name ?? '')) ?? rk0
      if (conocidas.has(rk)) {
        yaConocidas++
        if (iso) backfill.push({ rk, iso })
        // Reseña editada en Google: texto nuevo y empleadas detectadas de nuevo (la asignación manual ya revisada no se toca)
        const g = guardadas.get(rk)
        if (g && texto && texto !== g.texto) {
          const detectados = detectarEmpleadas(texto, empleadas)
          await supabaseAdmin.from('google_menciones').update({ texto, detectados, ...(g.revisado ? {} : { asignados: detectados }) }).eq('review_key', rk)
          g.texto = texto
        }
        continue
      }
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
    // Desde BCO Turnos llegan todas juntas: una sola vuelta
    void yaConocidas; void hayDelMesEnPagina
    break
  }

  return { insertadas: total, error, camposSinComentario, leidas, paginas: vueltas }
}

// Queda guardado el resultado de la última actualización (fecha, si anduvo y el error), para ver por qué no se actualizan
export async function ejecutarGoogleReviewsRefresh() {
  const en = new Date().toISOString()
  try {
    const r = await refrescar()
    await supabaseAdmin.from('configuracion').upsert({ clave: 'google_reviews_estado', valor: { en, ok: true, ...r } }, { onConflict: 'clave' })
    return r
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    await supabaseAdmin.from('configuracion').upsert({ clave: 'google_reviews_estado', valor: { en, ok: false, error } }, { onConflict: 'clave' })
    throw e
  }
}

async function refrescar() {
  const cfg0 = await getConcursoConfig().catch(() => null)
  // Para el concurso alcanza desde el mes anterior al del concurso; el carrusel usa las más nuevas
  const desde = cfg0?.activo && cfg0.mes ? `${cfg0.mes}-01` : null
  const t = await traerDeTurnos(desde)
  const { quedan, alias } = sinRepetidas(t.resenas)
  const pagina1 = quedan.map(aResena)
  await supabaseAdmin.from('configuracion').upsert({ clave: 'google_lugar', valor: { data_id: null, rating: t.rating, total: t.total, en: new Date().toISOString() } satisfies LugarGoogle }, { onConflict: 'clave' })

  // Snapshot del carrusel (las 10 más nuevas 4-5★ con texto)
  const reviews = pagina1
    .filter(r => (r.rating ?? 0) >= 4 && r.snippet?.trim())
    .slice(0, 10)
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
  let leidas = 0
  let paginas = 0
  let limpieza = { movidas: 0, borradas: 0 }
  try {
    const cfg = await getConcursoConfig()
    if (cfg.activo && cfg.mes) {
      // Solo si la lista trae el mes completo (pedida desde el 1° del mes del concurso)
      if (desde === `${cfg.mes}-01`) limpieza = await limpiarMenciones(cfg.mes, quedan, alias)
      const r = await acumularMenciones(pagina1, cfg.mes, cfg.aliases)
      mencionesNuevas = r.insertadas
      mencionesError = r.error
      camposSinComentario = r.camposSinComentario
      leidas = r.leidas
      paginas = r.paginas
      const { count } = await supabaseAdmin
        .from('google_menciones').select('*', { count: 'exact', head: true }).eq('mes', cfg.mes)
      mencionesTotal = count ?? 0
    }
  } catch (e) {
    mencionesError = e instanceof Error ? e.message : String(e)
    console.error('[concurso-google] acumular menciones falló:', e)
  }

  return { updated: reviews.length, mencionesNuevas, mencionesTotal, mencionesError, camposSinComentario, leidas, paginas, repetidasDeTurnos: alias.size, limpieza }
}

// Ruta standalone (debug/manual) — el cron de Vercel llama a /api/cron/diario
export async function GET() {
  try {
    return NextResponse.json(await ejecutarGoogleReviewsRefresh())
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
