import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

const BUCKET = 'muro'
const MAX_BYTES = 8 * 1024 * 1024 // 8 MB

// Sube la imagen de una tarjeta de invitación y devuelve su URL pública.
// Solo admin (quien crea invitaciones en el muro).
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (session.rol !== 'admin' && session.rol !== 'Admin') {
    return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
  }

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Sin archivo' }, { status: 400 })
  if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'El archivo debe ser una imagen' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'La imagen es muy grande (máx. 8 MB)' }, { status: 400 })

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `invitaciones/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())

  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: false })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: { publicUrl } } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path)
  return NextResponse.json({ url: publicUrl })
}
