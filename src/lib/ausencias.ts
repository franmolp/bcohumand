import { supabaseAdmin } from '@/lib/supabase-admin'

// Tipos de solicitud que implican que la persona NO ocupa su puesto ese día
// (no viene a trabajar). OJO: "Cambio de horario/día" NO entra acá, porque ese
// tipo ya modifica directamente horarios_base al aprobarse (ver lib/cambio-horario):
// el día que se toma le borra el horario y el día que compensa se lo agrega, así
// que la ocupación ya queda bien sin tener que excluirlo por solicitud.
export const TIPOS_AUSENCIA_OCUPACION = [
  'Vacaciones',
  'Ausencia por Salud',
  'Ausencia Injustificada',
  'Solicitud de Días',
]

// Devuelve un Set de claves `usuario_id|fecha` (fecha YYYY-MM-DD) con una ausencia
// APROBADA en el rango. Se usa para que quien pidió el día (o está de vacaciones,
// etc.) deje de contar como que ocupa una mesa/box en Espacio de trabajo. Solo
// 'approved': una solicitud pendiente todavía no libera el lugar.
export async function getAusenciasOcupacion(desde: string, hasta: string): Promise<Set<string>> {
  const { data } = await supabaseAdmin
    .from('solicitudes')
    .select('usuario_id, fecha_inicio, fecha_fin')
    .in('tipo', TIPOS_AUSENCIA_OCUPACION)
    .eq('estado', 'approved')
    .lte('fecha_inicio', hasta)
    .or(`fecha_fin.gte.${desde},fecha_fin.is.null`)

  const set = new Set<string>()
  for (const s of (data ?? []) as { usuario_id: string; fecha_inicio: string; fecha_fin: string | null }[]) {
    if (!s.usuario_id) continue
    const iniRaw = s.fecha_inicio.slice(0, 10)
    const ini = iniRaw < desde ? desde : iniRaw
    const finRaw = (s.fecha_fin ?? s.fecha_inicio).slice(0, 10)
    const fin = finRaw > hasta ? hasta : finRaw
    const cur = new Date(ini + 'T12:00:00Z')
    const last = new Date(fin + 'T12:00:00Z')
    while (cur <= last) {
      set.add(`${s.usuario_id}|${cur.toISOString().slice(0, 10)}`)
      cur.setUTCDate(cur.getUTCDate() + 1)
    }
  }
  return set
}
