import Link from 'next/link'
import type { SessionUser } from '@/types'
import { supabase } from '@/lib/supabase'
import { IconCalendar, IconBell, IconFileText, IconAlertCircle } from '@/components/ui/Icons'

const VACACIONES_DEFAULT = 14

function getUpcomingBirthdays(
  users: { id: string; nombre: string; fecha_nacimiento: string }[],
  today: Date,
  days: number,
  excludeId: string,
) {
  const result: { nombre: string; fecha: string; dias: number; isThisWeek: boolean }[] = []
  const yr = today.getFullYear()
  const todayStr = `${yr}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`

  const dow = (today.getDay() + 6) % 7
  const wE = new Date(today); wE.setDate(today.getDate() + (6 - dow))
  const wEndStr = `${wE.getFullYear()}-${String(wE.getMonth()+1).padStart(2,'0')}-${String(wE.getDate()).padStart(2,'0')}`

  for (const u of users) {
    if (u.id === excludeId || !u.fecha_nacimiento) continue
    const mmdd = u.fecha_nacimiento.slice(5, 10)  // "MM-DD"

    for (const offset of [0, 1]) {
      const bdStr = `${yr + offset}-${mmdd}`
      const diff = Math.round(
        (new Date(`${bdStr}T12:00:00`).getTime() - new Date(`${todayStr}T12:00:00`).getTime())
        / 86400000
      )
      if (diff >= 0 && diff <= days) {
        result.push({ nombre: u.nombre, fecha: bdStr, dias: diff, isThisWeek: bdStr <= wEndStr })
        break
      }
    }
  }
  return result.sort((a, b) => a.dias - b.dias)
}

function fmtFecha(iso: string): string {
  const [, m, d] = iso.split('-')
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  return `${parseInt(d)} de ${meses[parseInt(m) - 1]}`
}

function fmtDateLabel(d: Date): string {
  const dias  = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado']
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  const wd  = dias[d.getDay()]
  const mon = meses[d.getMonth()]
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  return `${cap(wd)} ${d.getDate()} de ${cap(mon)} de ${d.getFullYear()}`
}

function fmtRango(inicio: string, fin: string | null): string {
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  const [,mi,di] = inicio.split('-')
  const startStr = `${parseInt(di)} ${meses[parseInt(mi)-1]}`
  if (!fin || fin === inicio) return startStr
  const [,mf,df] = fin.split('-')
  return `${startStr} → ${parseInt(df)} ${meses[parseInt(mf)-1]}`
}

function tipoColor(tipo: string): string {
  const map: Record<string, string> = {
    'Vacaciones': '#3b82f6',
    'Ausencia por Salud': '#dc2626',
    'Solicitud de Días': '#fbbf24',
    'Ausencia Injustificada': '#fb923c',
    'Cambio de Horario': '#8b5cf6',
    'Feriado/Local cerrado': '#6366f1',
  }
  return map[tipo] ?? '#6b7280'
}

