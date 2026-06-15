import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { gasReady, gasUpload } from '@/lib/gas-upload'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
const MAX_SIZE = 10 * 1024 * 1024 // 10MB
const ROLES_ALLOWED = ['Admin', 'admin', 'Compras', 'Encargada']

export async function POST(request: NextRequest) {
  const session = await requireAuth()
  if (!ROLES_ALLOWED.includes(session.rol)) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  if (!gasReady()) {
    return NextResponse.json({ error: 'Integración con Drive no configurada' }, { status: 503 })
  }

  try {
    const formData = await request.formData()
    const file     = formData.get('file') as File | null

    if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Solo se permiten imágenes o PDF' }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'El archivo supera los 10MB' }, { status: 400 })
    }

    const ext      = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg'
    const now      = new Date()
    const fileName = `${session.id}_${Date.now()}.${ext}`
    const bytes    = await file.arrayBuffer()

    const url = await gasUpload({
      bytes, mimeType: file.type, fileName,
      folderType: 'compras',
      anio: now.getFullYear(),
      mes:  now.getMonth() + 1,
    })

    return NextResponse.json({ url })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
