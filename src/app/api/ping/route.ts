import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

function parseDevice(ua: string): string {
  if (!ua) return 'Desconocido'
  let device = 'PC'
  if (/iPhone/i.test(ua))      device = 'iPhone'
  else if (/iPad/i.test(ua))   device = 'iPad'
  else if (/Android/i.test(ua)) device = 'Android'
  else if (/Mac/i.test(ua))    device = 'Mac'
  else if (/Windows/i.test(ua)) device = 'Windows'

  let browser = ''
  if (/Edg\//i.test(ua))         browser = 'Edge'
  else if (/Chrome/i.test(ua))   browser = 'Chrome'
  else if (/Safari/i.test(ua))   browser = 'Safari'
  else if (/Firefox/i.test(ua))  browser = 'Firefox'

  return browser ? `${device} · ${browser}` : device
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'desconocida'
  const ua = request.headers.get('user-agent') ?? ''
  const dispositivo = parseDevice(ua)
  const now = new Date().toISOString()

  // Update ultimo_acceso on the user row
  await supabaseAdmin
    .from('usuarios')
    .update({ ultimo_acceso: now, ultimo_dispositivo: dispositivo })
    .eq('id', session.id)

  // Insert activity log
  await supabaseAdmin.from('log_seguridad').insert({
    usuario_id: session.id,
    accion: 'Ingresó a la app',
    detalle: dispositivo,
    ip,
  })

  // Cleanup: keep only latest 10000 rows
  const { count } = await supabaseAdmin
    .from('log_seguridad')
    .select('*', { count: 'exact', head: true })

  if ((count ?? 0) > 10000) {
    const excess = (count ?? 0) - 10000
    const { data: oldest } = await supabaseAdmin
      .from('log_seguridad')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(excess)
    if (oldest?.length) {
      await supabaseAdmin
        .from('log_seguridad')
        .delete()
        .in('id', oldest.map((r: { id: unknown }) => r.id))
    }
  }

  return NextResponse.json({ ok: true })
}
