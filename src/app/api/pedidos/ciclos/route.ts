import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

function nombreCicloAuto(): string {
  const hoy = new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'numeric', year: 'numeric' })
  return `Pedido desde ${hoy}`
}

function hoyISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Si no hay ciclo abierto, crear uno automáticamente
  const { data: abiertos } = await supabaseAdmin
    .from('pedidos_ciclos')
    .select('id')
    .eq('estado', 'abierto')
    .limit(1)

  if (!abiertos?.length) {
    const hoy = hoyISO()
    await supabaseAdmin.from('pedidos_ciclos').insert({
      nombre: nombreCicloAuto(),
      fecha_apertura: hoy,
      fecha_cierre: hoy,
      estado: 'abierto',
    })
  }

  const { data, error } = await supabaseAdmin
    .from('pedidos_ciclos')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
