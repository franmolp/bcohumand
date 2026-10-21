// Estados de cita que NO cuentan como turno real (cancelada / no se presentó).
// BCO Turnos manda en primer_turno_dia.cant_citas un número que INCLUYE las citas
// canceladas; si nos guiáramos solo por ese número, una empleada con todas sus citas
// canceladas (no fue a trabajar) quedaría "Sin fichada" en vez de "Sin turnos". Por eso
// el conteo real se calcula desde fresha_citas_detalle excluyendo estos estados.
export const ESTADOS_CANCELADOS = new Set([
  'cancelado', 'cancelada', 'cancelled', 'canceled',
  'no_presentado', 'no presentado', 'no show', 'no-show', 'noshow',
])

export function esCancelada(estado: string | null): boolean {
  return ESTADOS_CANCELADOS.has((estado ?? '').toLowerCase().trim())
}
