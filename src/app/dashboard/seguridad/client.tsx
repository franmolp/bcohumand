'use client'

import { useState, useEffect, useCallback } from 'react'
import { Spinner } from '@/components/ui'
import { IconShield, IconRefresh, IconSearch } from '@/components/ui/Icons'

interface LogEntry {
  id: number
  created_at: string
  accion: string
  detalle: string | null
  ip: string | null
  user_agent: string | null
  usuario_texto: string | null
  usuario: { nombre: string; usuario: string } | null
}

const ACCIONES: Record<string, { label: string; cls: string }> = {
  login_exitoso:        { label: 'Ingreso exitoso',      cls: 'bg-green-50 text-green-700 border-green-100' },
  contrasena_incorrecta:{ label: 'Contraseña incorrecta', cls: 'bg-amber-50 text-amber-700 border-amber-100' },
  cuenta_bloqueada:     { label: 'Cuenta bloqueada',      cls: 'bg-red-50 text-red-700 border-red-100' },
  cuenta_inactiva:      { label: 'Cuenta inactiva',       cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  usuario_no_encontrado:{ label: 'Usuario inexistente',   cls: 'bg-orange-50 text-orange-700 border-orange-100' },
}

const FILTROS = [
  { value: '', label: 'Todos' },
  { value: 'login_exitoso', label: 'Exitosos' },
  { value: 'contrasena_incorrecta', label: 'Contraseña incorrecta' },
  { value: 'cuenta_bloqueada', label: 'Bloqueados' },
  { value: 'usuario_no_encontrado', label: 'Usuario inexistente' },
]

const PERIODOS = [
  { value: '', label: 'Todo' },
  { value: 'hoy', label: 'Hoy' },
  { value: '7d', label: 'Últimos 7 días' },
  { value: '30d', label: 'Este mes' },
]

function desdeParam(periodo: string): string {
  if (!periodo) return ''
  const now = new Date()
  if (periodo === 'hoy') {
    now.setHours(0, 0, 0, 0)
    return now.toISOString()
  }
  if (periodo === '7d') {
    now.setDate(now.getDate() - 7)
    return now.toISOString()
  }
  if (periodo === '30d') {
    now.setDate(now.getDate() - 30)
    return now.toISOString()
  }
  return ''
}

function parseUA(ua: string | null): string {
  if (!ua) return '—'
  if (ua.includes('iPhone')) return 'iPhone'
  if (ua.includes('iPad')) return 'iPad'
  if (ua.includes('Android')) return 'Android'
  if (ua.includes('Edg/')) return 'Edge'
  if (ua.includes('Chrome')) return 'Chrome'
  if (ua.includes('Firefox')) return 'Firefox'
  if (ua.includes('Safari')) return 'Safari'
  return ua.slice(0, 30)
}

function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function nombreUsuario(entry: LogEntry): string {
  if (entry.usuario?.nombre) return entry.usuario.nombre
  if (entry.usuario_texto) return entry.usuario_texto
  return 'Desconocido'
}

function AcBadge({ accion }: { accion: string }) {
  const a = ACCIONES[accion] || { label: accion, cls: 'bg-gray-100 text-gray-600 border-gray-200' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full border ${a.cls}`}>
      {a.label}
    </span>
  )
}

export default function SeguridadClient() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tipo, setTipo] = useState('')
  const [periodo, setPeriodo] = useState('hoy')
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (tipo) params.set('tipo', tipo)
    if (search) params.set('search', search)
    const desde = desdeParam(periodo)
    if (desde) params.set('desde', desde)
    const r = await fetch(`/api/seguridad?${params}`)
    if (r.ok) setLogs(await r.json())
    setLoading(false)
    setLastRefresh(new Date())
  }, [tipo, search, periodo])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [load])

  // Stats
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const logsHoy = logs.filter(l => new Date(l.created_at) >= hoy)
  const exitososHoy = logsHoy.filter(l => l.accion === 'login_exitoso').length
  const fallidosHoy = logsHoy.filter(l => l.accion === 'contrasena_incorrecta').length
  const bloqueadosHoy = logsHoy.filter(l => l.accion === 'cuenta_bloqueada').length

  return (
    <div className="py-4 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[image:var(--gradient)] flex items-center justify-center flex-shrink-0 shadow-sm">
            <IconShield size={18} className="text-white" />
          </div>
          <h1 className="text-[17px] font-bold text-[var(--text)]">Seguridad</h1>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-[12px] text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors"
        >
          <IconRefresh size={14} />
          {lastRefresh && (
            <span className="hidden sm:inline">
              {lastRefresh.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white rounded-2xl border border-[var(--border)] shadow-sm p-3 text-center">
          <p className="text-[22px] font-bold text-green-600">{exitososHoy}</p>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Exitosos hoy</p>
        </div>
        <div className="bg-white rounded-2xl border border-[var(--border)] shadow-sm p-3 text-center">
          <p className="text-[22px] font-bold text-amber-500">{fallidosHoy}</p>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Fallidos hoy</p>
        </div>
        <div className="bg-white rounded-2xl border border-[var(--border)] shadow-sm p-3 text-center">
          <p className="text-[22px] font-bold text-red-500">{bloqueadosHoy}</p>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Bloqueados hoy</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-2 mb-4">
        <div className="relative">
          <IconSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por usuario..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-[14px] bg-white border border-[var(--border)] rounded-xl focus:outline-none focus:border-[var(--primary)] shadow-sm"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          {PERIODOS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriodo(p.value)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${periodo === p.value ? 'bg-[var(--primary)] text-white' : 'bg-white border border-[var(--border)] text-[var(--text-muted)]'}`}
            >
              {p.label}
            </button>
          ))}
          <div className="w-px bg-[var(--border)] flex-shrink-0 mx-1" />
          {FILTROS.map(f => (
            <button
              key={f.value}
              onClick={() => setTipo(f.value)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${tipo === f.value ? 'bg-[var(--primary)] text-white' : 'bg-white border border-[var(--border)] text-[var(--text-muted)]'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla desktop */}
      <div className="hidden lg:block bg-white rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[var(--border)] bg-gray-50">
              <th className="text-left px-4 py-3 font-semibold text-[var(--text-muted)]">Fecha/Hora</th>
              <th className="text-left px-4 py-3 font-semibold text-[var(--text-muted)]">Usuario</th>
              <th className="text-left px-4 py-3 font-semibold text-[var(--text-muted)]">Tipo</th>
              <th className="text-left px-4 py-3 font-semibold text-[var(--text-muted)]">Detalle</th>
              <th className="text-left px-4 py-3 font-semibold text-[var(--text-muted)]">IP</th>
              <th className="text-left px-4 py-3 font-semibold text-[var(--text-muted)]">Dispositivo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {loading ? (
              <tr><td colSpan={6} className="py-12"><Spinner /></td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={6} className="py-10 text-center text-[var(--text-muted)]">Sin registros</td></tr>
            ) : logs.map(l => (
              <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-[var(--text-muted)] whitespace-nowrap">{fmtDateTime(l.created_at)}</td>
                <td className="px-4 py-3 font-medium text-[var(--text)]">{nombreUsuario(l)}</td>
                <td className="px-4 py-3"><AcBadge accion={l.accion} /></td>
                <td className="px-4 py-3 text-[var(--text-muted)]">{l.detalle || '—'}</td>
                <td className="px-4 py-3 font-mono text-[12px] text-[var(--text-muted)]">{l.ip || '—'}</td>
                <td className="px-4 py-3 text-[var(--text-muted)]">{parseUA(l.user_agent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cards mobile */}
      <div className="lg:hidden space-y-2">
        {loading ? (
          <div className="py-12"><Spinner /></div>
        ) : logs.length === 0 ? (
          <p className="py-10 text-center text-[var(--text-muted)] text-sm">Sin registros</p>
        ) : logs.map(l => (
          <div key={l.id} className="bg-white rounded-2xl border border-[var(--border)] shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <AcBadge accion={l.accion} />
              <span className="text-[11px] text-[var(--text-muted)]">{fmtDateTime(l.created_at)}</span>
            </div>
            <p className="text-[14px] font-semibold text-[var(--text)]">{nombreUsuario(l)}</p>
            {l.detalle && <p className="text-[12px] text-[var(--text-muted)] mt-0.5">{l.detalle}</p>}
            <div className="flex gap-3 mt-2 text-[11px] text-gray-400">
              <span className="font-mono">{l.ip || '—'}</span>
              <span>·</span>
              <span>{parseUA(l.user_agent)}</span>
            </div>
          </div>
        ))}
      </div>

      {logs.length > 0 && (
        <p className="text-[11px] text-[var(--text-muted)] text-center mt-3">{logs.length} registros · Se actualiza cada 30s</p>
      )}
    </div>
  )
}
