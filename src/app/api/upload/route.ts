import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'
import { gasReady, gasUpload } from '@/lib/gas-upload'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Solo se permiten imágenes o PDF' }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'El archivo supera los 5MB' }, { status: 400 })
    }

    const ext      = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg'
    const fileName = `${session.id}_${Date.now()}.${ext}`
    const bytes    = await file.arrayBuffer()
    const now      = new Date()

    if (gasReady()) {
      const url = await gasUpload({
        bytes, mimeType: file.type, fileName,
        folderType: 'certificados',
        anio: now.getFullYear(),
        mes:  now.getMonth() + 1,
      })
      return NextResponse.json({ url })
    }

    // Fallback: Supabase Storage
    const path = `${session.id}/${Date.now()}.${ext}`
    const { error } = await supabaseAdmin.storage
      .from('certificados')
      .upload(path, new Uint8Array(bytes), { contentType: file.type, upsert: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const { data } = supabaseAdmin.storage.from('certificados').getPublicUrl(path)
    return NextResponse.json({ url: data.publicUrl })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
