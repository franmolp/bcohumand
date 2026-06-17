import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { crearNotificacion, crearNotificaciones, getAdminIds } from '@/lib/notificaciones'
import { DEFAULT_CONFIG } from './config/route'

function nextMonthStr(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

async function getConfig() {
  const { data } = await supabaseAdmin
    .from('configuracion')
    .select('valor')
    .eq('clave', 'adelantos_config')
    .maybeSingle()
  return (data?.valor as typeof DEFAULT_CONFIG) ?? DEFAULT_CONFIG
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  const { searchParams } = new URL(req.url)
  const mes = searchParams.get('mes')
  const estado = searchParams.get('estado')

  let query = supabaseAdmin.from('adelantos').select('*')

  if (!isAdmin) {
    query = query.eq('usuario_id', session.id)
  } else {
    if (mes) {
      query = query
        .gte('created_at', `${mes}-01T00:00:00`)
        .lt('created_at', `${nextMonthStr(mes)}-01T00:00:00`)
    }
    if (estado) {
      query = query.eq('estado', estado)
    }
  }

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  const body = await req.json()

  if (isAdmin) {
    const { usuario_id, empleado_nombre, monto, comentario_admin } = body
    if (!usuario_id || !empleado_nombre || !monto) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('adelantos')
      .insert({
        usuario_id,
        empleado_nombre,
        monto: Number(monto),
        monto_aprobado: Number(monto),
        estado: 'approved',
        comentario_admin: comentario_admin || null,
        aprobado_por: session.id,
        creado_por_admin: true,
        fecha_respuesta: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await crearNotificacion({
      usuario_id,
      titulo: 'Se registró un adelanto',
      mensaje: `$${Number(monto).toLocaleString('es-AR')}${comentario_admin ? ` · ${comentario_admin}` : ''}`,
      tipo: 'adelanto_aprobado',
    })

    return NextResponse.json(data, { status: 201 })
  }

  // Employee request
  const config = await getConfig()
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  const day = now.getDate()
  const mesStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monto = Number(body.monto)

  if (day < config.dia_habilitacion) {
    return NextResponse.json(
      { error: `Los adelantos se habilitan a partir del día ${config.dia_habilitacion} de cada mes` },
      { status: 400 }
    )
  }
  if (!monto || monto <= 0) return NextResponse.json({ error: 'Monto inválido' }, { status: 400 })
  if (monto < config.monto_minimo) {
    return NextResponse.json({ error: `El monto mínimo es $${config.monto_minimo.toLocaleString('es-AR')}` }, { status: 400 })
  }
  const { data: existing } = await supabaseAdmin
    .from('adelantos')
    .select('id, monto')
    .eq('usuario_id', session.id)
    .neq('estado', 'rejected')
    .gte('created_at', `${mesStr}-01T00:00:00`)
    .lt('created_at', `${nextMonthStr(mesStr)}-01T00:00:00`)

  if ((existing?.length ?? 0) >= config.max_por_mes) {
    return NextResponse.json(
      { error: `Ya alcanzaste el límite de ${config.max_por_mes} adelanto${config.max_por_mes !== 1 ? 's' : ''} por mes` },
      { status: 400 }
    )
  }

  const totalExistente = (existing ?? []).reduce((s, a) => s + Number(a.monto), 0)
  if (totalExistente + monto > config.monto_maximo) {
    return NextResponse.json(
      { error: `El límite mensual es $${config.monto_maximo.toLocaleString('es-AR')}. Ya tenés $${totalExistente.toLocaleString('es-AR')} solicitados este mes` },
      { status: 400 }
    )
  }

  const { data, error } = await supabaseAdmin
    .from('adelantos')
    .insert({
      usuario_id: session.id,
      empleado_nombre: session.nombre,
      monto,
      estado: 'pending',
      comentario_empleado: body.comentario_empleado || null,
      creado_por_admin: false,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const adminIds = await getAdminIds()
  await crearNotificaciones(adminIds, {
    titulo: `Adelanto solicitado — ${session.nombre}`,
    mensaje: `$${monto.toLocaleString('es-AR')}${body.comentario_empleado ? ` · ${body.comentario_empleado}` : ''}`,
    tipo: 'adelanto_solicitado',
  })

  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { id, estado, monto_aprobado, comentario_admin } = await req.json()
  if (!id || !estado) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

  const { data: adelanto } = await supabaseAdmin
    .from('adelantos')
    .select('usuario_id, monto')
    .eq('id', id)
    .single()

  if (!adelanto) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const montoFinal = estado === 'approved' ? Number(monto_aprobado ?? adelanto.monto) : null

  const { error } = await supabaseAdmin
    .from('adelantos')
    .update({
      estado,
      monto_aprobado: montoFinal,
      comentario_admin: comentario_admin || null,
      aprobado_por: session.id,
      fecha_respuesta: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const partes = [
    montoFinal ? `$${montoFinal.toLocaleString('es-AR')}` : '',
    comentario_admin || '',
  ].filter(Boolean).join(' · ')

  await crearNotificacion({
    usuario_id: adelanto.usuario_id,
    titulo: estado === 'approved' ? 'Tu adelanto fue aprobado' : 'Tu adelanto fue rechazado',
    mensaje: partes,
    tipo: estado === 'approved' ? 'adelanto_aprobado' : 'adelanto_rechazado',
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const { data: adelanto } = await supabaseAdmin
    .from('adelantos')
    .select('usuario_id, estado')
    .eq('id', id)
    .single()

  if (!adelanto) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  if (!isAdmin) {
    if (adelanto.usuario_id !== session.id)
      return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    if (adelanto.estado !== 'pending')
      return NextResponse.json({ error: 'Solo podés cancelar adelantos pendientes' }, { status: 400 })
  }

  const { error } = await supabaseAdmin.from('adelantos').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
