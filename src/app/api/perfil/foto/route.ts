import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

const BUCKET = 'fotos-perfil'

export async function GET() {
  const session = await requireAuth()
  const { data } = await supabaseAdmin
    .from('usuarios')
    .select('foto_perfil')
    .eq('id', session.id)
    .single()
  return NextResponse.json({ url: data?.foto_perfil ?? null })
}

async function logFoto(req: NextRequest, userId: string) {
  await supabaseAdmin.from('log_seguridad').insert({
    accion: 'foto_perfil_actualizada',
    detalle: 'Foto de perfil actualizada',
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'desconocida',
    user_agent: req.headers.get('user-agent') || '',
    usuario_id: userId,
  }).catch(() => {})
}

export async function POST(req: NextRequest) {
  const session = await requireAuth()
  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Sin archivo' }, { status: 400 })

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const path = `${session.id}/avatar.jpg`

  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: 'image/jpeg', upsert: true })

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: { publicUrl } } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path)
  const url = `${publicUrl}?t=${Date.now()}`

  await supabaseAdmin.from('usuarios').update({ foto_perfil: url }).eq('id', session.id)
  await logFoto(req, session.id)

  return NextResponse.json({ url })
}

export async function DELETE() {
  const session = await requireAuth()
  const path = `${session.id}/avatar.jpg`
  await supabaseAdmin.storage.from(BUCKET).remove([path])
  await supabaseAdmin.from('usuarios').update({ foto_perfil: null }).eq('id', session.id)
  return NextResponse.json({ ok: true })
}
