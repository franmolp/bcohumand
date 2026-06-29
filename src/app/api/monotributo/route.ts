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

    const [empRes, allUsersRes, recRes] = await Promise.all([
      supabaseAdmin.from('usuarios').select('id, nombre').eq('monotributo_habilitado', true).eq('estado_cuenta', 'activo').order('nombre'),
      supabaseAdmin.from('usuarios').select('id, nombre'),
      supabaseAdmin.from('monotributo').select('*').eq('mes', mes),
    ])

    const enabledEmps = empRes.data ?? []
    const enabledIds = new Set(enabledEmps.map(e => e.id))
    const records = recRes.data ?? []
    const recMap = new Map(records.map(r => [r.usuario_id, r]))
    const nameMap = new Map((allUsersRes.data ?? []).map(u => [u.id, u.nombre]))

    if (isPast) {
      const extraUploaders = records
        .filter(r => !enabledIds.has(r.usuario_id))
        .map(r => ({ id: r.usuario_id, nombre: nameMap.get(r.usuario_id) ?? '—' }))
      const all = [
        ...enabledEmps.map(e => ({ id: e.id, nombre: e.nombre, record: recMap.get(e.id) ?? null })),
        ...extraUploaders.map(e => ({ id: e.id, nombre: e.nombre, record: recMap.get(e.id) ?? null })),
      ].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      return NextResponse.json(all)
    }

    return NextResponse.json(enabledEmps.map(emp => ({ ...emp, record: recMap.get(emp.id) ?? null })))
  }

  const now = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).slice(0, 7)
  const [cy, cm] = now.split('-').map(Number)
  let dm = cm - 2, dy = cy
  if (dm <= 0) { dm += 12; dy -= 1 }
  const desde = `${dy}-${String(dm).padStart(2, '0')}`
  const { data, error } = await supabase.from('monotributo').select('*').eq('usuario_id', session.id).gte('mes', desde).order('mes', { ascending: false })
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

  const { mes, comprobante_url, comprobante_nombre, factura_url, factura_nombre, usuario_id: bodyUsuarioId } = await req.json()
  if (!mes || !comprobante_url) return NextResponse.json({ error: 'El comprobante es obligatorio' }, { status: 400 })

  const targetUsuarioId = (isAdmin && bodyUsuarioId) ? bodyUsuarioId : session.id

  const { error } = await supabaseAdmin
    .from('monotributo')
    .upsert({
      usuario_id: targetUsuarioId,
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
    .eq('usuario_id', targetUsuarioId)
    .eq('mes', mes)
    .single()

  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  const [yr, mo] = mes.split('-')
  const nombreMes = meses[parseInt(mo) - 1]

  if (isAdmin && targetUsuarioId !== session.id) {
    // Admin cargó en nombre del empleado → notificar al empleado
    await crearNotificaciones([targetUsuarioId], {
      titulo: 'Monotributo cargado',
      mensaje: `Tu comprobante de ${nombreMes} ${yr} fue cargado por el administrador.`,
      tipo: 'monotributo',
    })
  } else {
    // El propio empleado cargó → notificar admin+HR
    const adminHRIds = await getAdminAndHRIds()
    const recipients = adminHRIds.filter(id => id !== session.id)
    if (recipients.length) {
      await crearNotificaciones(recipients, {
        titulo: `Monotributo cargado`,
        mensaje: `${session.nombre} subió el comprobante de ${nombreMes} ${yr}.`,
        tipo: 'monotributo',
      })
    }
  }

  return NextResponse.json(data)
}
