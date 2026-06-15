import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

const VAC_DEFAULT = 14

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const today = new Date()
  const periodYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1
  const periodStart = `${periodYear}-04-01`

  const [configRes, solRes] = await Promise.all([
    supabase.from('liquidacion_config').select('usuario_id, dias_vacaciones'),
    supabase
      .from('solicitudes')
      .select('usuario_id, dias')
      .eq('tipo', 'Vacaciones')
      .eq('estado', 'approved')
      .gte('fecha_inicio', periodStart),
  ])

  const totalMap: Record<string, number> = {}
  for (const row of configRes.data ?? []) {
    if (row.usuario_id) totalMap[row.usuario_id] = row.dias_vacaciones ?? VAC_DEFAULT
  }

  const usadasMap: Record<string, number> = {}
  for (const row of solRes.data ?? []) {
    if (row.usuario_id) usadasMap[row.usuario_id] = (usadasMap[row.usuario_id] ?? 0) + (row.dias ?? 0)
  }

  // Collect all user IDs from both maps
  const ids = new Set([...Object.keys(totalMap), ...Object.keys(usadasMap)])
  const result: Record<string, { total: number; usadas: number; restantes: number }> = {}
  for (const id of ids) {
    const total = totalMap[id] ?? VAC_DEFAULT
    const usadas = usadasMap[id] ?? 0
    result[id] = { total, usadas, restantes: total - usadas }
  }

  return NextResponse.json(result)
}
