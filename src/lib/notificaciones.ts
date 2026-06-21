import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'

export type TipoNotif =
  | 'solicitud_nueva'
  | 'solicitud_aprobada'
  | 'solicitud_rechazada'
  | 'solicitud_creada_admin'
  | 'solicitud_modificada'
  | 'evento_especial'
  | 'feriado'
  | 'compra'
  | 'monotributo'
  | 'mural_post'
  | 'mural_respuesta'
  | 'recibo'
  | 'aviso'
  | 'warning'
  | 'adelanto_solicitado'
  | 'adelanto_aprobado'
  | 'adelanto_rechazado'
  | 'reparacion_nueva'
  | 'reparacion_actualizada'

export async function sendPushToUsers(usuarioIds: string[], titulo: string, mensaje: string) {
  const publicKey  = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const email      = process.env.VAPID_EMAIL
  if (!publicKey || !privateKey || !email) return

  const { data: subs } = await supabaseAdmin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('usuario_id', usuarioIds)

  if (!subs?.length) return

  const webpush = (await import('web-push')).default
  webpush.setVapidDetails(`mailto:${email}`, publicKey, privateKey)
  const payload = JSON.stringify({ titulo, mensaje, url: '/dashboard/notificaciones' })

  await Promise.allSettled(
    subs.map(s =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload
      ).catch(() => {})
    )
  )
}

export async function crearNotificacion(data: {
  usuario_id: string
  titulo: string
  mensaje?: string
  tipo: TipoNotif
}) {
  await supabaseAdmin.from('notificaciones').insert({
    usuario_id: data.usuario_id,
    titulo: data.titulo,
    mensaje: data.mensaje ?? '',
    tipo: data.tipo,
    leida: false,
  })
  await sendPushToUsers([data.usuario_id], data.titulo, data.mensaje ?? '').catch(() => {})
}

export async function crearNotificaciones(
  usuario_ids: string[],
  data: { titulo: string; mensaje?: string; tipo: TipoNotif }
) {
  if (!usuario_ids.length) return
  const { error } = await supabaseAdmin.from('notificaciones').insert(
    usuario_ids.map(id => ({
      usuario_id: id,
      titulo: data.titulo,
      mensaje: data.mensaje ?? '',
      tipo: data.tipo,
      leida: false,
    }))
  )
  if (error) console.log('[notif] insert error:', error)
  await sendPushToUsers(usuario_ids, data.titulo, data.mensaje ?? '').catch(() => {})
}

export async function getAdminIds(): Promise<string[]> {
  const { data: roles } = await supabase
    .from('roles')
    .select('id')
    .ilike('nombre', 'admin')
  if (!roles?.length) return []
  const rolIds = roles.map((r: { id: number }) => r.id)
  const { data: users } = await supabase
    .from('usuarios')
    .select('id')
    .in('rol_id', rolIds)
    .eq('estado_cuenta', 'activo')
  return (users ?? []).map((u: { id: string }) => u.id)
}

export async function getAdminAndHRIds(): Promise<string[]> {
  const { data: roles } = await supabase
    .from('roles')
    .select('id')
    .or('nombre.ilike.admin,nombre.eq.HR')
  if (!roles?.length) return []
  const rolIds = roles.map((r: { id: number }) => r.id)
  const { data: users } = await supabase
    .from('usuarios')
    .select('id')
    .in('rol_id', rolIds)
    .eq('estado_cuenta', 'activo')
  return (users ?? []).map((u: { id: string }) => u.id)
}

export async function getAllUserIds(excludeId?: string): Promise<string[]> {
  const { data } = await supabase
    .from('usuarios')
    .select('id')
    .eq('estado_cuenta', 'activo')
  return (data ?? [])
    .map((u: { id: string }) => u.id)
    .filter((id: string) => id !== excludeId)
}

export async function getUserIdsByEquipo(equipoNombre: string): Promise<string[]> {
  const { data: eq } = await supabase
    .from('equipos')
    .select('id')
    .eq('nombre', equipoNombre)
    .single()
  if (!eq) return []
  const { data } = await supabase
    .from('usuarios')
    .select('id')
    .eq('equipo_id', eq.id)
    .eq('estado_cuenta', 'activo')
  return (data ?? []).map((u: { id: string }) => u.id)
}

export async function getUserIdsByRol(rolNombre: string): Promise<string[]> {
  const { data: roles } = await supabase
    .from('roles')
    .select('id')
    .ilike('nombre', rolNombre)
  if (!roles?.length) return []
  const rolIds = roles.map((r: { id: number }) => r.id)
  const { data } = await supabase
    .from('usuarios')
    .select('id')
    .in('rol_id', rolIds)
    .eq('estado_cuenta', 'activo')
  return (data ?? []).map((u: { id: string }) => u.id)
}
