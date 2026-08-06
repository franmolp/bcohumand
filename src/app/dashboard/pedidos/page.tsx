import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import PedidosClient from './client'

export default async function PedidosPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'

  // Get user's category permissions
  const { data: permsData } = await supabaseAdmin
    .from('pedidos_permisos')
    .select('categoria')
    .eq('usuario_id', session.id)

  const myCats = (permsData ?? []).map(p => p.categoria)

  // Users with no categories and not admin can't access this module
  if (!isAdmin && !myCats.length) redirect('/dashboard')

  // Check if user can export
  let puedeExportar = isAdmin
  if (!isAdmin) {
    const { data: expData } = await supabaseAdmin
      .from('pedidos_exportadores')
      .select('usuario_id')
      .eq('usuario_id', session.id)
      .maybeSingle()
    puedeExportar = !!expData
  }

  // Check if user can delete products/variants
  let puedeEliminar = isAdmin
  if (!isAdmin) {
    const { data: elimData } = await supabaseAdmin
      .from('pedidos_puede_eliminar')
      .select('usuario_id')
      .eq('usuario_id', session.id)
      .maybeSingle()
    puedeEliminar = !!elimData
  }

  return <PedidosClient session={session} myCats={myCats} puedeExportar={puedeExportar} puedeEliminar={puedeEliminar} />
}
