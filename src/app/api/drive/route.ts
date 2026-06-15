import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

const GAS_URL    = process.env.GAS_DRIVE_URL ?? ''
const GAS_SECRET = process.env.GAS_SECRET ?? ''

function gasReady() {
  return GAS_URL && !GAS_URL.includes('PENDING_DEPLOY')
}

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!gasReady()) {
    return NextResponse.json({ error: 'Integración con Drive no configurada aún' }, { status: 503 })
  }

  const { searchParams } = new URL(request.url)
  const url = new URL(GAS_URL)
  url.searchParams.set('secret', GAS_SECRET)
  for (const [k, v] of searchParams.entries()) url.searchParams.set(k, v)

  const res  = await fetch(url.toString(), { cache: 'no-store' })
  const data = await res.json()
  return NextResponse.json(data, { status: res.ok ? 200 : 502 })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!gasReady()) {
    return NextResponse.json({ error: 'Integración con Drive no configurada aún' }, { status: 503 })
  }

  const body = await request.json()
  const res  = await fetch(GAS_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ ...body, secret: GAS_SECRET }),
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.ok ? 200 : 502 })
}
