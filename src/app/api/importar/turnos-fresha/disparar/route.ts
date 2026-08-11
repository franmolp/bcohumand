import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

// Dispara a mano el workflow de GitHub Actions que scrapea Fresha (Playwright)
// e importa los turnos — el mismo que corre solo todas las noches a las 21:15
// ART. Necesita un Personal Access Token de GitHub con permiso "Actions: write"
// sobre el repo, guardado en la env var GITHUB_ACTIONS_TOKEN.
const REPO = 'franmolp/bcohumand'
const WORKFLOW_FILE = 'fresha-import.yml'

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (session.rol !== 'admin' && session.rol !== 'Admin') {
    return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
  }

  const token = process.env.GITHUB_ACTIONS_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'Falta configurar GITHUB_ACTIONS_TOKEN en las variables de entorno' }, { status: 500 })
  }

  const res = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ ref: 'main' }),
    }
  )

  if (!res.ok) {
    const detalle = await res.text().catch(() => '')
    return NextResponse.json({ error: `GitHub respondió ${res.status}: ${detalle || 'sin detalle'}` }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
