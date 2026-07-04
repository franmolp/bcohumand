import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'
import { gasReady, gasUploadBase64 } from '@/lib/gas-upload'
import { crearNotificacion } from '@/lib/notificaciones'

const MESES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

// Mismo algoritmo que normNombre() en el GET — convierte "Rocio Ojeda" → "Rocio O"
function normNombre(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return nombre
  const first = parts[0]
  const last  = parts[parts.length - 1]
  if (parts.length === 1) return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() + ' ' + last.charAt(0).toUpperCase()
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  try {
    const body          = await request.json()
    const base64        = body.base64 as string | undefined
    const anioStr       = body.anio as string
    const mesStr        = body.mes as string
    const nombre        = body.nombre as string
    const nombreArchivo = body.nombre_archivo as string

    const missing = [
      !base64        && 'base64',
      !anioStr       && 'anio',
      !mesStr        && 'mes',
      !nombre        && 'nombre',
      !nombreArchivo && 'nombre_archivo',
    ].filter(Boolean)
    if (missing.length) {
      console.error('[upload] campos faltantes:', missing, '| base64 len:', base64?.length ?? 0)
      return NextResponse.json({ error: `Faltan campos: ${missing.join(', ')}` }, { status: 400 })
    }

    const anio = parseInt(anioStr)
    const mes  = parseInt(mesStr)

    let url: string

    if (gasReady()) {
      url = await gasUploadBase64({
        base64, mimeType: 'application/pdf', fileName: nombreArchivo,
        folderType: 'liquidaciones',
        anio, mes,
      })
    } else {
      const pdfBytes    = Buffer.from(base64, 'base64')
      const storagePath = `${anio}/${String(mes).padStart(2, '0')}/${nombreArchivo}`
      const { error: uploadError } = await supabaseAdmin.storage
        .from('recibos-sueldo')
        .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true })
      if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })
      const { data: urlData } = supabaseAdmin.storage.from('recibos-sueldo').getPublicUrl(storagePath)
      url = urlData.publicUrl
    }

    const { error: dbError } = await supabaseAdmin
      .from('recibos_sueldo')
      .upsert({
        anio, mes,
        nombre_empleada: nombre,
        nombre_archivo:  nombreArchivo,
        storage_url:     url,
        estado:          'disponible',
        subido_el:       new Date().toISOString(),
      }, { onConflict: 'anio,mes,nombre_empleada' })

    if (dbError) {
      console.error('DB register error:', dbError.message)
    } else {
      // Notificar al empleado — buscar por nombre normalizado
      try {
        const { data: users } = await supabaseAdmin
          .from('usuarios')
          .select('id, nombre')
          .eq('estado_cuenta', 'activo')
        const emp = users?.find(u => normNombre(u.nombre) === nombre)
        if (emp?.id) {
          const mesNombre = MESES_ES[mes - 1] ?? String(mes)
          await crearNotificacion({
            usuario_id: emp.id,
            titulo:     'Nuevo recibo de sueldo',
            mensaje:    `Tu recibo de ${mesNombre} ${anio} ya está disponible`,
            tipo:       'recibo',
          })
        }
      } catch (notifErr) {
        console.error('Error al enviar notificación de recibo:', notifErr)
      }
    }

    return NextResponse.json({ url })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
