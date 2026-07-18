import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

function getMesCiclo(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).slice(0, 7)
}

function getMesCicloAnterior(): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  now.setMonth(now.getMonth() - 1)
  return now.toLocaleDateString('en-CA').slice(0, 7)
}

// GET: compañeros disponibles para reconocer + cuota restante
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const mesCiclo = getMesCiclo()
  const mesCicloAnterior = getMesCicloAnterior()

  // Cuota utilizada este mes
  const { count: enviados } = await supabaseAdmin
    .from('reconocimientos')
    .select('id', { count: 'exact', head: true })
    .eq('id_emisor', session.id)
    .eq('mes_ciclo', mesCiclo)
    .neq('estado', 'oculto')

  const cuotaUsada = enviados ?? 0
  const cuotaRestante = Math.max(0, 3 - cuotaUsada)

  // IDs ya reconocidos en mes actual o anterior (anti-grupito)
  const { data: yaReconocidos } = await supabaseAdmin
    .from('reconocimientos')
    .select('id_receptor')
    .eq('id_emisor', session.id)
    .in('mes_ciclo', [mesCiclo, mesCicloAnterior])

  const bloqueados = new Set((yaReconocidos ?? []).map(r => r.id_receptor))

  // Todos los usuarios activos excepto yo mismo
  const { data: usuarios } = await supabase
    .from('usuarios')
    .select('id, nombre, foto_perfil, equipo_id')
    .eq('estado_cuenta', 'activo')
    .neq('id', session.id)

  const disponibles = (usuarios ?? []).map(u => ({
    id: u.id,
    nombre: u.nombre,
    foto_perfil: (u as { foto_perfil?: string | null }).foto_perfil ?? null,
    bloqueado: bloqueados.has(u.id),
  }))

  return NextResponse.json({ cuotaRestante, cuotaUsada, disponibles })
}
