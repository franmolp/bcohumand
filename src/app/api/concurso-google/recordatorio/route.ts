import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { crearNotificaciones } from '@/lib/notificaciones'
import { getConcursoConfig, setConcursoConfig, MENSAJES_RECORDATORIO } from '@/lib/concurso-google'

// Envía a todas las empleadas un recordatorio del juego, rotando entre 3 mensajes.
export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (session.rol !== 'admin' && session.rol !== 'Admin') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const cfg = await getConcursoConfig()
  if (!cfg.activo) return NextResponse.json({ error: 'El concurso no está activo' }, { status: 400 })

  const idx = ((cfg.recordatorioIdx ?? 0) % MENSAJES_RECORDATORIO.length + MENSAJES_RECORDATORIO.length) % MENSAJES_RECORDATORIO.length
  const mensaje = MENSAJES_RECORDATORIO[idx]

  const { data: usuarios } = await supabaseAdmin
    .from('usuarios')
    .select('id')
    .eq('estado_cuenta', 'activo')
  const ids = (usuarios ?? []).map(u => u.id as string)

  await crearNotificaciones(ids, {
    titulo: 'Reseñas de clientas ⭐',
    mensaje,
    tipo: 'concurso_google',
    url: '/dashboard/reconocimientos?tab=resenas',
  })

  // Avanza al siguiente mensaje para la próxima vez
  await setConcursoConfig({ ...cfg, recordatorioIdx: (idx + 1) % MENSAJES_RECORDATORIO.length })

  return NextResponse.json({ ok: true, enviados: ids.length, mensaje })
}
