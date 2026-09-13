import { supabaseAdmin } from '@/lib/supabase-admin'

export type ConcursoConfig = {
  activo: boolean
  mes: string                       // 'YYYY-MM'
  aliases: Record<string, string[]> // usuario_id → apodos extra (además del primer nombre)
}

const CLAVE = 'concurso_google'
const DEFAULT_CONFIG: ConcursoConfig = { activo: false, mes: '', aliases: {} }

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

// Resumen liviano para la card del home: si está activo, el/la líder y totales.
export type ConcursoResumen =
  | { activo: false }
  | { activo: true; mes: string; total: number; lider: { nombre: string; foto: string | null; menciones: number } | null }

export async function getConcursoResumen(): Promise<ConcursoResumen> {
  const cfg = await getConcursoConfig()
  if (!cfg.activo || !cfg.mes) return { activo: false }

  const { data: menciones } = await supabaseAdmin.from('google_menciones').select('asignados').eq('mes', cfg.mes)
  const counts = new Map<string, number>()
  let total = 0
  for (const m of menciones ?? []) {
    total++
    for (const uid of ((m.asignados as string[]) ?? [])) counts.set(uid, (counts.get(uid) ?? 0) + 1)
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  let lider: { nombre: string; foto: string | null; menciones: number } | null = null
  if (top) {
    const { data: u } = await supabaseAdmin.from('usuarios').select('nombre, foto_perfil').eq('id', top[0]).maybeSingle()
    lider = { nombre: u?.nombre ?? '—', foto: u?.foto_perfil ?? null, menciones: top[1] }
  }
  return { activo: true, mes: cfg.mes, total, lider }
}

// minúsculas, sin acentos, signos → espacio (para tokenizar por palabra)
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Heurística sobre la fecha relativa que da Google ("hace una semana", "hace 2
// meses", "hace un año") para no contar reseñas claramente viejas en la primera
// carga del mes. Reciente (horas/días/semanas/1 mes) = sí; 2+ meses o años = no.
// Si no hay fecha o no se reconoce, no se descarta (mejor que el admin la saque).
export function pareceDelMes(fecha: string): boolean {
  const f = normalizar(fecha)
  if (!f) return true
  if (/(hoy|ayer|minuto|hora|dia|semana)/.test(f)) return true
  const m = f.match(/hace\s+(\d+|un|una)\s+mes/)
  if (m) {
    const n = (m[1] === 'un' || m[1] === 'una') ? 1 : parseInt(m[1])
    return n <= 1
  }
  if (/(ano|year)/.test(f)) return false
  return true
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
