import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { esEquipoLimpieza, hoyAR } from '@/lib/limpieza'

function esAdmin(rol: string) { return rol === 'admin' || rol === 'Admin' }

// Tilda / destilda una tarea en un día. { tarea_id, fecha, hecho }
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!esAdmin(session.rol) && !esEquipoLimpieza(session.equipo)) {
    return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
  }

  const { tarea_id, fecha, hecho } = await req.json().catch(() => ({})) as
    { tarea_id?: number; fecha?: string; hecho?: boolean }
  if (!tarea_id || !fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }

  // El equipo de limpieza solo puede marcar el día actual; otros días son de solo
  // lectura. El admin puede corregir cualquier día.
  if (!esAdmin(session.rol) && fecha !== hoyAR()) {
    return NextResponse.json({ error: 'Solo podés marcar el día de hoy' }, { status: 403 })
  }

  if (hecho) {
    const { error } = await supabaseAdmin
      .from('limpieza_hechas')
      .upsert({ tarea_id, fecha, hecho_por: session.id, hecho_en: new Date().toISOString() }, { onConflict: 'tarea_id,fecha' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabaseAdmin
      .from('limpieza_hechas')
      .delete()
      .eq('tarea_id', tarea_id)
      .eq('fecha', fecha)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
