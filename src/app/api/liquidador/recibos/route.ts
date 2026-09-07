import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

function normNombre(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return nombre
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase()
  const first = parts[0]
  const last  = parts[parts.length - 1]
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() + ' ' + last.charAt(0).toUpperCase()
}

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'

  const p = new URL(request.url).searchParams
  const anio = p.get('anio')
  const mes  = p.get('mes')

  const db = isAdmin ? supabaseAdmin : supabase
  let query = db.from('recibos_sueldo').select('*').order('subido_el', { ascending: false })

  if (isAdmin) {
    if (anio) query = query.eq('anio', parseInt(anio))
    if (mes)  query = query.eq('mes', parseInt(mes))
  } else {
    const nombreNorm = normNombre(session.nombre)
    // Intentar obtener el nombre exacto usado en recibos a través de pagos (por usuario_id)
    const { data: pagoRef } = await supabaseAdmin
      .from('liquidaciones_pagos')
      .select('nombre_excel')
      .eq('usuario_id', session.id)
      .limit(1)
    const nombreExcel = pagoRef?.[0]?.nombre_excel as string | undefined
    const nameFilters = new Set<string>([nombreNorm])
    if (nombreExcel) nameFilters.add(nombreExcel)
    // Traer TODOS los meses de la empleada (por nombre), no solo los últimos 3: antes
    // los recibos de meses más viejos figuraban "pendientes" aunque estuvieran cargados,
    // porque la consulta de pagos devuelve todo el historial y la de recibos lo topeaba
    // a 3 meses. El nombre (primer nombre + inicial del apellido, o el nombre_excel exacto)
    // ya alcanza para no cruzar recibos entre empleadas.
    query = query.in('nombre_empleada', [...nameFilters])
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function DELETE(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const { error } = await supabaseAdmin.from('recibos_sueldo').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { anio, mes, nombre_empleada, nombre_archivo, storage_url } = await request.json()

  const { data, error } = await supabase
    .from('recibos_sueldo')
    .upsert({
      anio, mes, nombre_empleada, nombre_archivo, storage_url,
      estado: 'disponible',
      subido_el: new Date().toISOString(),
    }, { onConflict: 'anio,mes,nombre_empleada' })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
