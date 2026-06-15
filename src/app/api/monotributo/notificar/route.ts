import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  const session = await getSession()
  const cronSecret = process.env.CRON_SECRET
  const isCron = cronSecret && req.headers.get('authorization') === `Bearer ${cronSecret}`

  if (!isCron && (!session || (session.rol !== 'admin' && session.rol !== 'Admin')))
    return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  const lastDay = new Date(year, month + 1, 0).getDate()
  const daysLeft = lastDay - today.getDate()

  if (daysLeft > 3) return NextResponse.json({ message: `Faltan ${daysLeft} días para fin de mes`, notified: 0 })

  const mes = `${year}-${String(month + 1).padStart(2, '0')}`
  const startOfMonth = new Date(year, month, 1).toISOString()

  const [empRes, recRes, yaNotifRes] = await Promise.all([
    supabase.from('usuarios').select('id, nombre').eq('monotributo_habilitado', true).neq('estado_cuenta', 'inactiva'),
    supabase.from('monotributo').select('usuario_id').eq('mes', mes),
    supabase.from('notificaciones').select('usuario_id').eq('titulo', 'Monotributo pendiente').gte('created_at', startOfMonth),
  ])

  const submitted = new Set((recRes.data ?? []).map(r => r.usuario_id))
  const yaNotificados = new Set((yaNotifRes.data ?? []).map(n => n.usuario_id))

  const pendientes = (empRes.data ?? []).filter(e => !submitted.has(e.id) && !yaNotificados.has(e.id))
  if (pendientes.length === 0) return NextResponse.json({ notified: 0 })

  const { error } = await supabaseAdmin.from('notificaciones').insert(
    pendientes.map(emp => ({
      usuario_id: emp.id,
      titulo: 'Monotributo pendiente',
      mensaje: `Recordá presentar el comprobante de monotributo antes del ${lastDay}/${month + 1}.`,
      tipo: 'warning',
      leida: false,
    }))
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ notified: pendientes.length })
}
