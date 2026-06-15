import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendPushToUsers } from '@/lib/notificaciones'

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  const authHeader = request.headers.get('authorization')
  const bearerSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (secret !== process.env.CRON_SECRET && bearerSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const today = new Date()
  const mm   = String(today.getMonth() + 1).padStart(2, '0')
  const dd   = String(today.getDate()).padStart(2, '0')
  const mmdd = `${mm}-${dd}`

  const { data: users } = await supabase
    .from('usuarios')
    .select('id, nombre, fecha_nacimiento')
    .eq('estado_cuenta', 'activo')
    .not('fecha_nacimiento', 'is', null)

  const todos = users ?? []
  const cumpleaneros = todos.filter(u => u.fecha_nacimiento?.slice(5, 10) === mmdd)

  if (!cumpleaneros.length) return NextResponse.json({ ok: true, enviadas: 0 })

  const allIds = todos.map(u => u.id)
  const inserts: { usuario_id: string; titulo: string; mensaje: string; tipo: string; leida: boolean }[] = []

  for (const c of cumpleaneros) {
    // Notificar a todos los demás
    const recipients = allIds.filter(id => id !== c.id)
    for (const rid of recipients) {
      inserts.push({
        usuario_id: rid,
        titulo: `Hoy es el cumpleaños de ${c.nombre}`,
        mensaje: `¡No te olvides de saludarlo/a!`,
        tipo: 'aviso',
        leida: false,
      })
    }
    // Notificar al cumpleañero
    inserts.push({
      usuario_id: c.id,
      titulo: `¡Feliz cumpleaños, ${c.nombre.split(' ')[0]}!`,
      mensaje: `Todo el equipo te desea un excelente día.`,
      tipo: 'aviso',
      leida: false,
    })
  }

  const { error } = await supabaseAdmin.from('notificaciones').insert(inserts)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Push para todos los que tienen suscripción
  for (const c of cumpleaneros) {
    const recipients = allIds.filter(id => id !== c.id)
    await sendPushToUsers(recipients, `Hoy es el cumpleaños de ${c.nombre}`, `¡No te olvides de saludarlo/a!`).catch(() => {})
    await sendPushToUsers([c.id], `¡Feliz cumpleaños, ${c.nombre.split(' ')[0]}!`, `Todo el equipo te desea un excelente día.`).catch(() => {})
  }

  return NextResponse.json({ ok: true, enviadas: inserts.length, cumpleaneros: cumpleaneros.map(u => u.nombre) })
}
