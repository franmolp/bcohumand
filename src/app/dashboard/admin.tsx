import React from 'react'
import Link from 'next/link'
import type { SessionUser } from '@/types'
import { supabase, supabaseAdmin } from '@/lib/supabase'
import { IconUsers, IconFileText, IconCalendar, IconChevronRight, IconCheck, IconX, IconAlertCircle, IconWall, IconShoppingBag, IconDollar, IconCamera } from '@/components/ui/Icons'


function timeAgo(dateStr: string | null): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now  = new Date()
  const diff = now.getTime() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins}m`
  const hs = Math.floor(mins / 60)
  if (hs < 24) return `hace ${hs}h`
  // Compare calendar dates in local time (not UTC hours)
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const dateMidnight  = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const calDays = Math.round((todayMidnight - dateMidnight) / 86400000)
  if (calDays === 0) return `hace ${hs}h`
  if (calDays === 1) return 'ayer'
  if (calDays < 7)  return `hace ${calDays}d`
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function fmtFecha(iso: string): string {
  const [, m, d] = iso.split('-')
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  return `${parseInt(d)} ${meses[parseInt(m)-1]}`
}

function fmtCorta(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${parseInt(d)}/${parseInt(m)}`
}

function diaSemanaCorto(iso: string): string {
  const dias = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
  return dias[new Date(`${iso}T12:00:00`).getDay()]
}

function fmtRango(inicio: string, fin: string | null): string {
  if (!fin || fin === inicio) return fmtCorta(inicio)
  return `${fmtCorta(inicio)} → ${fmtCorta(fin)}`
}

function getUpcomingBirthdays(
  users: { nombre: string; fecha_nacimiento: string }[],
  today: Date,
) {
  const yr      = today.getFullYear()
  const todayStr = `${yr}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`

  // Fin de esta semana (para marcar en negrita)
  const dow  = (today.getDay() + 6) % 7
  const wE   = new Date(today); wE.setDate(today.getDate() + (6 - dow))
  const wEndStr = `${yr}-${String(wE.getMonth()+1).padStart(2,'0')}-${String(wE.getDate()).padStart(2,'0')}`

  const result: { nombre: string; dias: number; fecha: string; isThisWeek: boolean }[] = []

  for (const u of users) {
    if (!u.fecha_nacimiento) continue
    const mmdd = u.fecha_nacimiento.slice(5, 10)

    for (const offset of [0, 1]) {
      const bdStr = `${yr + offset}-${mmdd}`
      if (bdStr < todayStr) continue

      const dias = Math.round(
        (new Date(`${bdStr}T12:00:00`).getTime() - new Date(`${todayStr}T12:00:00`).getTime())
        / 86400000
      )
      if (dias > 30) continue

      result.push({ nombre: u.nombre, dias, fecha: bdStr, isThisWeek: bdStr <= wEndStr })
      break
    }
  }

  return result.sort((a, b) => a.dias - b.dias)
}

function fmtDateLabel(d: Date): string {
  const dias  = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado']
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  const wd  = dias[d.getDay()]
  const mon = meses[d.getMonth()]
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  return `${cap(wd)} ${d.getDate()} de ${cap(mon)} de ${d.getFullYear()}`
}

