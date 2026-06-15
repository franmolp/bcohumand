import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import MonotributoClient from './client'

export default async function MonotributoPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  let habilitado = isAdmin
  if (!isAdmin) {
    const { data } = await supabase.from('usuarios').select('monotributo_habilitado').eq('id', session.id).single()
    habilitado = data?.monotributo_habilitado ?? false
  }

  return <MonotributoClient user={session} isAdmin={isAdmin} habilitado={habilitado} />
}
