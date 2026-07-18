import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { crearNotificaciones } from '@/lib/notificaciones'

const TEXTOS = [
  '¿Alguien del equipo te salvó el día, te contagió buena onda o tomó la iniciativa? Reconocela con un mensaje y hacela sentir valorada.',
  'Reconocer a alguien del equipo tarda 2 minutos y puede cambiarle el día. ¿A quién querés destacar este mes?',
  'Cada persona del equipo hace algo que vale la pena decirle. Contale a alguien lo que hace bien y por qué importa.',
]

export async function POST() {
  const session = await getSession()
  if (!session || (session.rol !== 'admin' && session.rol !== 'Admin')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { data: users } = await supabase
    .from('usuarios')
    .select('id')
    .eq('estado_cuenta', 'activo')

  const ids = (users ?? []).map((u: { id: string }) => u.id)
  if (!ids.length) return NextResponse.json({ ok: true, enviadas: 0 })

  const idx = new Date().getDate() % TEXTOS.length
  await crearNotificaciones(ids, {
    titulo: '¡Reconocé a un compañero/a! 🏆',
    mensaje: TEXTOS[idx],
    tipo: 'reconocimiento_recordatorio',
  })

  return NextResponse.json({ ok: true, enviadas: ids.length })
}
