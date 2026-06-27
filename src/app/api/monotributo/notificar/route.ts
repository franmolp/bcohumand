import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function notificar(req: NextRequest, isCron: boolean) {
  const tz = 'America/Argentina/Buenos_Aires'
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: tz })
  const [year, month, day] = todayStr.split('-').map(Number)
  const lastDay = new Date(year, month, 0).getDate()
  const daysLeft = lastDay - day

  // Cron automático: solo dispara exactamente 3 días antes y 1 día antes del cierre
  if (isCron && daysLeft !== 3 && daysLeft !== 1)
    return NextResponse.json({ message: `Faltan ${daysLeft} días para fin de mes`, notified: 0 })

  const mes = `${year}-${String(month).padStart(2, '0')}`

  const [empRes, recRes] = await Promise.all([
    supabase.from('usuarios').select('id, nombre').eq('monotributo_habilitado', true).neq('estado_cuenta', 'inactiva'),
    supabase.from('monotributo').select('usuario_id').eq('mes', mes),
  ])

  const submitted = new Set((recRes.data ?? []).map(r => r.usuario_id))
  const pendientes = (empRes.data ?? []).filter(e => !submitted.has(e.id))

  if (pendientes.length === 0) return NextResponse.json({ notified: 0 })

  const { error } = await supabaseAdmin.from('notificaciones').insert(
    pendientes.map(emp => ({
      usuario_id: emp.id,
      titulo: 'Monotributo pendiente',
      mensaje: `Recordá presentar el comprobante de monotributo antes del ${lastDay}/${month}.`,
      tipo: 'monotributo',
      leida: false,
    }))
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ notified: pendientes.length })
}

// Vercel crons invocan GET
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const isCron = !!(cronSecret && req.headers.get('authorization') === `Bearer ${cronSecret}`)
  if (!isCron) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
  return notificar(req, true)
}

// Botón manual del admin invoca POST
export async function POST(req: NextRequest) {
  const session = await getSession()
  const cronSecret = process.env.CRON_SECRET
  const isCron = !!(cronSecret && req.headers.get('authorization') === `Bearer ${cronSecret}`)
  if (!isCron && (!session || (session.rol !== 'admin' && session.rol !== 'Admin')))
    return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
  return notificar(req, isCron)
}
