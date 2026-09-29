import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

const VACACIONES_DEFAULT = 14

// Días inclusive entre dos fechas 'YYYY-MM-DD' (o 1 si no hay fin).
function diasEntre(ini: string, fin: string | null): number {
  if (!fin) return 1
  const a = new Date(ini + 'T12:00:00Z').getTime()
  const b = new Date(fin + 'T12:00:00Z').getTime()
  return Math.max(1, Math.round((b - a) / 86400000) + 1)
}
// Días en común (inclusive) entre dos rangos.
function diasComun(aIni: string, aFin: string | null, bIni: string, bFin: string | null): number {
  const s = aIni > bIni ? aIni : bIni
  const eA = aFin ?? aIni, eB = bFin ?? bIni
  const e = eA < eB ? eA : eB
  if (s > e) return 0
  return Math.round((new Date(e + 'T12:00:00Z').getTime() - new Date(s + 'T12:00:00Z').getTime()) / 86400000) + 1
}

type Sol = { id: string; usuario_id: string; empleado_nombre: string; fecha_inicio: string; fecha_fin: string | null; dias: number | null; estado: string }

// Advertencias para el admin sobre las solicitudes de Vacaciones PENDIENTES:
//  - excede: la empleada se pasa de sus días de vacaciones del ciclo.
//  - solapamientos: coincide con vacaciones de otra persona del MISMO equipo.
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  const isHR = session.rol === 'HR'
  if (!isAdmin && !isHR) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  // Ciclo de vacaciones vigente (1/4 → 31/3), igual criterio que /api/perfil.
  const hoy = new Date()
  const cicloYear = hoy.getMonth() >= 3 ? hoy.getFullYear() : hoy.getFullYear() - 1
  const cicloDesde = `${cicloYear}-04-01`
  const cicloHasta = `${cicloYear + 1}-03-31`

  const [{ data: vacs }, { data: usuarios }, { data: configs }] = await Promise.all([
    supabaseAdmin.from('solicitudes')
      .select('id, usuario_id, empleado_nombre, fecha_inicio, fecha_fin, dias, estado')
      .eq('tipo', 'Vacaciones')
      .in('estado', ['pending', 'approved']),
    supabaseAdmin.from('usuarios').select('id, nombre, equipo_id'),
    supabaseAdmin.from('liquidacion_config').select('usuario_id, dias_vacaciones'),
  ])

  const equipoDe = new Map((usuarios ?? []).map(u => [u.id as string, u.equipo_id as number | null]))
  const totalDe = new Map((configs ?? []).map(c => [c.usuario_id as string, (c.dias_vacaciones as number | null) ?? VACACIONES_DEFAULT]))
  const lista = (vacs ?? []) as Sol[]

  const validaciones: Record<string, {
    excede: { usadas: number; total: number; pedido: number; excedePor: number } | null
    solapamientos: { nombre: string; fecha_inicio: string; fecha_fin: string | null; dias_comun: number }[]
  }> = {}

  for (const s of lista) {
    if (s.estado !== 'pending') continue
    const total = totalDe.get(s.usuario_id) ?? VACACIONES_DEFAULT
    // Días ya usados (aprobados) en el ciclo por esa persona.
    const usadas = lista
      .filter(x => x.usuario_id === s.usuario_id && x.estado === 'approved' && x.fecha_inicio >= cicloDesde && x.fecha_inicio <= cicloHasta)
      .reduce((acc, x) => acc + (x.dias ?? diasEntre(x.fecha_inicio, x.fecha_fin)), 0)
    const pedido = s.dias ?? diasEntre(s.fecha_inicio, s.fecha_fin)
    const excedePor = usadas + pedido - total
    const excede = excedePor > 0 ? { usadas, total, pedido, excedePor } : null

    // Solapamientos con vacaciones (aprobadas o pendientes) de otra persona del mismo equipo.
    const team = equipoDe.get(s.usuario_id)
    const solapamientos: { nombre: string; fecha_inicio: string; fecha_fin: string | null; dias_comun: number }[] = []
    if (team != null) {
      for (const o of lista) {
        if (o.id === s.id || o.usuario_id === s.usuario_id) continue
        if (equipoDe.get(o.usuario_id) !== team) continue
        const comun = diasComun(s.fecha_inicio, s.fecha_fin, o.fecha_inicio, o.fecha_fin)
        if (comun > 0) solapamientos.push({ nombre: o.empleado_nombre, fecha_inicio: o.fecha_inicio, fecha_fin: o.fecha_fin, dias_comun: comun })
      }
    }
    solapamientos.sort((a, b) => b.dias_comun - a.dias_comun)

    if (excede || solapamientos.length) validaciones[s.id] = { excede, solapamientos }
  }

  return NextResponse.json({ validaciones })
}
