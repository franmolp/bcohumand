// Lógica de períodos de adelantos, compartida entre el server (api/adelantos) y
// el cliente (dashboard/adelantos) para que nunca se desincronicen.
//
// Un período corta por defecto el día 8 (fecha de pago): el período "YYYY-MM"
// va del día 8 de ese mes al día 8 del mes siguiente (exclusive). El día de
// cierre es editable POR PERÍODO: `cierres["YYYY-MM"]` es el día (del mes
// siguiente) en que cierra ese período. El cierre de un período es, a la vez,
// el inicio del siguiente, así que no quedan huecos ni solapamientos.

export const DIA_CORTE_DEFAULT = 8

// "YYYY-MM" -> día de cierre (día del mes siguiente). Si falta, se usa 8.
export type CierresMap = Record<string, number>

function parse(mesStr: string): [number, number] {
  const [y, m] = mesStr.split('-').map(Number)
  return [y, m]
}

export function prevPeriodo(mesStr: string): string {
  const [y, m] = parse(mesStr)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

export function nextPeriodo(mesStr: string): string {
  const [y, m] = parse(mesStr)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

// Día de cierre del período (día del mes siguiente). Se acota a 1..28 para no
// caer en días inexistentes de meses cortos (el cierre real es 7/8).
export function diaCierre(mesStr: string, cierres: CierresMap | null | undefined): number {
  const d = cierres?.[mesStr]
  return typeof d === 'number' && d >= 1 && d <= 28 ? d : DIA_CORTE_DEFAULT
}

// Día en que ARRANCA el período (= día en que cerró el período anterior).
export function diaInicio(mesStr: string, cierres: CierresMap | null | undefined): number {
  return diaCierre(prevPeriodo(mesStr), cierres)
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T00:00:00`
}

// Rango [desde, hasta) del período, como timestamps locales 'YYYY-MM-DDT00:00:00'.
export function periodoLimites(mesStr: string, cierres: CierresMap | null | undefined): { desde: string; hasta: string } {
  const [y, m] = parse(mesStr)
  const desdeDia = diaInicio(mesStr, cierres) // en el mes m
  const hastaDia = diaCierre(mesStr, cierres) // en el mes m+1
  return { desde: fmt(new Date(y, m - 1, desdeDia)), hasta: fmt(new Date(y, m, hastaDia)) }
}

// A qué período "YYYY-MM" pertenece una fecha dada.
export function periodoDeFecha(d: Date, cierres: CierresMap | null | undefined): string {
  const year = d.getFullYear()
  const month = d.getMonth() + 1
  const key = `${year}-${String(month).padStart(2, '0')}`
  return d.getDate() >= diaInicio(key, cierres) ? key : prevPeriodo(key)
}