export default async function EmpleadoDashboard({ session }: { session: SessionUser }) {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
  const in30 = new Date(today); in30.setDate(today.getDate() + 30)
  const in30Str = `${in30.getFullYear()}-${String(in30.getMonth()+1).padStart(2,'0')}-${String(in30.getDate()).padStart(2,'0')}`

  const showAusentes = session.rol === 'HR' || session.rol === 'Encargada'

  // Período de vacaciones: 01/04/YYYY → 31/03/YYYY+1
  const periodYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1
  const periodStart = `${periodYear}-04-01`
  const periodLabel = `${periodYear}/${String(periodYear + 1).slice(2)}`

  const [vacRes, notifRes, usersRes, evRes, configRes, solPendRes, ausentesRes] = await Promise.all([
    supabase
      .from('solicitudes')
      .select('dias')
      .eq('usuario_id', session.id)
      .eq('tipo', 'Vacaciones')
      .eq('estado', 'approved')
      .gte('fecha_inicio', periodStart),

    supabase
      .from('notificaciones')
      .select('id, titulo, mensaje, tipo, leida')
      .eq('usuario_id', session.id)
      .order('id', { ascending: false })
      .limit(5),

    supabase
      .from('usuarios')
      .select('id, nombre, fecha_nacimiento')
      .eq('estado_cuenta', 'activo')
      .not('fecha_nacimiento', 'is', null),

    supabase
      .from('eventos_especiales')
      .select('id, titulo, emoji, fecha, todo_el_dia, hora_desde, descripcion, tipo_destinatario, valor_destinatario')
      .gte('fecha', todayStr)
      .lte('fecha', in30Str)
      .order('fecha', { ascending: true }),

    supabase
      .from('liquidacion_config')
      .select('dias_vacaciones')
      .eq('usuario_id', session.id)
      .maybeSingle(),

    supabase
      .from('solicitudes')
      .select('id, tipo, fecha_inicio, fecha_fin, estado')
      .eq('usuario_id', session.id)
      .in('estado', ['pending', 'approved', 'rejected'])
      .gte('fecha_inicio', todayStr)
      .order('fecha_inicio', { ascending: true }),

    showAusentes
      ? supabase
          .from('solicitudes')
          .select('id, empleado_nombre, tipo, fecha_inicio, fecha_fin')
          .eq('estado', 'approved')
          .lte('fecha_inicio', todayStr)
      : Promise.resolve({ data: [], error: null }),
  ])

  // Vacaciones
  const vacUsadas = (vacRes.data ?? []).reduce((s, r) => s + (r.dias ?? 0), 0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vacTotal  = (configRes.data as any)?.dias_vacaciones ?? VACACIONES_DEFAULT
  const vacRest   = vacTotal - vacUsadas
  const vacPct    = Math.max(0, Math.min(100, Math.round((vacRest / vacTotal) * 100)))

  // Filter eventos for this user
  const eventos = (evRes.data ?? []).filter(ev => {
    if (ev.tipo_destinatario === 'all') return true
    if (ev.tipo_destinatario === 'employee') return ev.valor_destinatario === session.id
    if (ev.tipo_destinatario === 'team') return ev.valor_destinatario === session.equipo
    if (ev.tipo_destinatario === 'role') return ev.valor_destinatario === session.rol
    return false
  })

  const proxCumple = getUpcomingBirthdays(
    (usersRes.data ?? []) as { id: string; nombre: string; fecha_nacimiento: string }[],
    today,
    30,
    session.id,
  )

  const TIPOS_AUSENCIA = ['Ausencia por Salud', 'Ausencia Injustificada', 'Vacaciones', 'Solicitud de Días']
  const ausentesHoyList = (ausentesRes.data ?? []).filter(r => {
    if (!TIPOS_AUSENCIA.includes(r.tipo)) return false
    const fin = r.fecha_fin || r.fecha_inicio
    return fin >= todayStr
  })

  const notifs = notifRes.data ?? []
  const misSOLS = solPendRes.data ?? []
  const firstName = session.nombre.split(' ')[0]

  return (
    <div className="py-4 fade-in space-y-5">
      {/* Greeting */}
      <div>
        <h1 className="text-[18px] lg:text-[22px] font-bold text-[var(--text)]">
          ¡Hola, {firstName}!
        </h1>
        <p className="text-[13px] text-[var(--text-sub)] mt-0.5">
          {fmtDateLabel(today)}
        </p>
      </div>

      {/* Ausentes hoy — visible para HR y Encargada */}
      {showAusentes && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          {/* Mobile */}
          <div className="flex items-stretch gap-2 lg:hidden">
            <div className="flex flex-col items-center flex-shrink-0 w-16">
              <div className="w-8 h-8 bg-red-50 rounded-xl flex items-center justify-center mb-auto">
                <IconAlertCircle size={16} className="text-red-400" />
              </div>
              <p className="text-[28px] font-bold leading-none text-red-500 mt-2">{ausentesHoyList.length}</p>
              <p className="text-[10px] text-gray-400 mt-0.5 text-center leading-tight">Ausentes hoy</p>
            </div>
            <div className="w-px bg-gray-100 self-stretch mx-1" />
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-2">
              {ausentesHoyList.length === 0
                ? <p className="text-[11px] text-gray-300 italic">Sin ausencias</p>
                : ausentesHoyList.map(r => (
                  <Link key={r.id} href="/dashboard/solicitudes" className="flex items-center justify-between gap-1 min-w-0 hover:opacity-70 transition-opacity">
                    <div className="flex items-baseline gap-1 min-w-0 flex-1">
                      <span className="text-[12px] font-semibold text-gray-800 flex-shrink-0">{r.empleado_nombre}</span>
                      <span className="text-[11px] text-gray-400 truncate">· {r.tipo}</span>
                    </div>
                    <span className="text-[10px] text-gray-400 flex-shrink-0 font-medium">{fmtRango(r.fecha_inicio, r.fecha_fin)}</span>
                  </Link>
                ))
              }
            </div>
          </div>
          {/* Desktop */}
          <div className="hidden lg:flex lg:flex-col">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-red-50 rounded-lg flex items-center justify-center">
                  <IconAlertCircle size={14} className="text-red-400" />
                </div>
                <span className="text-[13px] font-semibold text-gray-600">Ausentes hoy</span>
              </div>
              <span className="text-[26px] font-bold text-red-500 leading-none">{ausentesHoyList.length}</span>
            </div>
            <div className="h-px bg-gray-100 mb-2.5" />
            <div className="flex flex-col gap-2 overflow-y-auto max-h-[120px]">
              {ausentesHoyList.length === 0
                ? <p className="text-[11px] text-gray-300 italic">Sin ausencias</p>
                : ausentesHoyList.map(r => (
                  <Link key={r.id} href="/dashboard/solicitudes"
                    className="flex items-center justify-between gap-2 min-w-0 hover:opacity-70 transition-opacity">
                    <div className="flex items-baseline gap-1 min-w-0 flex-1">
                      <span className="text-[12px] font-semibold text-gray-800 flex-shrink-0">{r.empleado_nombre}</span>
                      <span className="text-[11px] text-gray-400 truncate">· {r.tipo}</span>
                    </div>
                    <span className="text-[10px] text-gray-400 flex-shrink-0 font-medium">{fmtRango(r.fecha_inicio, r.fecha_fin)}</span>
                  </Link>
                ))
              }
            </div>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">

        {/* Left column */}
        <div className="lg:col-span-2 space-y-4">

          {/* Vacaciones */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <IconCalendar size={16} className="text-[var(--primary)]" />
              <h2 className="text-[14px] font-bold text-[var(--text)]">Vacaciones {periodLabel}</h2>
            </div>
            <div className="flex items-end justify-between mb-2">
              <div>
                <span className="text-[32px] font-bold text-[var(--primary)]">{vacRest}</span>
                <span className="text-[14px] text-gray-400 ml-1">de {vacTotal} días disponibles</span>
              </div>
              {vacUsadas > 0 && (
                <span className="text-[12px] text-gray-400">{vacUsadas} usados</span>
              )}
            </div>
            {/* Progress bar */}
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${vacPct}%`,
                  background: vacRest > 7 ? 'var(--primary)' : vacRest > 3 ? '#f59e0b' : '#ef4444',
                }}
              />
            </div>
          </div>

          {/* Mis solicitudes recientes */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-[14px] font-bold text-[var(--text)]">Mis Solicitudes</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {misSOLS.length === 0 && (
                <p className="text-center text-[13px] text-gray-400 py-8">Sin solicitudes</p>
              )}
              {misSOLS.map(s => {
                const estadoLabel = s.estado === 'pending' ? 'Pendiente' : s.estado === 'approved' ? 'Aprobada' : 'Rechazada'
                const estadoColor = s.estado === 'pending' ? 'text-amber-600 bg-amber-50' : s.estado === 'approved' ? 'text-emerald-600 bg-emerald-50' : 'text-red-500 bg-red-50'
                return (
                  <div key={s.id} className="flex items-center gap-3 px-5 py-3.5">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tipoColor(s.tipo) }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium">{s.tipo}</p>
                      <p className="text-[11px] text-gray-400">
                        {s.fecha_inicio ? fmtFecha(s.fecha_inicio) : '—'}
                        {s.fecha_fin && s.fecha_fin !== s.fecha_inicio ? ` → ${fmtFecha(s.fecha_fin)}` : ''}
                      </p>
                    </div>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${estadoColor}`}>
                      {estadoLabel}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Notificaciones */}
          {notifs.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                <IconBell size={15} className="text-[var(--primary)]" />
                <h2 className="text-[14px] font-bold text-[var(--text)]">Notificaciones</h2>
                {notifs.some(n => !n.leida) && (
                  <span className="text-[10px] bg-red-500 text-white rounded-full px-1.5 py-0.5 font-bold ml-auto">
                    {notifs.filter(n => !n.leida).length}
                  </span>
                )}
              </div>
              <div className="divide-y divide-gray-50">
                {notifs.map(n => (
                  <div key={n.id} className={`px-5 py-3.5 ${!n.leida ? 'bg-[var(--primary-light)]/30' : ''}`}>
                    <p className="text-[13px] font-semibold">{n.titulo}</p>
                    {n.mensaje && <p className="text-[12px] text-gray-500 mt-0.5 line-clamp-2">{n.mensaje}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">

          {/* Próximos eventos */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-[14px] font-bold text-[var(--text)]">Próximos Eventos</h2>
            </div>
            <div className="p-4 space-y-2">
              {eventos.length === 0 && (
                <p className="text-center text-[13px] text-gray-400 py-6">Sin eventos próximos</p>
              )}
              {eventos.slice(0, 5).map(ev => {
                const diasHasta = Math.floor(
                  (new Date(ev.fecha + 'T12:00:00').getTime() - new Date(todayStr + 'T12:00:00').getTime()) / 86400000
                )
                return (
                  <div key={ev.id} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-violet-50/60">
                    <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0 text-sm">
                      {ev.emoji ?? <IconCalendar size={14} className="text-violet-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold truncate">{ev.titulo}</p>
                      <p className="text-[11px] text-gray-400">
                        {diasHasta === 0 ? 'Hoy' : diasHasta === 1 ? 'Mañana' : fmtFecha(ev.fecha)}
                        {!ev.todo_el_dia && ev.hora_desde && ` · ${ev.hora_desde.slice(0,5)}`}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Próximos cumpleaños */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-[14px] font-bold text-[var(--text)]">Próximos Cumpleaños</h2>
            </div>
            <div className="p-4 space-y-2">
              {proxCumple.length === 0 && (
                <p className="text-center text-[13px] text-gray-400 py-6">Sin cumpleaños próximos</p>
              )}
              {proxCumple.map((b, i) => (
                <div key={i} className={`flex items-center gap-2.5 p-2.5 rounded-xl ${b.isThisWeek ? 'bg-pink-50' : 'bg-gray-50/60'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${b.isThisWeek ? 'bg-pink-100' : 'bg-gray-100'}`}>
                    <span className={`text-[10px] font-bold ${b.isThisWeek ? 'text-pink-500' : 'text-gray-400'}`}>
                      {b.nombre.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] truncate ${b.isThisWeek ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'}`}>{b.nombre}</p>
                    <p className={`text-[11px] ${b.isThisWeek ? 'text-pink-500 font-medium' : 'text-gray-400'}`}>
                      {b.dias === 0 ? 'Hoy' : b.dias === 1 ? 'Mañana' : `en ${b.dias} días · ${fmtFecha(b.fecha)}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>


        </div>
      </div>
    </div>
  )
}
