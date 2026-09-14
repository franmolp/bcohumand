import { supabaseAdmin } from '@/lib/supabase-admin'

export type ConcursoConfig = {
  activo: boolean
  mes: string                       // 'YYYY-MM'
  aliases: Record<string, string[]> // usuario_id → apodos extra (además del primer nombre)
  recordatorioIdx: number           // índice del próximo mensaje cíclico de recordatorio
}

const CLAVE = 'concurso_google'
const DEFAULT_CONFIG: ConcursoConfig = { activo: false, mes: '', aliases: {}, recordatorioIdx: 0 }

// Mensajes cíclicos del recordatorio del juego (rotan en cada envío).
export const MENSAJES_RECORDATORIO = [
  'Pediles a tus clientas que te nombren en su reseña de Google. ¡Cada mención suma para el premio! ⭐',
  'Sigue el concurso de reseñas: una clienta que te nombra en Google = un punto para vos. ¡Dale que se puede! 🏆',
  '¿Ya pediste hoy que te nombren en Google? Mientras mejor te trates a las clientas, más cerca del premio 💪',
]

export function mesActual(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).slice(0, 7)
}

export async function getConcursoConfig(): Promise<ConcursoConfig> {
  const { data } = await supabaseAdmin
    .from('configuracion')
    .select('valor')
    .eq('clave', CLAVE)
    .maybeSingle()
  return { ...DEFAULT_CONFIG, ...((data?.valor as Partial<ConcursoConfig>) ?? {}) }
}

export async function setConcursoConfig(cfg: ConcursoConfig): Promise<void> {
  await supabaseAdmin.from('configuracion').upsert({ clave: CLAVE, valor: cfg }, { onConflict: 'clave' })
}

// Resumen para la card del home: si está activo, el top 3 (con foto) y — si se
// pasa usuarioId — la posición de esa persona en el ranking.
export type TopMencion = { id: string; nombre: string; foto: string | null; menciones: number }
export type ConcursoResumen =
  | { activo: false }
  | { activo: true; mes: string; total: number; top: TopMencion[]; yo: { menciones: number; puesto: number } | null }

export async function getConcursoResumen(usuarioId?: string): Promise<ConcursoResumen> {
  const cfg = await getConcursoConfig()
  if (!cfg.activo || !cfg.mes) return { activo: false }

  const { data: menciones } = await supabaseAdmin.from('google_menciones').select('asignados').eq('mes', cfg.mes)
  const counts = new Map<string, number>()
  let total = 0
  for (const m of menciones ?? []) {
    total++
    for (const uid of ((m.asignados as string[]) ?? [])) counts.set(uid, (counts.get(uid) ?? 0) + 1)
  }
  const ordenado = [...counts.entries()].sort((a, b) => b[1] - a[1]) // [usuario_id, menciones]

  const ids = ordenado.slice(0, 3).map(([id]) => id)
  const { data: usuarios } = ids.length
    ? await supabaseAdmin.from('usuarios').select('id, nombre, foto_perfil').in('id', ids)
    : { data: [] as { id: string; nombre: string; foto_perfil: string | null }[] }
  const umap = new Map((usuarios ?? []).map(u => [u.id, u]))
  const top: TopMencion[] = ordenado.slice(0, 3).map(([id, menciones]) => ({
    id, nombre: umap.get(id)?.nombre ?? '—', foto: umap.get(id)?.foto_perfil ?? null, menciones,
  }))

  let yo: { menciones: number; puesto: number } | null = null
  if (usuarioId) {
    const idx = ordenado.findIndex(([id]) => id === usuarioId)
    if (idx >= 0) yo = { menciones: ordenado[idx][1], puesto: idx + 1 }
  }

  return { activo: true, mes: cfg.mes, total, top, yo }
}

// minúsculas, sin acentos, signos → espacio (para tokenizar por palabra)
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Convierte la fecha relativa de Google ("hoy", "ayer", "hace 3 días", "hace una
// semana", "hace un mes") a una antigüedad aproximada en días. null si no se
// reconoce (para no descartar reseñas por las dudas).
export function edadRelativaDias(fecha: string): number | null {
  const f = normalizar(fecha)
  if (!f) return null
  if (/(hoy|minuto|hora)/.test(f)) return 0
  if (/ayer/.test(f)) return 1
  const m = f.match(/hace\s+(\d+|un|una)\s+(dia|semana|mes|ano)/)
  if (!m) return null
  const n = (m[1] === 'un' || m[1] === 'una') ? 1 : parseInt(m[1])
  const u = m[2]
  if (u === 'dia') return n
  if (u === 'semana') return n * 7
  if (u === 'mes') return n * 30
  return n * 365 // año
}

// ¿La reseña (por su fecha relativa) cae en el mes del concurso? Se calcula la fecha
// aproximada (hoy − antigüedad) y se compara el mes. Si no se reconoce la fecha, no
// se descarta. Así una reseña "hace un mes" (≈ mes pasado) no cuenta para este mes.
export function esDelMesContest(fecha: string, mes: string, hoyISO: string): boolean {
  const dias = edadRelativaDias(fecha)
  if (dias === null) return true
  const d = new Date(hoyISO + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString().slice(0, 7) === mes
}

export type EmpleadaConcurso = { id: string; nombre: string; nombres: string[] }

// Arma, por empleada, los "nombres a buscar": primer nombre + apodos configurados.
// Solo se toman tokens de 3+ letras para no matchear ruido.
export function armarEmpleadas(
  usuarios: { id: string; nombre: string }[],
  aliases: Record<string, string[]>
): EmpleadaConcurso[] {
  return usuarios.map(u => {
    const primer = normalizar(u.nombre).split(' ')[0] ?? ''
    const extra = (aliases[u.id] ?? []).map(a => normalizar(a)).filter(Boolean)
    const nombres = [...new Set([primer, ...extra])].filter(n => n.length >= 3)
    return { id: u.id, nombre: u.nombre, nombres }
  })
}

// Devuelve los usuario_id mencionados en el texto (por palabra completa).
export function detectarEmpleadas(texto: string, empleadas: EmpleadaConcurso[]): string[] {
  const norm = normalizar(texto)
  const palabras = new Set(norm.split(' ').filter(Boolean))
  const ids: string[] = []
  for (const e of empleadas) {
    if (e.nombres.some(n => palabras.has(n))) ids.push(e.id)
  }
  return ids
}
