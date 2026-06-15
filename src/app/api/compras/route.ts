import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { crearNotificaciones, getAdminIds } from '@/lib/notificaciones'

const ROLES_ALLOWED = ['Admin', 'admin', 'HR', 'Compras', 'Encargada']

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth()
    if (!ROLES_ALLOWED.includes(session.rol)) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

    const isAdmin = session.rol === 'Admin' || session.rol === 'admin' || session.rol === 'HR'
    const { searchParams } = new URL(request.url)
    const mes = searchParams.get('mes')

    let query = supabaseAdmin
      .from('compras')
      .select('*, proveedor:proveedores(nombre), cargado_por:usuarios(nombre)')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })

    if (mes) {
      const [y, m] = mes.split('-')
      const from = `${y}-${m}-01`
      const lastDay = new Date(Number(y), Number(m), 0).getDate()
      const to = `${y}-${m}-${String(lastDay).padStart(2, '0')}`
      query = query.gte('fecha', from).lte('fecha', to)
    }

    if (!isAdmin) query = query.eq('usuario_id', session.id)

    const { data, error } = await query
    if (error) throw error

    const compras = data ?? []
    const total = isAdmin ? compras.reduce((s, c) => s + Number(c.monto), 0) : null
    return NextResponse.json({ compras, total })
  } catch (e) {
    console.error('[GET /api/compras]', e)
    return NextResponse.json({ error: 'Error al obtener compras' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth()
    if (!ROLES_ALLOWED.includes(session.rol)) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

    const body = await request.json()
    const { fecha, proveedor_id, proveedor_nombre, monto, numero_factura, detalle, estado_pago, foto_url } = body

    if (!fecha) return NextResponse.json({ error: 'Fecha requerida' }, { status: 400 })
    if (!monto || Number(monto) <= 0) return NextResponse.json({ error: 'Monto inválido' }, { status: 400 })
    if (!detalle?.trim()) return NextResponse.json({ error: 'El detalle es obligatorio' }, { status: 400 })
    if (!['efectivo', 'transferencia', 'pendiente'].includes(estado_pago)) return NextResponse.json({ error: 'Estado de pago inválido' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('compras')
      .insert({
        fecha,
        proveedor_id: proveedor_id || null,
        proveedor_nombre: proveedor_nombre?.trim() || null,
        monto: Number(monto),
        numero_factura: numero_factura?.trim() || null,
        detalle: detalle?.trim() || null,
        estado_pago,
        foto_url: foto_url ?? null,
        usuario_id: session.id,
        usuario_email: session.email,
      })
      .select('*')
      .single()
    if (error) throw error

    // Si no es admin quien cargó, notificar a admins
    const isAdmin = session.rol === 'Admin' || session.rol === 'admin'
    if (!isAdmin) {
      const adminIds = await getAdminIds()
      if (adminIds.length) {
        await crearNotificaciones(adminIds, {
          titulo: `Nueva compra cargada`,
          mensaje: `${session.nombre} registró $${Number(monto).toLocaleString('es-AR')} — ${detalle?.trim()}`,
          tipo: 'compra',
        })
      }
    }

    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    console.error('[POST /api/compras]', e)
    return NextResponse.json({ error: 'Error al crear compra' }, { status: 500 })
  }
}
