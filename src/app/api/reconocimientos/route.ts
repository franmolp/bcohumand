import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'
import { crearNotificaciones, getAdminIds } from '@/lib/notificaciones'

function getMesCiclo(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).slice(0, 7)
}

function getMesCicloAnterior(): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  now.setMonth(now.getMonth() - 1)
  return now.toLocaleDateString('en-CA').slice(0, 7)
}

// GET: mural público (aprobados del mes actual)
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const mes = searchParams.get('mes') || getMesCiclo()
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'

  const { data: recs, error } = await supabaseAdmin
    .from('reconocimientos')
    .select('id, id_emisor, id_receptor, categoria_pilar, mensaje, anonimo, estado, mes_ciclo, fecha_creacion')
    .eq('mes_ciclo', mes)
    .eq('estado', 'aprobado')
    .order('fecha_creacion', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!recs?.length) return NextResponse.json([])

  const allUserIds = [...new Set([
    ...recs.map(r => r.id_receptor),
    ...recs.filter(r => !r.anonimo || isAdmin).map(r => r.id_emisor),
  ])]

  const { data: usuarios } = await supabase
    .from('usuarios')
    .select('id, nombre, foto_perfil')
    .in('id', allUserIds)

  const userMap: Record<string, { nombre: string; foto_perfil: string | null }> = {}
  for (const u of usuarios ?? []) {
    userMap[u.id] = { nombre: u.nombre, foto_perfil: (u as { foto_perfil?: string | null }).foto_perfil ?? null }
  }

  return NextResponse.json(recs.map(r => ({
    id: r.id,
    receptor: userMap[r.id_receptor] ?? { nombre: 'Usuario', foto_perfil: null },
    emisor: r.anonimo && !isAdmin
      ? null
      : (userMap[r.id_emisor] ?? { nombre: 'Usuario', foto_perfil: null }),
    anonimo: r.anonimo,
    categoria_pilar: r.categoria_pilar,
    mensaje: r.mensaje,
    mes_ciclo: r.mes_ciclo,
    fecha_creacion: r.fecha_creacion,
  })))
}

// POST: crear reconocimiento
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { id_receptor, categoria_pilar, mensaje, anonimo } = body

  if (!id_receptor || !categoria_pilar || !mensaje) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  const validCategorias = ['salvavidas', 'buena_vibra', 'iniciativa']
  if (!validCategorias.includes(categoria_pilar)) {
    return NextResponse.json({ error: 'Categoría inválida' }, { status: 400 })
  }

  if (id_receptor === session.id) {
    return NextResponse.json({ error: 'No podés reconocerte a vos mismo' }, { status: 400 })
  }

  if (typeof mensaje !== 'string' || mensaje.trim().length < 50) {
    return NextResponse.json({ error: 'El mensaje debe tener al menos 50 caracteres' }, { status: 400 })
  }

  const mesCiclo = getMesCiclo()
  const mesCicloAnterior = getMesCicloAnterior()

  // Verificar cuota: máximo 3 por mes (pendientes + aprobados)
  const { count: enviados } = await supabaseAdmin
    .from('reconocimientos')
    .select('id', { count: 'exact', head: true })
    .eq('id_emisor', session.id)
    .eq('mes_ciclo', mesCiclo)
    .neq('estado', 'oculto')

  if ((enviados ?? 0) >= 3) {
    return NextResponse.json({ error: 'Llegaste al límite de 3 reconocimientos por mes' }, { status: 400 })
  }

  // Anti-grupito: misma dupla emisor→receptor en mes actual o anterior
  const { count: dupla } = await supabaseAdmin
    .from('reconocimientos')
    .select('id', { count: 'exact', head: true })
    .eq('id_emisor', session.id)
    .eq('id_receptor', id_receptor)
    .in('mes_ciclo', [mesCiclo, mesCicloAnterior])

  if ((dupla ?? 0) > 0) {
    return NextResponse.json({
      error: 'Ya reconociste a esta persona este mes o el mes pasado. ¡Repartí el amor!',
    }, { status: 400 })
  }

  const { data: rec, error } = await supabaseAdmin
    .from('reconocimientos')
    .insert({
      id_emisor: session.id,
      id_receptor,
      categoria_pilar,
      mensaje: mensaje.trim(),
      anonimo: anonimo === true,
      estado: 'pendiente',
      mes_ciclo: mesCiclo,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notificar admins sobre reconocimiento pendiente
  const adminIds = await getAdminIds()
  if (adminIds.length) {
    const { data: receptor } = await supabase.from('usuarios').select('nombre').eq('id', id_receptor).single()
    await crearNotificaciones(adminIds, {
      titulo: 'Nuevo reconocimiento pendiente',
      mensaje: `${session.nombre} reconoció a ${receptor?.nombre ?? 'un compañero'} — pendiente de moderación`,
      tipo: 'reconocimiento_pendiente',
    })
  }

  return NextResponse.json({ ok: true, id: rec.id }, { status: 201 })
}
