import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { crearNotificaciones } from '@/lib/notificaciones'

function hoyARG(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

function addDias(fecha: string, dias: number): string {
  const d = new Date(fecha + 'T00:00:00')
  d.setDate(d.getDate() + dias)
  return d.toLocaleDateString('en-CA')
}

function formatFecha(fecha: string): string {
  const [, m, d] = fecha.split('-')
  return `${parseInt(d)}/${parseInt(m)}`
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

export async function GET() {
  const authHeader = typeof globalThis !== 'undefined'
    ? undefined
    : undefined

  void authHeader

  const hoy = hoyARG()

  // Leer configuración
  const { data: config } = await supabaseAdmin
    .from('pedidos_config')
    .select('dias_aviso')
    .eq('id', 1)
    .single()

  const diasAviso = config?.dias_aviso ?? 1

  // Buscar ciclos abiertos cuyo cierre cae en hoy + diasAviso
  const fechaObjetivo = addDias(hoy, diasAviso)
  const { data: ciclos } = await supabaseAdmin
    .from('pedidos_ciclos')
    .select('id, nombre, fecha_cierre')
    .eq('estado', 'abierto')
    .eq('fecha_cierre', fechaObjetivo)

  if (!ciclos?.length) {
    return NextResponse.json({ ok: true, enviadas: 0, mensaje: 'Sin ciclos a recordar hoy' })
  }

  // Obtener usuarios con permisos de pedidos
  const { data: permisos } = await supabaseAdmin
    .from('pedidos_permisos')
    .select('usuario_id')

  const usuarioIds = [...new Set((permisos ?? []).map(p => p.usuario_id))]

  if (!usuarioIds.length) {
    return NextResponse.json({ ok: true, enviadas: 0, mensaje: 'Sin usuarios con permisos' })
  }

  let enviadas = 0
  for (const ciclo of ciclos) {
    const diaCierre = new Date(ciclo.fecha_cierre + 'T00:00:00').getDay()
    const mensaje = `El pedido "${ciclo.nombre}" cierra el ${DIAS_SEMANA[diaCierre]} ${formatFecha(ciclo.fecha_cierre)}. ¡No olvides agregar lo que necesitás!`

    await crearNotificaciones(usuarioIds, {
      titulo: '⏰ Recordatorio de pedido',
      mensaje,
      tipo: 'pedido_recordatorio',
    })
    enviadas += usuarioIds.length
  }

  return NextResponse.json({ ok: true, enviadas })
}
