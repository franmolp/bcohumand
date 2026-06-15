import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST() {
  const session = await getSession()
  if (!session || (session.rol !== 'admin' && session.rol !== 'Admin')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const mesStr = String(month + 1).padStart(2, '0')
  const inicioMes = `${year}-${mesStr}-01`
  const finMes = new Date(year, month + 1, 0)
  const finMesStr = `${year}-${mesStr}-${String(finMes.getDate()).padStart(2, '0')}`
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  const nombreMes = meses[month]

  const { data: solicitudes, error } = await supabase
    .from('solicitudes')
    .select('usuario_id')
    .eq('tipo', 'Ausencia por Salud')
    .is('certificado_adjunto', null)
    .gte('fecha_inicio', inicioMes)
    .lte('fecha_inicio', finMesStr)
    .neq('estado', 'rejected')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const usuarioIds = [...new Set((solicitudes ?? []).map(s => s.usuario_id).filter(Boolean))]

  if (!usuarioIds.length) {
    return NextResponse.json({ ok: true, enviadas: 0 })
  }

  const { error: insertError } = await supabaseAdmin.from('notificaciones').insert(
    usuarioIds.map(id => ({
      usuario_id: id,
      titulo: 'Certificado médico pendiente',
      mensaje: `Tenés una ausencia por salud en ${nombreMes} sin certificado cargado. Subilo antes del ${finMes.getDate()}/${month + 1} o pasará a ausencia injustificada.`,
      tipo: 'aviso',
      leida: false,
    }))
  )

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  return NextResponse.json({ ok: true, enviadas: usuarioIds.length })
}
