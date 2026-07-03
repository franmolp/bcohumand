import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession } from '@/lib/auth'

const BUCKET = 'recibos-sueldo'
const PATH   = 'config/firma-empleador.png'

async function adminOnly() {
  const s = await getSession()
  return !!s && (s.rol === 'admin' || s.rol === 'Admin')
}

export async function GET() {
  if (!await adminOnly()) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(PATH)
  if (error || !data) return NextResponse.json({ dataUrl: null })

  const buffer = await data.arrayBuffer()
  const b64    = Buffer.from(buffer).toString('base64')
  const mime   = data.type || 'image/png'
  return NextResponse.json({ dataUrl: `data:${mime};base64,${b64}` })
}

export async function POST(req: NextRequest) {
  if (!await adminOnly()) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  let formData: FormData
  try { formData = await req.formData() }
  catch { return NextResponse.json({ error: 'Error al leer formulario' }, { status: 400 }) }

  const file = formData.get('firma') as File | null
  if (!file) return NextResponse.json({ error: 'Falta la firma' }, { status: 400 })

  const bytes    = new Uint8Array(await file.arrayBuffer())
  const mimeType = file.type || 'image/png'

  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(PATH, bytes, {
    contentType: mimeType,
    upsert: true,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  if (!await adminOnly()) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  await supabaseAdmin.storage.from(BUCKET).remove([PATH])
  return NextResponse.json({ ok: true })
}
