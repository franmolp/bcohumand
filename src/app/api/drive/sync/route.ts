import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const maxDuration = 60

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
      body:    JSON.stringify({ secret: GAS_SECRET, action: 'sync_drive', tipo, mesesAtras: 6 }),
      signal:  AbortSignal.timeout(55000),
    })

    // GAS puede devolver HTML en caso de error — capturamos eso explícitamente
    let data: Record<string, unknown>
    try {
      data = await res.json()
    } catch {
      const text = await res.text().catch(() => '')
      const isHtml = text.trimStart().startsWith('<')
      const msg = isHtml
        ? 'Drive no respondió correctamente. Si el historial es muy extenso, intentá de nuevo en unos minutos.'
        : 'Respuesta inesperada de Drive'
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    // Si GAS devuelve la lista de archivos actuales en Drive, sincronizamos borrados
    let deleted = 0
    if (Array.isArray(data.files)) {
      const driveNames = new Set<string>(data.files as string[])

      const cutoff = new Date()
      cutoff.setMonth(cutoff.getMonth() - 6)
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
    const isTimeout = e instanceof Error && e.name === 'TimeoutError'
    const msg = isTimeout
      ? 'La sincronización tardó demasiado. Intentá de nuevo en unos minutos.'
      : (e instanceof Error ? e.message : 'Error al conectar con Drive')
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
