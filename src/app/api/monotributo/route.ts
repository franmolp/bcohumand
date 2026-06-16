import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { crearNotificaciones, getAdminAndHRIds } from '@/lib/notificaciones'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  const mes = new URL(req.url).searchParams.get('mes') ?? new Date().toISOString().slice(0, 7)

  if (isAdmin) {
    const currentMes = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).slice(0, 7)
    const isPast = mes < currentMes

    const [empRes, recRes] = await Promise.all([
      supabase.from('usuarios').select('id, nombre').eq('monotributo_habilitado', true).eq('estado_cuenta', 'activo').order('nombre'),
      supabaseAdmin.from('monotributo').select('*, usuario:usuarios(nombre)').eq('mes', mes),
    ])

    const enabledIds = new Set((empRes.data ?? []).map(e => e.id))
    const records = recRes.data ?? []
    const recMap = new Map(records.map(r => [r.usuario_id, r]))

    if (isPast) {
      // Meses pasados: enabled activos + cualquiera que haya subido (aunque esté desactivado)
      const extraUploaders = records
        .filter(r => !enabledIds.has(r.usuario_id))
        .map(r => ({ id: r.usuario_id, nombre: (r.usuario as { nombre: string } | null)?.nombre ?? '—' }))
      const all = [
        ...(empRes.data ?? []).map(e => ({ id: e.id, nombre: e.nombre, record: recMap.get(e.id) ?? null })),
        ...extraUploaders.map(e => ({ id: e.id, nombre: e.nombre, record: recMap.get(e.id) ?? null })),
      ].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      return NextResponse.json(all)
    }

    // Mes en curso: solo empleados activos habilitados
    return NextResponse.json((empRes.data ?? []).map(emp => ({ ...emp, record: recMap.get(emp.id) ?? null })))
  }

  const { data, error } = await supabase.from('monotributo').select('*').eq('usuario_id', session.id).order('mes', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) {
    const { data: emp } = await supabase.from('usuarios').select('monotributo_habilitado').eq('id', session.id).single()
    if (!emp?.monotributo_habilitado) return NextResponse.json({ error: 'No habilitado' }, { status: 403 })
  }

  const { mes, comprobante_url, comprobante_nombre, factura_url, factura_nombre } = await req.json()
  if (!mes || !comprobante_url) return NextResponse.json({ error: 'El comprobante es obligatorio' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('monotributo')
    .upsert({
      usuario_id: session.id,
      mes,
      comprobante_url,
      comprobante_nombre: comprobante_nombre ?? null,
      factura_url: factura_url ?? null,
      factura_nombre: factura_nombre ?? null,
      fecha_carga: new Date().toISOString(),
    }, { onConflict: 'usuario_id,mes' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data } = await supabaseAdmin
    .from('monotributo')
    .select('*')
    .eq('usuario_id', session.id)
    .eq('mes', mes)
    .single()

  // Notificar admin+HR que el empleado cargó su monotributo
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  const [yr, mo] = mes.split('-')
  const nombreMes = meses[parseInt(mo) - 1]
  const adminHRIds = await getAdminAndHRIds()
  const recipients = adminHRIds.filter(id => id !== session.id)
  if (recipients.length) {
    await crearNotificaciones(recipients, {
      titulo: `Monotributo cargado`,
      mensaje: `${session.nombre} subió el comprobante de ${nombreMes} ${yr}.`,
      tipo: 'monotributo',
    })
  }

  return NextResponse.json(data)
}
