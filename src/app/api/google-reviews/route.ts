import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export type { GoogleReview } from '@/types/google-reviews'

export async function GET() {
  // Se leen de Supabase (las actualiza a diario el cron con las reseñas de BCO Turnos)
  const { data: rows } = await supabaseAdmin
    .from('google_reviews')
    .select('author, avatar, rating, text, date')

  if (rows && rows.length > 0) {
    const shuffled = [...rows].sort(() => Math.random() - 0.5)
    // Calificación y total de Google (los guarda la actualización diaria, salen de BCO Turnos)
    const { data: conf } = await supabaseAdmin.from('configuracion').select('clave, valor').in('clave', ['google_lugar', 'google_reviews_estado'])
    const l = conf?.find(c => c.clave === 'google_lugar')?.valor as { rating?: number | null; total?: number } | undefined
    // Última actualización diaria (fecha y error si falló), para revisar por qué no se actualizan
    const e = conf?.find(c => c.clave === 'google_reviews_estado')?.valor as { en?: string; ok?: boolean; error?: string } | undefined
    return NextResponse.json({ reviews: shuffled, rating: l?.rating ?? null, total: l?.total ?? 0, actualizado: e ? { en: e.en, ok: e.ok, error: e.error ?? null } : null })
  }

  // Tabla vacía: todavía no corrió la actualización diaria (las reseñas vienen de BCO Turnos)
  return NextResponse.json({ reviews: [] })
}
