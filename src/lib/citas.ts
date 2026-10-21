// Estados de cita que NO cuentan como turno real (cancelada / no se presentó).
// BCO Turnos manda en primer_turno_dia.cant_citas un número que INCLUYE las citas
// canceladas; si nos guiáramos solo por ese número, una empleada con todas sus citas
// canceladas (no fue a trabajar) quedaría "Sin fichada" en vez de "Sin turnos". Por eso
// el conteo real se calcula excluyendo estos estados.
// Lista de equivalencias exactas (sin/con variantes de redacción de "no se presentó").
export const ESTADOS_CANCELADOS = new Set([
  'no_presentado', 'no presentado', 'no se presento', 'no se presentó',
  'no show', 'no-show', 'noshow', 'no asistio', 'no asistió', 'ausente',
])

export function esCancelada(estado: string | null): boolean {
  const e = (estado ?? '').toLowerCase().trim()
  if (!e) return false
  // Cualquier variante que empiece con "cancel" (cancelada, cancelado, cancelled,
  // "cancelada por el cliente", "cancelado por el salón", etc.).
  if (e.startsWith('cancel')) return true
  return ESTADOS_CANCELADOS.has(e)
}
