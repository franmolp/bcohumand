// ¿La persona pertenece al equipo de limpieza? (por nombre de equipo, tolerante a
// acentos/mayúsculas, igual criterio que los otros equipos del sistema).
export function esEquipoLimpieza(equipo: string | null | undefined): boolean {
  if (!equipo) return false
  return equipo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes('limpiez')
}

export type LimpiezaTarea = {
  id: number
  tipo: 'diaria' | 'semanal' | 'puntual'
  dia_semana: number | null
  fecha: string | null
  titulo: string
  detalle: string | null
  horario: string | null
  orden: number
  activo: boolean
}

// Día de la semana (0=Dom..6=Sáb) de una fecha 'YYYY-MM-DD', en horario local estable.
export function dowDeFecha(fecha: string): number {
  return new Date(fecha + 'T12:00:00Z').getUTCDay()
}

// ¿La tarea aplica a una fecha dada? diaria = todos los días; semanal = ese día de
// semana; puntual = esa fecha exacta.
export function tareaAplica(t: Pick<LimpiezaTarea, 'tipo' | 'dia_semana' | 'fecha'>, fecha: string): boolean {
  if (t.tipo === 'diaria') return true
  if (t.tipo === 'semanal') return t.dia_semana === dowDeFecha(fecha)
  if (t.tipo === 'puntual') return t.fecha === fecha
  return false
}

// Orden de presentación: primero diaria, después semanal, después puntual; dentro, por `orden`.
export function ordenarTareas<T extends { tipo: string; orden: number }>(tareas: T[]): T[] {
  const peso: Record<string, number> = { diaria: 0, semanal: 1, puntual: 2 }
  return [...tareas].sort((a, b) => (peso[a.tipo] ?? 9) - (peso[b.tipo] ?? 9) || a.orden - b.orden)
}
