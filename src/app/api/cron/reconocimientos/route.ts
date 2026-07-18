import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { crearNotificaciones } from '@/lib/notificaciones'

const TEXTOS = [
  '¿Alguien del equipo la rompió este mes? Dejale un reconocimiento.',
  'Un pequeño gesto puede hacer un gran día. ¿A quién le dedicás un reconocimiento hoy?',
  'El reconocimiento entre compañeros fortalece al equipo. ¿Quién se merece uno?',
]

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  const authHeader = request.headers.get('authorization')
  const bearerSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (secret !== process.env.CRON_SECRET && bearerSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { data: users } = await supabase
    .from('usuarios')
    .select('id')
    .eq('estado_cuenta', 'activo')

  const ids = (users ?? []).map((u: { id: string }) => u.id)
  if (!ids.length) return NextResponse.json({ ok: true, enviadas: 0 })

  const idx = new Date().getDate() % TEXTOS.length
  const mensaje = TEXTOS[idx]

  await crearNotificaciones(ids, {
    titulo: '¡Reconocé a un compañero/a! 🏆',
    mensaje,
    tipo: 'reconocimiento_recordatorio',
  })

  return NextResponse.json({ ok: true, enviadas: ids.length })
}
