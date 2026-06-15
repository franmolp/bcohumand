import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const publicKey  = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const email      = process.env.VAPID_EMAIL

  if (!publicKey || !privateKey || !email) {
    return NextResponse.json({ error: 'VAPID keys no configuradas en .env.local' }, { status: 503 })
  }

  const { data: subs, error: dbErr } = await supabaseAdmin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('usuario_id', session.id)

  if (dbErr) return NextResponse.json({ error: `DB error: ${dbErr.message}` }, { status: 500 })
  if (!subs?.length) return NextResponse.json({ error: 'No hay suscripciones guardadas para este usuario' }, { status: 404 })

  const webpush = (await import('web-push')).default
  webpush.setVapidDetails(`mailto:${email}`, publicKey, privateKey)

  const payload = JSON.stringify({
    titulo: 'Notificaciones activadas',
    mensaje: '¡No te pierdas de nada!',
    url: '/dashboard/notificaciones',
  })

  const results = await Promise.allSettled(
    subs.map(s =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      )
    )
  )

  const details = results.map((r, i) =>
    r.status === 'fulfilled'
      ? { sub: i, ok: true, status: r.value.statusCode }
      : { sub: i, ok: false, error: (r.reason as Error)?.message, statusCode: (r.reason as { statusCode?: number })?.statusCode }
  )

  const allOk = details.every(d => d.ok)
  return NextResponse.json({ ok: allOk, subs: subs.length, details })
}
