import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

const MESES_NUM: Record<string, number> = {
  'Enero':1,'Febrero':2,'Marzo':3,'Abril':4,'Mayo':5,'Junio':6,
  'Julio':7,'Agosto':8,'Septiembre':9,'Octubre':10,'Noviembre':11,'Diciembre':12,
}

function normStr(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

function matchEmployee(driveName: string, usuarios: { id: string; nombre: string }[]) {
  const norm = normStr(driveName)
  return (
    usuarios.find(u => normStr(u.nombre) === norm) ??
    usuarios.find(u => normStr(u.nombre).startsWith(norm)) ??
    usuarios.find(u => norm.startsWith(normStr(u.nombre))) ??
    null
  )
}

export async function POST() {
  const session = await getSession()
  if (!session || (session.rol !== 'Admin' && session.rol !== 'admin'))
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const GAS_URL    = process.env.GAS_DRIVE_URL
  const GAS_SECRET = process.env.GAS_SECRET
  if (!GAS_URL || !GAS_SECRET)
    return NextResponse.json({ error: 'Drive bridge no configurado' }, { status: 500 })

  // 1. Fetch file list from GAS
  const gasRes = await fetch(`${GAS_URL}?action=list_monotributo&secret=${encodeURIComponent(GAS_SECRET)}`)
  if (!gasRes.ok) return NextResponse.json({ error: 'Error al conectar con Drive' }, { status: 502 })
  const gasData = await gasRes.json() as { files?: DriveFile[]; error?: string }
  if (gasData.error) return NextResponse.json({ error: gasData.error }, { status: 502 })

  const driveFiles: DriveFile[] = gasData.files ?? []
  if (!driveFiles.length) return NextResponse.json({ imported: 0, skipped: 0, noMatch: [] })

  // 2. Get all users from DB
  const { data: usuarios } = await supabaseAdmin.from('usuarios').select('id, nombre')
  const users = usuarios ?? []

  // 3. Group files by path (year/month/employee)
  const groups = new Map<string, DriveFile[]>()
  for (const f of driveFiles) {
    const key = f.path
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(f)
  }

  let imported = 0, skipped = 0
  const noMatch: string[] = []
  const errors: string[] = []

  for (const [path, files] of groups) {
    const parts = path.split('/')
    if (parts.length < 3) continue
    const [yearStr, mesName, empleadaNombre] = parts

    const anio = parseInt(yearStr)
    const mesNum = MESES_NUM[mesName]
    if (isNaN(anio) || !mesNum) continue

    const mes = `${anio}-${String(mesNum).padStart(2, '0')}`

    const user = matchEmployee(empleadaNombre, users)
    if (!user) {
      if (!noMatch.includes(empleadaNombre)) noMatch.push(empleadaNombre)
      continue
    }

    // Check if record already exists
    const { data: existing } = await supabaseAdmin
      .from('monotributo')
      .select('id')
      .eq('usuario_id', user.id)
      .eq('mes', mes)
      .maybeSingle()

    if (existing) { skipped++; continue }

    // First file → comprobante, second → factura
    const [comp, fact] = files.sort((a, b) => a.date.localeCompare(b.date))
    const { error: insertError } = await supabaseAdmin.from('monotributo').insert({
      usuario_id:         user.id,
      mes,
      comprobante_url:    comp.url,
      comprobante_nombre: comp.name,
      factura_url:        fact?.url ?? null,
      factura_nombre:     fact?.name ?? null,
      fecha_carga:        comp.date.slice(0, 10),
    })
    if (!insertError) imported++
    else errors.push(`${empleadaNombre} ${mes}: ${insertError.message}`)
  }

  return NextResponse.json({ imported, skipped, noMatch, errors })
}

interface DriveFile { id: string; name: string; url: string; path: string; date: string }
