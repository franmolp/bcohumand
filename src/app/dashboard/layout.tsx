import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Navigation from '@/components/Navigation'
import PushSubscriber from '@/components/PushSubscriber'
import ActivityPing from '@/components/ActivityPing'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  return (
    <div className="min-h-[100dvh] bg-[var(--bg)]">
      <Navigation user={session} />
      <PushSubscriber />
      <ActivityPing />
      {/* Desktop: top header 56px + left sidebar 208px */}
      {/* Mobile: top bar ~48px + bottom nav ~50px */}
      <main className="pt-12 pb-16 px-4 lg:pt-14 lg:pb-0 lg:pl-52 lg:pr-0">
      <div className="max-w-[1100px] lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  )
}
