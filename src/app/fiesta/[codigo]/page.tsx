import { supabaseAdmin } from '@/lib/supabase-admin'
import type { FiestaConfig } from '@/lib/fiesta'
import JugadorClient from './client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Fiesta Beauty Co.' }

// Link que escanean con el QR: público (sin login), solo si el código coincide y la fiesta está encendida
export default async function FiestaJugarPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params
  const { data } = await supabaseAdmin.from('configuracion').select('valor').eq('clave', 'fiesta').maybeSingle()
  const cfg = data?.valor as FiestaConfig | null
  if (!cfg?.activa || !cfg.codigo || cfg.codigo !== codigo) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center text-center text-white px-6" style={{ background: 'radial-gradient(circle at 20% 0%, #6d28d9 0%, #3b1a6e 40%, #1a0d33 85%)' }}>
        <p className="text-6xl mb-4">🎈</p>
        <h1 className="text-3xl font-black">Este juego no está disponible</h1>
        <p className="mt-2 opacity-70">Escaneá el QR de la pantalla para entrar.</p>
      </div>
    )
  }
  return <JugadorClient codigo={codigo} />
}
