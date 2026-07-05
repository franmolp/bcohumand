import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

const GAS_URL    = process.env.GAS_DRIVE_URL ?? ''
const GAS_SECRET = process.env.GAS_SECRET ?? ''

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { tipo } = await request.json() as { tipo: string }
  if (!tipo) return NextResponse.json({ error: 'tipo requerido' }, { status: 400 })

  try {
    const res = await fetch(GAS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ secret: GAS_SECRET, action: 'sync_drive', tipo, mesesAtras: 36 }),
      signal:  AbortSignal.timeout(55000),
    })
    const data = await res.json()

    // Si GAS devuelve la lista de archivos actuales en Drive, sincronizamos borrados
    // GAS puede devolver data.files = string[] con los nombre_archivo vigentes
    let deleted = 0
    if (Array.isArray(data.files)) {
      const driveNames = new Set<string>(data.files as string[])

      // Obtener registros DB del mismo período (últimos 3 meses)
      const cutoff = new Date()
      cutoff.setMonth(cutoff.getMonth() - 36)
      const { data: dbRows } = await supabaseAdmin
        .from('recibos_sueldo')
        .select('id, nombre_archivo')
        .gte('subido_el', cutoff.toISOString())

      const orphanIds = (dbRows ?? [])
        .filter(r => !driveNames.has(r.nombre_archivo))
        .map(r => r.id)

      if (orphanIds.length) {
        await supabaseAdmin.from('recibos_sueldo').delete().in('id', orphanIds)
        deleted = orphanIds.length
      }
    }

    return NextResponse.json({ ...data, deleted })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error al conectar con Drive'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
