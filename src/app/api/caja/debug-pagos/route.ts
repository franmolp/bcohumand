import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

// Diagnóstico (solo admin, solo lectura): muestra los nombres de método de pago
// que realmente hay en loyverse_pagos (últimos 40 días) con su total, y compara
// contra el "payment_name_efectivo" configurado — para entender por qué el
// "Efectivo" diario puede dar $0 (nombre configurado que no matchea el real).
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (session.rol !== 'admin' && session.rol !== 'Admin') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { data: confData } = await supabaseAdmin
    .from('configuracion').select('valor').eq('clave', 'caja_config').maybeSingle()
  const config = confData?.valor as { payment_name_efectivo?: string } | null
  const configurado = config?.payment_name_efectivo ?? '(no configurado)'

  const desde = new Date(); desde.setDate(desde.getDate() - 40)
  const desdeISO = desde.toISOString()

  const { data: pagos, error } = await supabaseAdmin
    .from('loyverse_pagos')
    .select('payment_name, payment_money, receipt_date')
    .gte('receipt_date', desdeISO)
    .limit(20000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const porNombre = new Map<string, { nombre: string; filas: number; total: number }>()
  for (const p of pagos ?? []) {
    const nombre = (p.payment_name as string) ?? ''
    const e = porNombre.get(nombre) ?? { nombre, filas: 0, total: 0 }
    e.filas += 1
    e.total += Number(p.payment_money ?? 0)
    porNombre.set(nombre, e)
  }

  const needle = (configurado || '').toLowerCase()
  const metodos = [...porNombre.values()]
    .sort((a, b) => b.total - a.total)
    .map(m => ({
      nombre: m.nombre,
      filas: m.filas,
      total: Math.round(m.total),
      matcheaConfig: needle !== '' && m.nombre.toLowerCase().includes(needle),
    }))

  const totalMatcheado = metodos.filter(m => m.matcheaConfig).reduce((s, m) => s + m.total, 0)

  return NextResponse.json({
    payment_name_efectivo_configurado: configurado,
    pagos_ultimos_40_dias: pagos?.length ?? 0,
    metodos_de_pago_detectados: metodos,
    total_que_matchea_con_config: totalMatcheado,
    nota: totalMatcheado === 0
      ? 'Ningún método matchea el nombre configurado → por eso "Efectivo" da $0. Mirá en la lista cómo se llama realmente el efectivo y ponelo en Ajustes.'
      : 'El nombre configurado sí matchea; si igual ves $0 en un día, puede ser un tema de fecha/período.',
  }, { headers: { 'Cache-Control': 'no-store' } })
}
