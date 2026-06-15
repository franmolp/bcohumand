import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { gasReady, gasUpload } from '@/lib/gas-upload'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const tipo = formData.get('tipo') as string | null  // 'comprobante' | 'factura'
  const mes  = formData.get('mes') as string | null   // YYYY-MM

  if (!file || !tipo || !mes) return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'El archivo no puede superar 10 MB' }, { status: 400 })

  const ext   = file.name.split('.').pop()?.toLowerCase() ?? 'pdf'
  const bytes = await file.arrayBuffer()

  try {
    let url: string

    if (gasReady()) {
      const [anioStr, mesStr] = mes.split('-')
      const fileName = `${session.id}_${tipo}.${ext}`
      url = await gasUpload({
        bytes, mimeType: file.type, fileName,
        folderType: 'monotributo',
        anio: parseInt(anioStr),
        mes:  parseInt(mesStr),
      })
    } else {
      const path = `${mes}/${session.id}/${tipo}.${ext}`
      const { error } = await supabaseAdmin.storage.from('monotributo').upload(path, Buffer.from(bytes), {
        contentType: file.type,
        upsert: true,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const { data: { publicUrl } } = supabaseAdmin.storage.from('monotributo').getPublicUrl(path)
      url = publicUrl
    }

    return NextResponse.json({ url, nombre: file.name })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
