import Link from 'next/link'
import type { SessionUser } from '@/types'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { IconCalendar, IconBell, IconAlertCircle, IconChevronRight, IconStar, IconClock, IconEdit } from '@/components/ui/Icons'
import GoogleReviewsCarousel from '@/components/GoogleReviewsCarousel'

const VACACIONES_DEFAULT = 14

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins}m`
  const hs = Math.floor(mins / 60)
  if (hs < 24) return `hace ${hs}h`
  const days = Math.floor(hs / 24)
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days}d`
  return new Date(dateStr).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function getUpcomingBirthdays(
  users: { id: string; nombre: string; fecha_nacimiento: string; foto_perfil?: string | null }[],
  today: Date,
  days: number,
  excludeId: string,
) {
  const result: { nombre: string; fecha: string; dias: number; isThisWeek: boolean; foto_perfil?: string | null }[] = []
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
        result.push({ nombre: u.nombre, fecha: bdStr, dias: diff, isThisWeek: bdStr <= wEndStr, foto_perfil: u.foto_perfil ?? null })
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

type AusRow = { tipo: string; fecha_inicio: string; subtipo_horario?: string | null; horario_anterior?: string | null; horario_nuevo?: string | null; fecha_compensacion?: string | null }
function fmtCorta(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${parseInt(d)}/${parseInt(m)}`
}
function ausTipoLabel(r: AusRow) {
  if (r.tipo !== 'Cambio de horario/día') return r.tipo
  if (r.subtipo_horario === 'mismo_dia') return <><s className="text-gray-300">{r.horario_anterior ?? '?'}</s> → {r.horario_nuevo ?? '?'}</>
  return <><s className="text-gray-300">{fmtCorta(r.fecha_inicio)}</s> → {r.fecha_compensacion ? fmtCorta(r.fecha_compensacion) : ''}</>
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

// ─── Wordle Card ──────────────────────────────────────────────────────────────

function WordleCard({ tieneHoy, revelado, resuelta, posicionMes, mesNombre }: {
  tieneHoy: boolean
  revelado: boolean
  resuelta: boolean
  posicionMes: number | null
  mesNombre: string
}) {
  if (!tieneHoy) return null

  const rankingBadge = posicionMes !== null ? (
    <div className="text-right shrink-0">
      <p className="text-[10px] text-gray-400 capitalize">{mesNombre}</p>
      <p className="text-[16px] font-bold text-[var(--primary)]">{posicionMes}°</p>
    </div>
  ) : null

  if (resuelta) {
    return (
      <Link href="/dashboard/juegos" className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow">
        <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center shrink-0 text-[20px]">✅</div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold text-[var(--text)]">Ya participaste hoy</p>
          <p className="text-[12px] text-gray-400">A las 00:00 tendrás una nueva palabra</p>
        </div>
        {rankingBadge}
      </Link>
    )
  }

  if (revelado) {
    return (
      <Link href="/dashboard/juegos" className="flex items-center gap-3 bg-white rounded-2xl border border-amber-100 shadow-sm p-4 hover:shadow-md transition-shadow">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 text-[20px]">🟡</div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold text-[var(--text)]">Tenés una partida en curso</p>
          <p className="text-[12px] text-gray-400">¡Seguí intentando!</p>
        </div>
        <IconChevronRight size={14} className="text-gray-300 shrink-0" />
      </Link>
    )
  }

  return (
    <Link href="/dashboard/juegos" className="flex items-center gap-3 rounded-2xl p-4 shadow-sm hover:opacity-95 transition-opacity" style={{ background: 'var(--gradient)' }}>
      <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
        <IconStar size={20} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-bold text-white">¡Jugá la palabra del día!</p>
        <p className="text-[12px] text-white/70">Adiviná la palabra oculta</p>
      </div>
      <IconChevronRight size={16} className="text-white/60 shrink-0" />
    </Link>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default async function EmpleadoDashboard({ session }: { session: SessionUser }) {
  // Fecha en timezone Argentina para evitar desfase UTC
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  const [yr, mo, dy] = todayStr.split('-').map(Number)
  const today = new Date(yr, mo - 1, dy)
  const in30 = new Date(today); in30.setDate(today.getDate() + 30)
  const in30Str = `${in30.getFullYear()}-${String(in30.getMonth()+1).padStart(2,'0')}-${String(in30.getDate()).padStart(2,'0')}`
  const hace7 = new Date(today); hace7.setDate(today.getDate() - 7)
  const hace7Str = hace7.toISOString()
  const nextMo = mo === 12 ? 1 : mo + 1
  const nextMoYr = mo === 12 ? yr + 1 : yr

  const showAusentes = session.rol === 'HR' || session.rol === 'Encargada'

  // Período de vacaciones: 01/04/YYYY → 31/03/YYYY+1
  const periodYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1
  const periodStart = `${periodYear}-04-01`
  const periodLabel = `${periodYear}/${String(periodYear + 1).slice(2)}`

  // Mes actual para ranking de juegos
  const mesStart = `${yr}-${String(mo).padStart(2,'0')}-01`
  const mesEnd   = `${yr}-${String(mo).padStart(2,'0')}-${String(new Date(yr, mo, 0).getDate()).padStart(2,'0')}`
  const mesNombre = today.toLocaleString('es', { month: 'long' })

  const [vacRes, notifRes, usersRes, evRes, configRes, solPendRes, ausentesRes, muroRes, palabraHoyRes, partidaHoyRes, rankingMesRes, efemRes] = await Promise.all([
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
      .select('id, nombre, fecha_nacimiento, foto_perfil')
      .eq('estado_cuenta', 'activo'),

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
      .select('id, tipo, fecha_inicio, fecha_fin')
      .eq('usuario_id', session.id)
      .eq('estado', 'pending')
      .order('fecha_inicio', { ascending: true }),

    showAusentes
      ? supabase
          .from('solicitudes')
          .select('id, empleado_nombre, tipo, fecha_inicio, fecha_fin, subtipo_horario, horario_anterior, horario_nuevo, fecha_compensacion')
          .eq('estado', 'approved')
          .lte('fecha_inicio', todayStr)
      : Promise.resolve({ data: [], error: null }),

    supabase
      .from('muro_posts')
      .select('id, contenido, tipo, created_at, usuario_id')
      .gte('created_at', hace7Str)
      .order('created_at', { ascending: false })
      .limit(1),

    supabaseAdmin
      .from('juegos_palabras')
      .select('id')
      .eq('fecha', todayStr)
      .maybeSingle(),

    supabaseAdmin
      .from('juegos_partidas')
      .select('id, resuelta')
      .eq('usuario_id', session.id)
      .eq('juego', 'wordle')
      .eq('fecha', todayStr)
      .maybeSingle(),

    supabaseAdmin
      .from('juegos_partidas')
      .select('usuario_id, intentos')
      .eq('juego', 'wordle')
      .eq('resuelta', true)
      .gte('fecha', mesStart)
      .lte('fecha', mesEnd),

    supabaseAdmin
      .from('efemerides')
      .select('id, titulo, mes, dia, anio, tipo')
      .in('mes', [mo, nextMo])
      .or(`anio.is.null,anio.eq.${yr}${nextMoYr !== yr ? `,anio.eq.${nextMoYr}` : ''}`),
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
    (usersRes.data ?? []) as { id: string; nombre: string; fecha_nacimiento: string; foto_perfil?: string | null }[],
    today,
    30,
    session.id,
  )

  // Efemérides: convertir mes+dia a fecha y filtrar al rango de 30 días
  const efemerides = (efemRes.data ?? []).flatMap(ef => {
    const results: { id: number; titulo: string; tipo: string; fecha: string }[] = []
    for (const [m, y] of [[mo, yr], [nextMo, nextMoYr]] as [number, number][]) {
      if (ef.mes !== m) continue
      if (ef.anio !== null && ef.anio !== y) continue
      const fecha = `${y}-${String(m).padStart(2,'0')}-${String(ef.dia).padStart(2,'0')}`
      if (fecha >= todayStr && fecha <= in30Str) results.push({ id: ef.id, titulo: ef.titulo, tipo: ef.tipo, fecha })
    }
    return results
  })

  // Lista unificada de próximos eventos + cumpleaños + efemérides
  type UnifiedItem = {
    key: string
    kind: 'evento' | 'cumple' | 'efemeride'
    fecha: string
    diasHasta: number
    titulo: string
    subtitulo: string
    emoji?: string
    fotoPerfil?: string | null
    isThisWeek?: boolean
  }
  const unifiedItems: UnifiedItem[] = []

  function fmtSub(diasHasta: number, fecha: string): string {
    const fecha_ = fmtFecha(fecha)
    if (diasHasta === 0) return `Hoy · ${fecha_}`
    if (diasHasta === 1) return `Mañana · ${fecha_}`
    return `en ${diasHasta} días · ${fecha_}`
  }

  for (const ev of eventos) {
    const diasHasta = Math.floor((new Date(ev.fecha + 'T12:00:00').getTime() - new Date(todayStr + 'T12:00:00').getTime()) / 86400000)
    unifiedItems.push({ key: `ev-${ev.id}`, kind: 'evento', fecha: ev.fecha, diasHasta, titulo: ev.titulo,
      subtitulo: fmtSub(diasHasta, ev.fecha), emoji: ev.emoji ?? undefined })
  }
  for (const b of proxCumple) {
    unifiedItems.push({ key: `bd-${b.nombre}`, kind: 'cumple', fecha: b.fecha, diasHasta: b.dias, titulo: b.nombre,
      subtitulo: fmtSub(b.dias, b.fecha), fotoPerfil: b.foto_perfil, isThisWeek: b.isThisWeek })
  }
  for (const ef of efemerides) {
    const diasHasta = Math.floor((new Date(ef.fecha + 'T12:00:00').getTime() - new Date(todayStr + 'T12:00:00').getTime()) / 86400000)
    unifiedItems.push({ key: `ef-${ef.id}-${ef.fecha}`, kind: 'efemeride', fecha: ef.fecha, diasHasta, titulo: ef.titulo,
      subtitulo: fmtSub(diasHasta, ef.fecha) })
  }
  unifiedItems.sort((a, b) => a.diasHasta - b.diasHasta)

  const TIPOS_AUSENCIA = ['Ausencia por Salud', 'Ausencia Injustificada', 'Vacaciones', 'Solicitud de Días', 'Cambio de horario/día']
  const ausentesHoyList = (ausentesRes.data ?? []).filter(r => {
    if (!TIPOS_AUSENCIA.includes(r.tipo)) return false
    const fin = r.fecha_fin || r.fecha_inicio
    return fin >= todayStr
  })

  // Juegos
  const tieneHoy  = !!palabraHoyRes.data
  const partidaHoy = partidaHoyRes.data
  const revelado  = !!partidaHoy
  const resuelta  = partidaHoy?.resuelta ?? false

  const rankMap: Record<string, number> = {}
  for (const p of rankingMesRes.data ?? []) {
    const pts = Math.max(1, 11 - (p.intentos ?? 0))
    rankMap[p.usuario_id] = (rankMap[p.usuario_id] ?? 0) + pts
  }
  const sortedRanking = Object.entries(rankMap).sort(([, a], [, b]) => b - a)
  const posicionMes = session.id in rankMap
    ? sortedRanking.findIndex(([uid]) => uid === session.id) + 1
    : null

  const notifs  = notifRes.data ?? []
  const misSOLS = solPendRes.data ?? []
  const firstName = session.nombre.split(' ')[0]
  const arHour = parseInt(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires', hour: 'numeric', hour12: false }))
  const saludoBase = `Hola ${firstName},`
  const saludoDeseo = arHour >= 5 && arHour < 12
    ? '¡Que tengas un muy buen día!'
    : arHour >= 12 && arHour < 20
    ? '¡Que tengas una linda tarde!'
    : '¡Buenas noches y buen descanso!'

  const muroPost = (muroRes.data ?? [])[0] ?? null
  const muroAutor = muroPost
    ? ((usersRes.data ?? []).find(u => u.id === muroPost.usuario_id) ?? null)
    : null

  return (
    <div className="py-4 fade-in space-y-5">
      {/* Greeting */}
      <div>
        <div className="text-[20px] lg:text-[22px] font-bold text-[var(--text)] leading-snug">
          <p>{saludoBase}</p>
          <p>{saludoDeseo}</p>
        </div>
        <p className="text-[13px] text-[var(--text-sub)] mt-0.5">
          {fmtDateLabel(today)}
        </p>
      </div>

      {/* Wordle del día */}
      <WordleCard
        tieneHoy={tieneHoy}
        revelado={revelado}
        resuelta={resuelta}
        posicionMes={posicionMes}
        mesNombre={mesNombre}
      />

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
              <p className="text-[10px] text-gray-400 mt-0.5 text-center leading-tight">Ausencias y cambios hoy</p>
            </div>
            <div className="w-px bg-gray-100 self-stretch mx-1" />
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-2">
              {ausentesHoyList.length === 0
                ? <p className="text-[11px] text-gray-300 italic">Sin ausencias</p>
                : ausentesHoyList.map(r => (
                  <Link key={r.id} href="/dashboard/solicitudes" className="flex items-center justify-between gap-1 min-w-0 hover:opacity-70 transition-opacity">
                    <div className="flex items-baseline gap-1 min-w-0 flex-1">
                      <span className="text-[12px] font-semibold text-gray-800 flex-shrink-0">{r.empleado_nombre}</span>
                      <span className="text-[11px] text-gray-400 truncate">· {ausTipoLabel(r)}</span>
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
                <span className="text-[13px] font-semibold text-gray-600">Ausencias y cambios hoy</span>
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
                      <span className="text-[11px] text-gray-400 truncate">· {ausTipoLabel(r)}</span>
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
          <Link href="/dashboard/solicitudes" className="block bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <IconCalendar size={16} className="text-[var(--primary)]" />
                <h2 className="text-[14px] font-bold text-[var(--primary)]">Vacaciones {periodLabel}</h2>
              </div>
              <IconChevronRight size={14} className="text-gray-300" />
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
          </Link>

          {/* Mis solicitudes pendientes */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <Link href="/dashboard/solicitudes" className="flex items-center justify-between px-5 py-4 border-b border-gray-100 hover:bg-gray-50/60 transition-colors">
              <div className="flex items-center gap-2">
                <IconClock size={15} className="text-amber-500" />
                <h2 className="text-[14px] font-bold text-amber-600">Mis solicitudes pendientes</h2>
              </div>
              <div className="flex items-center gap-2">
                {misSOLS.length > 0 && <span className="text-[12px] font-bold text-amber-600">{misSOLS.length}</span>}
                <IconChevronRight size={14} className="text-gray-300" />
              </div>
            </Link>
            <div className="divide-y divide-gray-50">
              {misSOLS.length === 0 && (
                <p className="text-center text-[13px] text-gray-400 py-8">Sin solicitudes pendientes</p>
              )}
              {misSOLS.map(s => (
                <div key={s.id} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="w-8 flex items-center justify-center flex-shrink-0">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tipoColor(s.tipo) }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium">{s.tipo}</p>
                    <p className="text-[11px] text-gray-400">
                      {s.fecha_inicio ? fmtFecha(s.fecha_inicio) : '—'}
                      {s.fecha_fin && s.fecha_fin !== s.fecha_inicio ? ` → ${fmtFecha(s.fecha_fin)}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notificaciones */}
          {notifs.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <Link href="/dashboard/notificaciones" className="flex items-center justify-between px-5 py-4 border-b border-gray-100 hover:bg-gray-50/60 transition-colors">
                <div className="flex items-center gap-2">
                  <IconBell size={15} className="text-[var(--primary)]" />
                  <h2 className="text-[14px] font-bold text-[var(--text)]">Notificaciones</h2>
                </div>
                <div className="flex items-center gap-2">
                  {notifs.some(n => !n.leida) && (
                    <span className="text-[10px] bg-red-500 text-white rounded-full px-1.5 py-0.5 font-bold">
                      {notifs.filter(n => !n.leida).length}
                    </span>
                  )}
                  <IconChevronRight size={14} className="text-gray-300" />
                </div>
              </Link>
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

          {/* Próximos eventos y cumpleaños */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <Link href="/dashboard/calendario" className="flex items-center justify-between px-5 py-4 border-b border-gray-100 hover:bg-gray-50/60 transition-colors">
              <div className="flex items-center gap-2">
                <IconCalendar size={15} className="text-violet-500" />
                <h2 className="text-[14px] font-bold text-violet-600">Próximos eventos y cumpleaños</h2>
              </div>
              <div className="flex items-center gap-2">
                {unifiedItems.length > 0 && <span className="text-[12px] font-bold text-violet-500">{unifiedItems.length}</span>}
                <IconChevronRight size={14} className="text-gray-300" />
              </div>
            </Link>
            <div className="divide-y divide-gray-50">
              {unifiedItems.length === 0 && (
                <p className="text-center text-[13px] text-gray-400 py-8">Sin eventos próximos</p>
              )}
              {unifiedItems.slice(0, 8).map(item => {
                const isCumple = item.kind === 'cumple'
                const dotColor = item.kind === 'evento' ? 'bg-violet-400' : 'bg-blue-400'
                const titulo = isCumple ? `Cumpleaños de ${item.titulo}` : item.titulo
                return (
                  <div key={item.key} className="flex items-center gap-3 px-5 py-3.5">
                    {isCumple ? (
                      item.fotoPerfil
                        ? <img src={item.fotoPerfil} alt={item.titulo} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                        : <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-[image:var(--gradient)] shadow-sm">
                            <span className="text-[10px] font-bold text-white">
                              {item.titulo.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                            </span>
                          </div>
                    ) : (
                      <div className="w-8 flex items-center justify-center flex-shrink-0">
                        <div className={`w-2 h-2 rounded-full ${dotColor}`} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium truncate">{titulo}</p>
                      <p className="text-[11px] text-gray-400">{item.subtitulo}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>


          {/* Reseñas de Google */}
          <GoogleReviewsCarousel verticalOffset={90} />

        </div>
      </div>

      {/* Última publicación del muro */}
      <Link href="/dashboard/muro" className="block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <IconEdit size={15} className="text-indigo-500" />
            <h2 className="text-[14px] font-bold text-indigo-600">Últimas novedades</h2>
          </div>
          <IconChevronRight size={14} className="text-gray-300" />
        </div>
        {muroPost && muroAutor ? (
          <div className="p-4 flex items-start gap-3">
            {muroAutor.foto_perfil
              ? <img src={muroAutor.foto_perfil} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
              : <div className="w-9 h-9 rounded-full bg-[image:var(--gradient)] flex items-center justify-center shrink-0">
                  <span className="text-[11px] font-bold text-white">
                    {muroAutor.nombre.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                </div>
            }
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-gray-700 mb-0.5">{muroAutor.nombre}</p>
              <p className="text-[13px] text-gray-600 line-clamp-3 leading-snug">{muroPost.contenido}</p>
              <p className="text-[11px] text-gray-400 mt-1">{timeAgo(muroPost.created_at)}</p>
            </div>
          </div>
        ) : (
          <p className="px-5 py-6 text-[13px] text-gray-400 italic">Sin novedades.</p>
        )}
      </Link>
    </div>
  )
}
