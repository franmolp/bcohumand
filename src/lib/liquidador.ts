export const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export const DEFAULT_CATEGORIAS: Record<string, number> = {
  'Rostro': 0.40,
  'Masajes Mujer': 0.55,
  'Masajes Hombre': 0.55,
  'Tratamientos faciales': 0.65,
  'Depilación': 0.35,
  'Manos y Pies': 0.55,
  'Kapping': 0.55,
}
export const FALLBACK_PCT = 0.55

export type TipoPago = 'presentismo' | 'basico' | 'ninguno'

export interface ConfigEmpleada {
  id?: string
  usuario_id: string
  nombre?: string
  tipo_pago: TipoPago
  monto_presentismo: number
  presentismo_extra: number
  monto_basico: number
  horas_base_semanal: number
  reintegro_monotributo: boolean
  monto_reintegro: number
  adicional_compras: number
}

export interface Ajuste {
  id: string
  tipo: 'ADELANTO' | 'ADICIONAL'
  concepto: string
  monto: number
  fecha: string | null
}

export interface AtencionComision {
  id?: string
  fecha: string
  articulo: string
  categoria: string
  venta_neta: number
  comision: number
  es_compartido: boolean
  cantidad_profesionales: number
  nombre_csv?: string
}

export interface ResumenEmpleada {
  usuario_id: string
  nombre: string
  atenciones: AtencionComision[]
  total_comisiones: number
  dias_asistidos: number
  presentismo: number
  basico: number
  reintegro_monotributo: number
  adicional_compras: number
  adicionales: Ajuste[]
  adelantos: Ajuste[]
  total_adicionales: number
  total_adelantos: number
  subtotal: number
  total: number
}

export interface CSVRow {
  fecha: string
  articulo: string
  categoria: string
  ventaNeta: number
  profesionales: string[]
}

// ─── CSV Parsing ───────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let cur = '', inQ = false
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ }
    else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = '' }
    else cur += ch
  }
  result.push(cur.trim())
  return result
}

function findCol(headers: string[], ...candidates: string[]): number {
  const lc = candidates.map(c => c.toLowerCase())
  return headers.findIndex(h => lc.includes(h.toLowerCase()))
}

function parseAmount(s: string): number {
  if (!s) return 0
  let clean = s.replace(/[$\s]/g, '')
  const lDot = clean.lastIndexOf('.')
  const lCom = clean.lastIndexOf(',')
  if (lCom > lDot) {
    clean = clean.replace(/\./g, '').replace(',', '.')
  } else {
    clean = clean.replace(/,/g, '')
  }
  return parseFloat(clean) || 0
}

export function parseFresha(csv: string): CSVRow[] {
  const lines = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(Boolean)
  if (lines.length < 2) return []

  const headers = parseCSVLine(lines[0])
  const iF = findCol(headers, 'Fecha', 'Date')
  const iA = findCol(headers, 'Artículo', 'Articulo', 'Item', 'Service', 'Servicio')
  const iC = findCol(headers, 'Categoría', 'Categoria', 'Category')
  const iV = findCol(headers, 'Ventas netas', 'Net sales', 'Net Sales', 'Venta neta')
  const iM = findCol(headers, 'Modificadores aplicados', 'Applied modifiers', 'Staff', 'Profesional')

  const rows: CSVRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i])
    if (cols.length < 3) continue
    const ventaNeta = parseAmount(cols[iV] ?? '')
    if (ventaNeta <= 0) continue
    const modStr = (cols[iM] ?? '').trim()
    if (!modStr) continue
    const profesionales = modStr.split(',').map(s => s.trim()).filter(Boolean)
    rows.push({
      fecha: (cols[iF] ?? '').trim(),
      articulo: (cols[iA] ?? '').trim(),
      categoria: (cols[iC] ?? '').trim(),
      ventaNeta,
      profesionales,
    })
  }
  return rows
}

// ─── Commission Calculation ────────────────────────────────────────────────────

export function calcComision(
  articulo: string,
  categoria: string,
  ventaNeta: number,
  cantProf: number,
  categorias: Record<string, number>,
  fijos: Array<{ servicio: string; monto_fijo: number }>,
): number {
  const fijo = fijos.find(f => f.servicio.toLowerCase() === articulo.toLowerCase())
  if (fijo) return fijo.monto_fijo / cantProf
  const pct = categorias[categoria] ?? FALLBACK_PCT
  return (ventaNeta * pct) / cantProf
}

export function procesarCSV(
  rows: CSVRow[],
  aliasMap: Map<string, string>,      // csv_name_lowercase → usuario_id
  categorias: Record<string, number>,
  fijos: Array<{ servicio: string; monto_fijo: number }>,
): { atencionesMap: Map<string, AtencionComision[]>; unmappedNames: Set<string> } {
  const atencionesMap = new Map<string, AtencionComision[]>()
  const unmappedNames = new Set<string>()

  for (const row of rows) {
    const cantProf = row.profesionales.length
    for (const prof of row.profesionales) {
      const uid = aliasMap.get(prof.toLowerCase())
      if (!uid) { unmappedNames.add(prof); continue }
      const comision = calcComision(row.articulo, row.categoria, row.ventaNeta, cantProf, categorias, fijos)
      const atencion: AtencionComision = {
        fecha: row.fecha,
        articulo: row.articulo,
        categoria: row.categoria,
        venta_neta: row.ventaNeta / cantProf,
        comision,
        es_compartido: cantProf > 1,
        cantidad_profesionales: cantProf,
        nombre_csv: prof,
      }
      if (!atencionesMap.has(uid)) atencionesMap.set(uid, [])
      atencionesMap.get(uid)!.push(atencion)
    }
  }
  return { atencionesMap, unmappedNames }
}

export function calcResumen(
  uid: string,
  nombre: string,
  atenciones: AtencionComision[],
  config: ConfigEmpleada,
  ajustes: Ajuste[],
  diasAsistidos: number,
): ResumenEmpleada {
  const total_comisiones = Math.round(atenciones.reduce((s, a) => s + a.comision, 0))

  let presentismo = 0, basico = 0
  if (config.tipo_pago === 'presentismo' && diasAsistidos >= 20) {
    presentismo = config.monto_presentismo + config.presentismo_extra
  } else if (config.tipo_pago === 'basico') {
    const hs = diasAsistidos * 8
    const hb = config.horas_base_semanal * 4.33
    basico = Math.round(config.monto_basico * (hb > 0 ? hs / hb : 0))
  }

  const reintegro_monotributo = config.reintegro_monotributo ? config.monto_reintegro : 0
  const adicional_compras = config.adicional_compras

  const adicionales = ajustes.filter(a => a.tipo === 'ADICIONAL')
  const adelantos   = ajustes.filter(a => a.tipo === 'ADELANTO')
  const total_adicionales = adicionales.reduce((s, a) => s + a.monto, 0)
  const total_adelantos   = adelantos.reduce((s, a) => s + a.monto, 0)

  const subtotal = total_comisiones + presentismo + basico + reintegro_monotributo + adicional_compras + total_adicionales
  const total    = subtotal - total_adelantos

  return {
    usuario_id: uid, nombre, atenciones,
    total_comisiones, dias_asistidos: diasAsistidos,
    presentismo, basico, reintegro_monotributo, adicional_compras,
    adicionales, adelantos, total_adicionales, total_adelantos,
    subtotal, total,
  }
}

// ─── Formatting ────────────────────────────────────────────────────────────────

export function fmtARS(n: number): string {
  return '$ ' + Math.abs(Math.round(n)).toLocaleString('es-AR')
}
