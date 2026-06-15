import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { gasReady, gasUpload } from '@/lib/gas-upload'
import { crearNotificacion } from '@/lib/notificaciones'

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  try {
    const formData      = await request.formData()
    const file          = formData.get('file') as File | null
    const anioStr       = formData.get('anio') as string
    const mesStr        = formData.get('mes') as string
    const nombre        = formData.get('nombre') as string
    const nombreArchivo = formData.get('nombre_archivo') as string

    if (!file || !anioStr || !mesStr || !nombre || !nombreArchivo) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Solo se permiten archivos PDF' }, { status: 400 })
    }

    const anio  = parseInt(anioStr)
    const mes   = parseInt(mesStr)
    const bytes = await file.arrayBuffer()

    let url: string

    if (gasReady()) {
      url = await gasUpload({
        bytes, mimeType: 'application/pdf', fileName: nombreArchivo,
        folderType: 'liquidaciones',
        anio, mes,
      })
    } else {
      const storagePath = `${anio}/${String(mes).padStart(2, '0')}/${nombreArchivo}`
      const { error: uploadError } = await supabaseAdmin.storage
        .from('recibos-sueldo')
        .upload(storagePath, new Uint8Array(bytes), { contentType: 'application/pdf', upsert: true })
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
      // Buscar el empleado por nombre y notificarle
      const { data: emp } = await supabase
        .from('usuarios')
        .select('id')
        .ilike('nombre', nombre)
        .eq('estado_cuenta', 'activo')
        .maybeSingle()

      if (emp?.id) {
        const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
        await crearNotificacion({
          usuario_id: emp.id,
          titulo: `Tu recibo de sueldo está disponible`,
          mensaje: `Ya podés ver tu liquidación de ${meses[mes - 1]} ${anio}.`,
          tipo: 'aviso',
        })
      }
    }

    return NextResponse.json({ url })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
