import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

// GET — returns array of usuario_ids with at least one active push subscription (admin only)
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json([], { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json([], { status: 403 })

  const { data } = await supabaseAdmin
    .from('push_subscriptions')
    .select('usuario_id')

  const ids = [...new Set((data ?? []).map(r => r.usuario_id))]
  return NextResponse.json(ids)
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sub = await request.json().catch(() => null)
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return NextResponse.json({ error: 'Suscripción inválida' }, { status: 400 })
  }

  // Si este endpoint ya pertenece a otro usuario (mismo dispositivo, distinto login), lo removemos
  await supabaseAdmin
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', sub.endpoint)
    .neq('usuario_id', session.id)

  const { error } = await supabaseAdmin
    .from('push_subscriptions')
    .upsert({
      usuario_id: session.id,
      endpoint:   sub.endpoint,
      p256dh:     sub.keys.p256dh,
      auth:       sub.keys.auth,
    }, { onConflict: 'usuario_id,endpoint' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { endpoint } = await request.json().catch(() => ({}))
  if (endpoint) {
    await supabaseAdmin
      .from('push_subscriptions')
      .delete()
      .eq('usuario_id', session.id)
      .eq('endpoint', endpoint)
  } else {
    await supabaseAdmin
      .from('push_subscriptions')
      .delete()
      .eq('usuario_id', session.id)
  }

  return NextResponse.json({ ok: true })
}
