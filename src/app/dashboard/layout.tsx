import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Navigation from '@/components/Navigation'
import PushSubscriber from '@/components/PushSubscriber'
import ActivityPing from '@/components/ActivityPing'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  return (
    <div className="h-[100dvh] overflow-hidden bg-[var(--bg)] lg:min-h-[100dvh] lg:h-auto lg:overflow-visible">
      <Navigation user={session} />
      <PushSubscriber />
      <ActivityPing />
      {/* Mobile: body no scrollea → fixed nav no flota en iOS Safari */}
      <main className="h-full overflow-y-auto overscroll-contain pt-12 pb-16 px-4 lg:h-auto lg:overflow-visible lg:pt-14 lg:pb-0 lg:pl-52 lg:pr-0">
        <div className="max-w-[1100px] lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  )
}
