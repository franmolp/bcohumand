import { requireAuth } from '@/lib/auth'
import { getConcursoConfig } from '@/lib/concurso-google'
import ReconocimientosClient from './client'

export default async function ReconocimientosPage() {
  const session = await requireAuth()
  // Se resuelve en el server para que la pestaña "Reseñas de clientas" aparezca de
  // entrada, sin el delay de pedirlo desde el cliente.
  const cfg = await getConcursoConfig()
  return <ReconocimientosClient session={session} concursoActivo={cfg.activo} />
}
