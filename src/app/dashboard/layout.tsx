import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import Navigation from '@/components/Navigation'
import PushSubscriber from '@/components/PushSubscriber'
import ActivityPing from '@/components/ActivityPing'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  // Cargar permisos de módulos del rol (null = usar defaults hardcodeados)
  let userPermisos: string[] | null = null
  const isAdmin = session.rol?.toLowerCase() === 'admin'
  if (!isAdmin) {
    const { data } = await supabaseAdmin
      .from('roles')
      .select('permisos')
      .eq('nombre', session.rol)
      .maybeSingle()
    if (data && Array.isArray(data.permisos)) {
      userPermisos = data.permisos as string[]
    }
  }

  return (
    <div className="h-[100dvh] overflow-hidden bg-[var(--bg)] lg:min-h-[100dvh] lg:h-auto lg:overflow-visible">
      <Navigation user={session} permisos={userPermisos} />
      <PushSubscriber />
      <ActivityPing />
      <main className="h-full overflow-y-auto overscroll-contain pt-12 pb-16 px-4 lg:h-auto lg:overflow-visible lg:pt-14 lg:pb-0 lg:pl-52 lg:pr-0" style={{ touchAction: 'pan-y' }}>
        <div className="max-w-[1100px] lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  )
}
