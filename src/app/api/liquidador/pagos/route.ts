import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession, requireAdmin } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'

  if (isAdmin) {
    const anio = searchParams.get('anio')
    const mes = searchParams.get('mes')
    if (!anio || !mes) return NextResponse.json({ error: 'anio y mes requeridos' }, { status: 400 })
    const { data, error } = await supabaseAdmin
      .from('liquidaciones_pagos')
      .select('id, nombre_excel, usuario_id, total, efectivo, transferencia')
      .eq('anio', Number(anio))
      .eq('mes', Number(mes))
      .order('nombre_excel')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  // Employee: returns all months for their own usuario_id
  const { data, error } = await supabaseAdmin
    .from('liquidaciones_pagos')
    .select('anio, mes, total, efectivo, transferencia')
    .eq('usuario_id', session.id)
    .order('anio', { ascending: false })
    .order('mes', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
    const { anio, mes, filas, replace } = await request.json()
    if (!anio || !mes || !Array.isArray(filas) || filas.length === 0) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
    }

    // Resolve usuario_id by matching nombre_excel against usuarios.nombre
    const nombres = filas.map((f: { nombre: string }) => f.nombre)
    const { data: usuarios } = await supabaseAdmin
      .from('usuarios')
      .select('id, nombre')
      .in('nombre', nombres)

    const userMap = new Map((usuarios ?? []).map((u: { id: string; nombre: string }) => [u.nombre, u.id]))

    const rows = filas.map((f: { nombre: string; total: number; efectivo: number; transferencia: number }) => ({
      anio: Number(anio),
      mes: Number(mes),
      nombre_excel: f.nombre,
      usuario_id: userMap.get(f.nombre) ?? null,
      total: Math.round(f.total),
      efectivo: Math.round(f.efectivo),
      transferencia: Math.round(f.transferencia),
    }))

    if (replace) {
      // Reimport: borrar todo el mes y reinsertar
      const { error: delErr } = await supabaseAdmin
        .from('liquidaciones_pagos')
        .delete()
        .eq('anio', Number(anio))
        .eq('mes', Number(mes))
      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
      const { error } = await supabaseAdmin.from('liquidaciones_pagos').insert(rows)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { error } = await supabaseAdmin
        .from('liquidaciones_pagos')
        .upsert(rows, { onConflict: 'anio,mes,nombre_excel' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, importados: rows.length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al importar'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
