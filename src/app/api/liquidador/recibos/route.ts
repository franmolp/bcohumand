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
    const nowStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).slice(0, 7)
    const [cy, cm] = nowStr.split('-').map(Number)
    const months: { anio: number; mes: number }[] = []
    let ty = cy, tm = cm
    for (let i = 0; i < 3; i++) {
      months.push({ anio: ty, mes: tm })
      if (--tm === 0) { tm = 12; ty-- }
    }
    const nombreNorm = normNombre(session.nombre)
    query = query
      .eq('nombre_empleada', nombreNorm)
      .or(months.map(({ anio, mes }) => `and(anio.eq.${anio},mes.eq.${mes})`).join(','))
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
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