export default async function AdminDashboard({ session }: { session: SessionUser }) {
  // Fecha en timezone Argentina para evitar desfase UTC
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  const [yr, mo, dy] = todayStr.split('-').map(Number)
  const today = new Date(yr, mo - 1, dy)
  const hace7 = new Date(today); hace7.setDate(today.getDate() - 7)
  const hace7Str = hace7.toISOString()

  const [empData, ausentesData, pendData, actData, usersData] = await Promise.all([
    // Empleados activos
    supabase.from('usuarios').select('id').eq('estado_cuenta', 'activo'),

    // Ausentes hoy: solicitudes aprobadas que cubren hoy (excluyendo feriados y cambios de horario)
    supabase
      .from('solicitudes')
      .select('id, usuario_id, empleado_nombre, tipo, fecha_inicio, fecha_fin')
      .eq('estado', 'approved')
      .lte('fecha_inicio', todayStr),

    // Solicitudes pendientes (todas para contar, con detalle)
    supabase
      .from('solicitudes')
      .select('id, empleado_nombre, tipo, fecha_inicio, fecha_fin, dias')
      .eq('estado', 'pending')
      .order('fecha_inicio', { ascending: false }),

    // Actividad reciente — ordenar por hora_ultima_actividad si existe, sino fecha_inicio
    supabase
      .from('solicitudes')
      .select('id, empleado_nombre, tipo, estado, fecha_inicio, fecha_creacion, hora_ultima_actividad, moderador')
      .order('hora_ultima_actividad', { ascending: false, nullsFirst: false })
      .limit(10),

    // Usuarios con cumpleaños
    supabase
      .from('usuarios')
      .select('nombre, fecha_nacimiento')
      .eq('estado_cuenta', 'activo')
      .not('fecha_nacimiento', 'is', null),
  ])

  const totalEmpleados = empData.data?.length ?? 0
  const TIPOS_AUSENCIA = ['Ausencia por Salud', 'Ausencia Injustificada', 'Vacaciones', 'Solicitud de Días']
  const ausentesHoyList = (ausentesData.data ?? []).filter(r => {
    if (!TIPOS_AUSENCIA.includes(r.tipo)) return false
    const fin = r.fecha_fin || r.fecha_inicio
    return fin >= todayStr
  })
  const ausentesHoy = ausentesHoyList.length
  const pendientes     = pendData.data ?? []
  const cumpleProximos = getUpcomingBirthdays(
    (usersData.data ?? []) as { nombre: string; fecha_nacimiento: string }[],
    today,
  )
  const isAdminRole = session.rol === 'admin' || session.rol === 'Admin'

  // Fuentes adicionales de actividad (últimos 7 días)
  const [muroPostsRes, votosRes, fotosLogRes, comprasRes, monoRes] = await Promise.all([
    supabaseAdmin.from('muro_posts')
      .select('id, tipo, contenido, created_at, usuario_id')
      .gte('created_at', hace7Str).order('created_at', { ascending: false }).limit(8),
    supabaseAdmin.from('muro_encuesta_votos')
      .select('id, created_at, usuario_id')
      .gte('created_at', hace7Str).order('created_at', { ascending: false }).limit(8),
    supabaseAdmin.from('log_seguridad')
      .select('id, usuario_id, created_at')
      .eq('accion', 'foto_perfil_actualizada')
      .gte('created_at', hace7Str).order('created_at', { ascending: false }).limit(8),
    isAdminRole
      ? supabaseAdmin.from('compras')
          .select('id, created_at, usuario_id, monto, detalle, proveedor_nombre')
          .gte('created_at', hace7Str).order('created_at', { ascending: false }).limit(8)
      : Promise.resolve({ data: [] }),
    isAdminRole
      ? supabaseAdmin.from('monotributo')
          .select('id, created_at, usuario_id, mes')
          .gte('created_at', hace7Str).order('created_at', { ascending: false }).limit(8)
      : Promise.resolve({ data: [] }),
  ])

  // Batch fetch nombres para items extra
  const extraIds = [...new Set([
    ...(muroPostsRes.data ?? []).map((p: { usuario_id: string }) => p.usuario_id),
    ...(votosRes.data ?? []).map((v: { usuario_id: string }) => v.usuario_id),
    ...(fotosLogRes.data ?? []).map((f: { usuario_id: string | null }) => f.usuario_id).filter(Boolean) as string[],
    ...(comprasRes.data ?? []).map((c: { usuario_id: string | null }) => c.usuario_id).filter(Boolean) as string[],
    ...(monoRes.data ?? []).map((m: { usuario_id: string }) => m.usuario_id),
  ])]
  const extraNombres: Record<string, string> = {}
  if (extraIds.length) {
    const { data: nd } = await supabaseAdmin.from('usuarios').select('id, nombre').in('id', extraIds)
    for (const u of nd ?? []) extraNombres[u.id] = u.nombre
  }

  // Construir feed unificado
  type ActItem = { key: string; ts: string; nombre: string; sub: string; icon: string; href: string }
  const actItems: ActItem[] = []

  const solsOrdenadas = (actData.data ?? []).sort((a, b) => {
    const ta = a.hora_ultima_actividad ?? a.fecha_creacion ?? a.fecha_inicio ?? ''
    const tb = b.hora_ultima_actividad ?? b.fecha_creacion ?? b.fecha_inicio ?? ''
    return tb.localeCompare(ta)
  })
  for (const a of solsOrdenadas) {
    const ts = a.hora_ultima_actividad ?? a.fecha_creacion ?? a.fecha_inicio ?? ''
    const sub = a.estado === 'pending' ? 'Pendiente de aprobación' : a.estado === 'approved' ? `Aprobada${a.moderador ? ` por ${a.moderador}` : ''}` : `Rechazada${a.moderador ? ` por ${a.moderador}` : ''}`
    actItems.push({ key: `sol-${a.id}`, ts, nombre: a.empleado_nombre ?? '—', sub: `${a.tipo} · ${sub}`, icon: a.estado === 'approved' ? 'sol_ok' : a.estado === 'rejected' ? 'sol_no' : 'sol_pend', href: '/dashboard/solicitudes' })
  }
  for (const p of muroPostsRes.data ?? []) {
    const tipoLabel = p.tipo === 'encuesta' ? 'publicó una encuesta' : p.tipo === 'pregunta' ? 'hizo una pregunta' : 'publicó en el muro'
    const snippet = p.contenido ? ` · "${p.contenido.slice(0, 35)}${p.contenido.length > 35 ? '…' : ''}"` : ''
    actItems.push({ key: `muro-${p.id}`, ts: p.created_at, nombre: extraNombres[p.usuario_id] ?? '—', sub: tipoLabel + snippet, icon: 'muro', href: '/dashboard/muro' })
  }
  for (const v of votosRes.data ?? []) {
    actItems.push({ key: `voto-${v.id}`, ts: v.created_at, nombre: extraNombres[v.usuario_id] ?? '—', sub: 'votó en una encuesta', icon: 'voto', href: '/dashboard/muro' })
  }
  for (const f of fotosLogRes.data ?? []) {
    if (!f.usuario_id) continue
    actItems.push({ key: `foto-${f.id}`, ts: f.created_at, nombre: extraNombres[f.usuario_id] ?? '—', sub: 'actualizó su foto de perfil', icon: 'foto', href: '/dashboard/empleados' })
  }
  for (const c of comprasRes.data ?? []) {
    if (!c.usuario_id) continue
    const sub = `registró compra${c.proveedor_nombre ? ` · ${c.proveedor_nombre}` : ''}${c.monto ? ` · $${Number(c.monto).toLocaleString('es-AR')}` : ''}`
    actItems.push({ key: `compra-${c.id}`, ts: c.created_at, nombre: extraNombres[c.usuario_id] ?? '—', sub, icon: 'compra', href: '/dashboard/compras' })
  }
  for (const m of monoRes.data ?? []) {
    actItems.push({ key: `mono-${m.id}`, ts: m.created_at, nombre: extraNombres[m.usuario_id] ?? '—', sub: `subió comprobante monotributo ${m.mes}`, icon: 'mono', href: '/dashboard/monotributo' })
  }
  actItems.sort((a, b) => b.ts.localeCompare(a.ts))
  const actividadFeed = actItems.slice(0, 15)

  const ACT_CFG: Record<string, { bg: string; color: string; Icon: React.ComponentType<{ size?: number; className?: string }> }> = {
    sol_pend: { bg: 'bg-amber-100',   color: 'text-amber-600',   Icon: IconFileText },
    sol_ok:   { bg: 'bg-emerald-100', color: 'text-emerald-600', Icon: IconCheck },
    sol_no:   { bg: 'bg-red-100',     color: 'text-red-500',     Icon: IconX },
    muro:     { bg: 'bg-teal-100',    color: 'text-teal-600',    Icon: IconWall },
    voto:     { bg: 'bg-teal-50',     color: 'text-teal-500',    Icon: IconCheck },
    foto:     { bg: 'bg-violet-100',  color: 'text-violet-600',  Icon: IconCamera },
    compra:   { bg: 'bg-pink-100',    color: 'text-pink-600',    Icon: IconShoppingBag },
    mono:     { bg: 'bg-indigo-100',  color: 'text-indigo-600',  Icon: IconDollar },
  }

  const firstName = session.nombre.split(' ')[0]
  const arHour = parseInt(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires', hour: 'numeric', hour12: false }))
  const saludoBase = arHour >= 5 && arHour < 12
    ? `Buen día ${firstName},`
    : arHour >= 12 && arHour < 20
    ? `Buenas tardes ${firstName},`
    : `Buenas noches ${firstName},`
  const saludoDeseo = arHour >= 5 && arHour < 12
    ? '¡Que tengas un excelente día!'
    : arHour >= 12 && arHour < 20
    ? '¡Que tengas una linda tarde!'
    : '¡Que tengas una linda noche!'

  return (
    <div className="py-4 fade-in space-y-5">
      {/* Greeting */}
      <div>
        <div className="text-[20px] lg:text-[22px] font-bold text-[var(--text)] leading-snug">
          <p>{saludoBase}</p>
          <p>{saludoDeseo}</p>
        </div>
        <p className="text-[13px] text-gray-400 mt-0.5">
          {fmtDateLabel(today)}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

        {/* Empleados activos */}
        <Link href="/dashboard/empleados"
          className="bg-[image:var(--gradient)] rounded-2xl p-4 text-white shadow-sm hover:opacity-90 transition-opacity cursor-pointer">
          <div className="flex items-start justify-between mb-3">
            <div className="w-8 h-8 bg-white/15 rounded-xl flex items-center justify-center">
              <IconUsers size={16} className="text-white" />
            </div>
            <IconChevronRight size={14} className="text-white/50 mt-1" />
          </div>
          <p className="text-[32px] font-bold leading-none mb-1">{totalEmpleados}</p>
          <p className="text-[11px] text-white/70">Empleadas activas</p>
        </Link>

        {/* Ausentes hoy */}
        <div className="col-span-2 lg:col-span-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          {/* Mobile: número izq + lista der */}
          <div className="flex items-stretch gap-2 lg:hidden">
            <div className="flex flex-col items-center flex-shrink-0 w-16">
              <div className="w-8 h-8 bg-red-50 rounded-xl flex items-center justify-center mb-auto">
                <IconAlertCircle size={16} className="text-red-400" />
              </div>
              <p className="text-[28px] font-bold leading-none text-red-500 mt-2">{ausentesHoy}</p>
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
          {/* Desktop: header + línea + lista detallada */}
          <div className="hidden lg:flex lg:flex-col h-full">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-red-50 rounded-lg flex items-center justify-center">
                  <IconAlertCircle size={14} className="text-red-400" />
                </div>
                <span className="text-[13px] font-semibold text-gray-600">Ausentes hoy</span>
              </div>
              <span className="text-[26px] font-bold text-red-500 leading-none">{ausentesHoy}</span>
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

        {/* Solicitudes pendientes */}
        <div className="col-span-2 lg:col-span-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          {/* Mobile */}
          <div className="flex items-stretch gap-2 lg:hidden">
            <div className="flex flex-col items-center flex-shrink-0 w-16">
              <div className="w-8 h-8 bg-amber-50 rounded-xl flex items-center justify-center mb-auto">
                <IconFileText size={16} className="text-amber-500" />
              </div>
              <p className="text-[28px] font-bold leading-none text-amber-600 mt-2">{pendientes.length}</p>
              <p className="text-[10px] text-gray-400 mt-0.5 text-center leading-tight">Pendientes</p>
            </div>
            <div className="w-px bg-gray-100 self-stretch mx-1" />
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-2">
              {pendientes.length === 0
                ? <p className="text-[11px] text-gray-300 italic">Sin pendientes</p>
                : pendientes.map(s => (
                  <Link key={s.id} href="/dashboard/solicitudes" className="flex items-center justify-between gap-1 min-w-0 hover:opacity-70 transition-opacity">
                    <div className="flex items-baseline gap-1 min-w-0 flex-1">
                      <span className="text-[12px] font-semibold text-gray-800 flex-shrink-0">{s.empleado_nombre}</span>
                      <span className="text-[11px] text-gray-400 truncate">· {s.tipo}</span>
                    </div>
                    <span className="text-[10px] text-gray-400 flex-shrink-0 font-medium">
                      {s.dias && s.dias > 1 ? `${s.dias}d · ` : ''}{fmtRango(s.fecha_inicio, s.fecha_fin ?? null)}
                    </span>
                  </Link>
                ))
              }
            </div>
          </div>
          {/* Desktop */}
          <div className="hidden lg:flex lg:flex-col h-full">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-amber-50 rounded-lg flex items-center justify-center">
                  <IconFileText size={14} className="text-amber-500" />
                </div>
                <span className="text-[13px] font-semibold text-gray-600">Solicitudes pendientes</span>
              </div>
              <span className="text-[26px] font-bold text-amber-600 leading-none">{pendientes.length}</span>
            </div>
            <div className="h-px bg-gray-100 mb-2.5" />
            <div className="flex flex-col gap-2 overflow-y-auto max-h-[120px]">
              {pendientes.length === 0
                ? <p className="text-[11px] text-gray-300 italic">Sin pendientes</p>
                : pendientes.map(s => (
                  <Link key={s.id} href="/dashboard/solicitudes"
                    className="flex items-center justify-between gap-2 min-w-0 hover:opacity-70 transition-opacity">
                    <div className="flex items-baseline gap-1 min-w-0 flex-1">
                      <span className="text-[12px] font-semibold text-gray-800 flex-shrink-0">{s.empleado_nombre}</span>
                      <span className="text-[11px] text-gray-400 truncate">· {s.tipo}</span>
                    </div>
                    <span className="text-[10px] text-gray-400 flex-shrink-0 font-medium">
                      {s.dias && s.dias > 1 ? `${s.dias}d · ` : ''}{fmtRango(s.fecha_inicio, s.fecha_fin ?? null)}
                    </span>
                  </Link>
                ))
              }
            </div>
          </div>
        </div>

        {/* Próximos cumpleaños */}
        <div className="col-span-2 lg:col-span-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-stretch gap-2">
            <div className="flex flex-col items-center flex-shrink-0 w-16">
              <div className="w-8 h-8 bg-pink-50 rounded-xl flex items-center justify-center mb-auto">
                <IconCalendar size={16} className="text-pink-400" />
              </div>
              <p className="text-[28px] font-bold leading-none text-pink-500 mt-2">{cumpleProximos.length}</p>
              <p className="text-[10px] text-gray-400 mt-0.5 text-center leading-tight">Próximos cumpleaños</p>
            </div>
            <div className="w-px bg-gray-100 self-stretch mx-1" />
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-2 max-h-[150px] overflow-y-auto">
              {cumpleProximos.length === 0
                ? <p className="text-[11px] text-gray-300 italic">Sin cumpleaños</p>
                : cumpleProximos.map((b, i) => (
                  <Link key={i} href="/dashboard/calendario" className="flex items-baseline gap-1 min-w-0 hover:opacity-70 transition-opacity">
                    <span className={`text-[12px] truncate flex-shrink-0 ${b.isThisWeek ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>{b.nombre}</span>
                    <span className={`text-[11px] truncate font-medium ${b.isThisWeek ? 'text-pink-500' : 'text-gray-400'}`}>
                      · {b.dias === 0 ? 'Hoy' : b.dias === 1 ? `Mañana` : `${diaSemanaCorto(b.fecha)} ${fmtCorta(b.fecha)}`}
                    </span>
                  </Link>
                ))
              }
            </div>
          </div>
        </div>

      </div>

      {/* Actividad reciente */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-[14px] font-bold text-[var(--text)]">Actividad Reciente</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {actividadFeed.length === 0 && (
            <p className="text-center text-[13px] text-gray-400 py-10">Sin actividad reciente</p>
          )}
          {actividadFeed.map(a => {
            const cfg = ACT_CFG[a.icon] ?? ACT_CFG.sol_pend
            const { Icon, bg, color } = cfg
            return (
              <Link key={a.key} href={a.href}
                className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/60 transition-colors cursor-pointer">
                <div className={`w-7 h-7 rounded-full ${bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={13} className={color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold leading-snug truncate">{a.nombre}</p>
                  <p className="text-[11px] text-gray-500 leading-snug truncate mt-0.5">{a.sub}</p>
                </div>
                <span className="text-[11px] text-gray-400 flex-shrink-0 ml-2">{timeAgo(a.ts)}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
