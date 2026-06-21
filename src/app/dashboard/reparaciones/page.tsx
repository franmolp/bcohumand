import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import ReparacionesClient from './client'

export default async function ReparacionesPage() {
  const session = await requireAuth()
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'

  const empleadasList = isAdmin
    ? ((await supabaseAdmin.from('usuarios').select('id, nombre').eq('estado_cuenta', 'activo').order('nombre')).data ?? [])
    : []

  return <ReparacionesClient user={session} empleadasList={empleadasList} />
}
