'use client'

import { useState, useEffect, useCallback } from 'react'
import type { SessionUser } from '@/types'
import {
  IconDollar, IconPlus, IconX, IconCheck, IconSettings, IconAlertCircle, IconChevronLeft, IconChevronRight, IconTrash,
} from '@/components/ui/Icons'

type Adelanto = {
  id: string
  usuario_id: string
  empleado_nombre: string
  monto: number
  monto_aprobado: number | null
  estado: 'pending' | 'approved' | 'rejected'
  comentario_empleado: string | null
  comentario_admin: string | null
  aprobado_por: string | null
  creado_por_admin: boolean
  created_at: string
  fecha_respuesta: string | null
}

type Config = {
  monto_minimo: number
  monto_maximo: number
  dia_habilitacion: number
  max_por_mes: number
}

const DEFAULT_CONFIG: Config = { monto_minimo: 10000, monto_maximo: 100000, dia_habilitacion: 15, max_por_mes: 1 }
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const MESES_CORTOS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

function fmtMonto(n: number) { return '$' + Math.round(n).toLocaleString('es-AR') }
function fmtFecha(iso: string) {
  const d = new Date(iso)
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]} ${d.getFullYear()}`
}
function getMesStr(offset = 0) {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function mesLabel(s: string) {
  const [y, m] = s.split('-').map(Number)
  return `${MESES[m - 1]} ${y}`
}
function prevMes(s: string) {
  const [y, m] = s.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}
function nextMes(s: string) {
  const [y, m] = s.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

function formatMiles(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  return Number(digits).toLocaleString('es-AR')
}

function EstadoBadge({ estado }: { estado: string }) {
  if (estado === 'approved') return <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-50 text-green-700">Aprobado</span>
  if (estado === 'rejected') return <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-600">Rechazado</span>
  return <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-600">Pendiente</span>
}

export default function AdelantosClient({ user }: { user: SessionUser }) {
  const isAdmin = user.rol === 'admin' || user.rol === 'Admin'

  const [tab, setTab] = useState<'pendientes' | 'mes' | 'ajustes'>('pendientes')
  const [mesFiltro, setMesFiltro] = useState(getMesStr())
  const [adelantos, setAdelantos] = useState<Adelanto[]>([])
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG)
  const [usuarios, setUsuarios] = useState<{ id: string; nombre: string }[]>([])

  // Employee request form
  const [showForm, setShowForm] = useState(false)
  const [monto, setMonto] = useState('')
  const [comentario, setComentario] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Action modal (approve / reject / delete / cancel)
  const [actionAdelanto, setActionAdelanto] = useState<Adelanto | null>(null)
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'delete' | 'cancel' | null>(null)
  const [actionMonto, setActionMonto] = useState('')
  const [actionComment, setActionComment] = useState('')
  const [actionSubmitting, setActionSubmitting] = useState(false)
  const [actionError, setActionError] = useState('')

  // Admin: manual create modal
  const [showCreate, setShowCreate] = useState(false)
  const [createUserId, setCreateUserId] = useState('')
  const [createNombre, setCreateNombre] = useState('')
  const [createMonto, setCreateMonto] = useState('')
  const [createComment, setCreateComment] = useState('')
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createError, setCreateError] = useState('')

  // Admin: config edit
  const [configEdit, setConfigEdit] = useState<Config>(DEFAULT_CONFIG)
  const [configSaving, setConfigSaving] = useState(false)
  const [configMsg, setConfigMsg] = useState('')

  const loadAdelantos = useCallback(async () => {
    setLoading(true)
    try {
      let url = '/api/adelantos'
      if (isAdmin) {
        url = tab === 'pendientes' ? '/api/adelantos?estado=pending' : `/api/adelantos?mes=${mesFiltro}`
      }
      const res = await fetch(url)
      const data = await res.json()
      setAdelantos(Array.isArray(data) ? data : [])
    } catch { setAdelantos([]) }
    finally { setLoading(false) }
  }, [isAdmin, tab, mesFiltro])

  useEffect(() => { loadAdelantos() }, [loadAdelantos])

  useEffect(() => {
    fetch('/api/adelantos/config').then(r => r.json()).then(d => { setConfig(d); setConfigEdit(d) }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    fetch('/api/adelantos/usuarios').then(r => r.json()).then(d => { setUsuarios(Array.isArray(d) ? d : []) }).catch(() => {})
  }, [isAdmin])

  function openAction(a: Adelanto, type: 'approve' | 'reject' | 'delete' | 'cancel') {
    setActionAdelanto(a)
    setActionType(type)
    setActionMonto(String(a.monto))
    setActionComment('')
    setActionError('')
  }

  function closeAction() {
    setActionAdelanto(null)
    setActionType(null)
    setActionMonto('')
    setActionComment('')
    setActionError('')
  }

  async function handleAction() {
    if (!actionAdelanto || !actionType) return
    setActionSubmitting(true)
    setActionError('')
    try {
      if (actionType === 'delete' || actionType === 'cancel') {
        const res = await fetch(`/api/adelantos?id=${actionAdelanto.id}`, { method: 'DELETE' })
        if (!res.ok) { const d = await res.json(); setActionError(d.error || 'Error'); return }
      } else {
        const res = await fetch('/api/adelantos', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: actionAdelanto.id,
            estado: actionType === 'approve' ? 'approved' : 'rejected',
            monto_aprobado: actionType === 'approve' ? Number(actionMonto || actionAdelanto.monto) : null,
            comentario_admin: actionComment || null,
          }),
        })
        if (!res.ok) { const d = await res.json(); setActionError(d.error || 'Error'); return }
      }
      closeAction()
      loadAdelantos()
    } finally { setActionSubmitting(false) }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/adelantos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monto: Number(monto.replace(/\./g, '')), comentario_empleado: comentario || null }),
      })
      const data = await res.json()
      if (!res.ok) { setFormError(data.error || 'Error al enviar'); return }
      setSuccessMsg('Solicitud enviada. Te avisamos cuando sea procesada.')
      setMonto(''); setComentario(''); setShowForm(false)
      loadAdelantos()
    } catch { setFormError('Error de conexión') }
    finally { setSubmitting(false) }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateError('')
    setCreateSubmitting(true)
    try {
      const res = await fetch('/api/adelantos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario_id: createUserId, empleado_nombre: createNombre, monto: Number(createMonto.replace(/\./g, '')), comentario_admin: createComment || null }),
      })
      const data = await res.json()
      if (!res.ok) { setCreateError(data.error || 'Error al registrar'); return }
      setShowCreate(false); setCreateUserId(''); setCreateNombre(''); setCreateMonto(''); setCreateComment('')
      if (tab === 'mes') loadAdelantos()
    } catch { setCreateError('Error de conexión') }
    finally { setCreateSubmitting(false) }
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault()
    setConfigSaving(true); setConfigMsg('')
    try {
      const res = await fetch('/api/adelantos/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configEdit),
      })
      if (res.ok) { setConfig(configEdit); setConfigMsg('Configuración guardada'); setTimeout(() => setConfigMsg(''), 3000) }
    } finally { setConfigSaving(false) }
  }

  // ── Action modal ──
  const ActionModal = actionAdelanto && actionType ? (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={closeAction}>
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-[16px] font-bold">
            {actionType === 'approve' ? 'Aprobar adelanto'
              : actionType === 'reject' ? 'Rechazar adelanto'
              : actionType === 'delete' ? 'Eliminar adelanto'
              : 'Cancelar solicitud'}
          </h3>
          <button onClick={closeAction} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer text-gray-400"><IconX size={16} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-gray-50 rounded-xl px-4 py-3">
            <p className="text-[14px] font-semibold text-[var(--text)]">{actionAdelanto.empleado_nombre}</p>
            <p className="text-[18px] font-bold text-[var(--primary)]">{fmtMonto(actionAdelanto.monto)}</p>
            {actionAdelanto.comentario_empleado && (
              <p className="text-[12px] text-gray-500 mt-1">"{actionAdelanto.comentario_empleado}"</p>
            )}
          </div>

          {(actionType === 'delete' || actionType === 'cancel') && (
            <p className="text-[13px] text-gray-500">
              {actionType === 'delete'
                ? 'Se eliminará permanentemente este adelanto.'
                : 'Se cancelará esta solicitud y podrás pedir otra.'}
            </p>
          )}

          {actionType === 'approve' && (
            <div>
              <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-1.5 block">Monto a aprobar</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-gray-400 font-medium">$</span>
                <input
                  type="number"
                  value={actionMonto}
                  onChange={e => setActionMonto(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl pl-7 pr-3 py-2.5 text-[15px] font-semibold outline-none focus:border-[var(--primary)]"
                  autoFocus
                />
              </div>
            </div>
          )}

          {(actionType === 'approve' || actionType === 'reject') && (
            <div>
              <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-1.5 block">
                {actionType === 'approve' ? 'Comentario (opcional)' : 'Motivo del rechazo (opcional)'}
              </label>
              <input
                type="text"
                value={actionComment}
                onChange={e => setActionComment(e.target.value)}
                placeholder={actionType === 'approve' ? 'Ej: Aprobado por excepción' : 'Ej: Superaste el límite mensual'}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] outline-none focus:border-[var(--primary)]"
              />
            </div>
          )}

          {actionError && (
            <p className="text-[12px] text-red-500">{actionError}</p>
          )}
        </div>

        <div className="flex gap-2 px-5 pb-5 pt-1">
          <button onClick={closeAction} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-[14px] text-gray-500 cursor-pointer hover:bg-gray-50">
            Volver
          </button>
          <button
            onClick={handleAction}
            disabled={actionSubmitting}
            className={`flex-1 py-2.5 rounded-xl text-[14px] font-semibold text-white cursor-pointer disabled:opacity-60 ${
              actionType === 'approve' ? 'bg-green-500 hover:bg-green-600'
              : 'bg-red-500 hover:bg-red-600'
            }`}
          >
            {actionSubmitting ? '...'
              : actionType === 'approve' ? 'Confirmar aprobación'
              : actionType === 'reject' ? 'Confirmar rechazo'
              : actionType === 'delete' ? 'Eliminar'
              : 'Cancelar solicitud'}
          </button>
        </div>
      </div>
    </div>
  ) : null

  // ─────────────────────────────────────────────
  // ADMIN VIEW
  // ─────────────────────────────────────────────
  if (isAdmin) {
    const mesTotal = adelantos.filter(a => a.estado === 'approved').reduce((s, a) => s + (a.monto_aprobado ?? a.monto), 0)
    const sorted = [...adelantos].sort((a, b) => a.empleado_nombre.localeCompare(b.empleado_nombre, 'es'))

    return (
      <div className="py-4 fade-in">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[image:var(--gradient)] flex items-center justify-center flex-shrink-0 shadow-sm">
              <IconDollar size={18} className="text-white" />
            </div>
            <h1 className="text-[17px] font-bold text-[var(--text)]">Adelantos</h1>
          </div>
          <button
            onClick={() => { setShowCreate(true); setCreateError('') }}
            className="flex items-center gap-1.5 px-3 py-2 bg-[image:var(--gradient)] text-white text-[13px] font-semibold rounded-xl cursor-pointer"
          >
            <IconPlus size={15} /> Registrar
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-5">
          {(['pendientes', 'mes', 'ajustes'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 text-[13px] font-medium rounded-[10px] cursor-pointer transition-all ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
            >
              {t === 'pendientes'
                ? `Pendientes${tab === 'pendientes' && adelantos.length ? ` (${adelantos.length})` : ''}`
                : t === 'mes' ? 'Por mes'
                : <span className="flex items-center justify-center gap-1"><IconSettings size={13} />Ajustes</span>}
            </button>
          ))}
        </div>

        {/* ── Tab: Pendientes ── */}
        {tab === 'pendientes' && (
          <div className="space-y-3">
            {loading ? (
              <div className="py-12 flex justify-center">
                <div className="w-6 h-6 border-2 border-gray-200 border-t-[var(--primary)] rounded-full animate-spin" />
              </div>
            ) : adelantos.length === 0 ? (
              <div className="text-center py-14">
                <IconCheck size={40} className="mx-auto mb-3 text-green-400" />
                <p className="text-[14px] text-gray-400">No hay adelantos pendientes</p>
              </div>
            ) : adelantos.map(a => (
              <div key={a.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-semibold text-[var(--text)]">{a.empleado_nombre}</p>
                    <p className="text-[12px] text-gray-400 mt-0.5">{fmtFecha(a.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-[22px] font-bold text-[var(--primary)] leading-none">{fmtMonto(a.monto)}</p>
                    <button onClick={() => openAction(a, 'delete')} className="p-1.5 text-gray-300 hover:text-red-400 cursor-pointer transition-colors" title="Eliminar">
                      <IconTrash size={15} />
                    </button>
                  </div>
                </div>

                {a.comentario_empleado && (
                  <p className="text-[13px] text-gray-600 bg-gray-50 rounded-xl px-3 py-2 leading-relaxed">
                    "{a.comentario_empleado}"
                  </p>
                )}

                <div className="flex gap-2 border-t border-gray-100 pt-3">
                  <button
                    onClick={() => openAction(a, 'reject')}
                    className="flex-1 py-2.5 border border-red-200 text-red-500 rounded-xl text-[13px] font-medium cursor-pointer hover:bg-red-50 transition-colors"
                  >
                    Rechazar
                  </button>
                  <button
                    onClick={() => openAction(a, 'approve')}
                    className="flex-1 py-2.5 bg-green-500 text-white rounded-xl text-[13px] font-semibold cursor-pointer hover:bg-green-600 transition-colors"
                  >
                    Aprobar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Tab: Por mes ── */}
        {tab === 'mes' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <button onClick={() => setMesFiltro(prevMes(mesFiltro))} className="p-2 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                <IconChevronLeft size={16} />
              </button>
              <div className="flex-1 text-center">
                <p className="text-[16px] font-semibold">{mesLabel(mesFiltro)}</p>
              </div>
              <button onClick={() => setMesFiltro(nextMes(mesFiltro))} className="p-2 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                <IconChevronRight size={16} />
              </button>
            </div>

            {loading ? (
              <div className="py-12 flex justify-center">
                <div className="w-6 h-6 border-2 border-gray-200 border-t-[var(--primary)] rounded-full animate-spin" />
              </div>
            ) : sorted.length === 0 ? (
              <div className="text-center py-12">
                <IconDollar size={36} className="mx-auto mb-3 text-gray-200" />
                <p className="text-[14px] text-gray-400">Sin adelantos en {mesLabel(mesFiltro)}</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="divide-y divide-gray-50">
                  {sorted.map(a => (
                    <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-[var(--text)] truncate">{a.empleado_nombre}</p>
                        <p className="text-[11px] text-gray-400">{fmtFecha(a.created_at)}</p>
                        {a.comentario_admin && <p className="text-[11px] text-gray-400 italic truncate">{a.comentario_admin}</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="flex flex-col items-end gap-1">
                          <p className="text-[15px] font-bold text-[var(--text)]">{fmtMonto(a.monto_aprobado ?? a.monto)}</p>
                          <EstadoBadge estado={a.estado} />
                        </div>
                        <button onClick={() => openAction(a, 'delete')} className="p-1.5 text-gray-300 hover:text-red-400 cursor-pointer transition-colors" title="Eliminar">
                          <IconTrash size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {mesTotal > 0 && (
                  <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                    <p className="text-[13px] text-gray-500 font-medium">Total aprobados</p>
                    <p className="text-[17px] font-bold text-[var(--text)]">{fmtMonto(mesTotal)}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Ajustes ── */}
        {tab === 'ajustes' && (
          <form onSubmit={handleSaveConfig} className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-5">
              <div>
                <p className="text-[13px] font-semibold text-gray-700 mb-0.5">Montos permitidos</p>
                <p className="text-[11px] text-gray-400 mb-3">El máximo es la suma total de adelantos por empleada en el mes.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-1.5 block">Mínimo por solicitud ($)</label>
                    <input type="number" value={configEdit.monto_minimo}
                      onChange={e => setConfigEdit(c => ({ ...c, monto_minimo: Number(e.target.value) }))}
                      min={0} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] outline-none focus:border-[var(--primary)]" />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-1.5 block">Máximo mensual por empleada ($)</label>
                    <input type="number" value={configEdit.monto_maximo}
                      onChange={e => setConfigEdit(c => ({ ...c, monto_maximo: Number(e.target.value) }))}
                      min={0} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] outline-none focus:border-[var(--primary)]" />
                  </div>
                </div>
              </div>

              <div className="h-px bg-gray-100" />

              <div>
                <p className="text-[13px] font-semibold text-gray-700 mb-3">Restricciones</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-1.5 block">Habilitado desde el día</label>
                    <input type="number" value={configEdit.dia_habilitacion}
                      onChange={e => setConfigEdit(c => ({ ...c, dia_habilitacion: Number(e.target.value) }))}
                      min={1} max={28} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] outline-none focus:border-[var(--primary)]" />
                    <p className="text-[11px] text-gray-400 mt-1">del mes</p>
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-1.5 block">Máx. solicitudes/mes</label>
                    <input type="number" value={configEdit.max_por_mes}
                      onChange={e => setConfigEdit(c => ({ ...c, max_por_mes: Number(e.target.value) }))}
                      min={1} max={10} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] outline-none focus:border-[var(--primary)]" />
                    <p className="text-[11px] text-gray-400 mt-1">por empleada</p>
                  </div>
                </div>
              </div>
            </div>
            {configMsg && <p className="text-[13px] text-green-600 text-center font-medium">{configMsg}</p>}
            <button type="submit" disabled={configSaving} className="w-full py-3 bg-[image:var(--gradient)] text-white text-[14px] font-semibold rounded-xl cursor-pointer disabled:opacity-60">
              {configSaving ? 'Guardando...' : 'Guardar configuración'}
            </button>
          </form>
        )}

        {/* Create modal */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
            <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h3 className="text-[16px] font-bold">Registrar adelanto</h3>
                <button onClick={() => setShowCreate(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer text-gray-400"><IconX size={16} /></button>
              </div>
              <form onSubmit={handleCreate}>
                <div className="p-5 space-y-3">
                  <div>
                    <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-1.5 block">Empleada</label>
                    {usuarios.length > 0 ? (
                      <select value={createUserId}
                        onChange={e => { const u = usuarios.find(u => u.id === e.target.value); setCreateUserId(e.target.value); setCreateNombre(u?.nombre ?? '') }}
                        required className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] outline-none focus:border-[var(--primary)] bg-white cursor-pointer">
                        <option value="">Seleccionar empleada</option>
                        {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                      </select>
                    ) : (
                      <input type="text" value={createNombre} onChange={e => setCreateNombre(e.target.value)} placeholder="Nombre de la empleada" required
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] outline-none focus:border-[var(--primary)]" />
                    )}
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-1.5 block">Monto</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-gray-400 font-medium">$</span>
                      <input type="text" inputMode="numeric" value={createMonto} onChange={e => setCreateMonto(formatMiles(e.target.value))} placeholder="0" required
                        className="w-full border border-gray-200 rounded-xl pl-7 pr-3 py-2.5 text-[14px] outline-none focus:border-[var(--primary)]" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-1.5 block">Nota (opcional)</label>
                    <input type="text" value={createComment} onChange={e => setCreateComment(e.target.value)} placeholder="Ej: Adelanto quincena"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] outline-none focus:border-[var(--primary)]" />
                  </div>
                  {createError && <p className="text-[12px] text-red-500">{createError}</p>}
                </div>
                <div className="flex gap-2 px-5 pb-5 pt-1">
                  <button type="button" onClick={() => setShowCreate(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-[14px] text-gray-500 cursor-pointer hover:bg-gray-50">Cancelar</button>
                  <button type="submit" disabled={createSubmitting} className="flex-1 py-2.5 bg-[image:var(--gradient)] text-white text-[14px] font-semibold rounded-xl cursor-pointer disabled:opacity-60">
                    {createSubmitting ? '...' : 'Registrar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {ActionModal}
      </div>
    )
  }

  // ─────────────────────────────────────────────
  // EMPLOYEE VIEW
  // ─────────────────────────────────────────────
  const currentMes = getMesStr()
  const thisMesUsados = adelantos.filter(a => a.created_at.slice(0, 7) === currentMes && a.estado !== 'rejected').length
  const limitReached = thisMesUsados >= config.max_por_mes

  type YearGroup = { year: number; months: { mes: string; items: Adelanto[] }[] }
  const byYear: YearGroup[] = []
  for (const a of adelantos) {
    const mes = a.created_at.slice(0, 7)
    const year = Number(mes.slice(0, 4))
    let yg = byYear.find(g => g.year === year)
    if (!yg) { yg = { year, months: [] }; byYear.push(yg) }
    let mg = yg.months.find(m => m.mes === mes)
    if (!mg) { mg = { mes, items: [] }; yg.months.push(mg) }
    mg.items.push(a)
  }
  byYear.sort((a, b) => b.year - a.year)
  byYear.forEach(yg => yg.months.sort((a, b) => b.mes.localeCompare(a.mes)))

  return (
    <div className="py-4 fade-in space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[image:var(--gradient)] flex items-center justify-center flex-shrink-0 shadow-sm">
            <IconDollar size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-[17px] font-bold text-[var(--text)]">Mis Adelantos</h1>
            {!loading && (
              <p className="text-xs text-[var(--text-muted)]">
                {thisMesUsados} de {config.max_por_mes} adelanto{config.max_por_mes !== 1 ? 's' : ''} usados este mes
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[12px] text-gray-400 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100">
          <IconAlertCircle size={13} />
          Desde el día {config.dia_habilitacion}
        </div>
      </div>

      {!showForm ? (
        <button onClick={() => { setShowForm(true); setFormError('') }} disabled={limitReached}
          className="w-full py-3.5 flex items-center justify-center gap-2 bg-[image:var(--gradient)] text-white text-[14px] font-semibold rounded-2xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-opacity">
          <IconPlus size={17} />
          {limitReached ? 'Límite de adelantos alcanzado este mes' : 'Solicitar adelanto'}
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">Solicitar adelanto</h2>
            <button type="button" onClick={() => { setShowForm(false); setFormError('') }} className="p-1 text-gray-400 cursor-pointer"><IconX size={16} /></button>
          </div>
          <div>
            <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-1.5 block">
              Monto · {fmtMonto(config.monto_minimo)} mín — {fmtMonto(config.monto_maximo)} máx mensual
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[15px] text-gray-400 font-medium">$</span>
              <input type="text" inputMode="numeric" value={monto} onChange={e => setMonto(formatMiles(e.target.value))} placeholder="0" required
                className="w-full border border-gray-200 rounded-xl pl-7 pr-3 py-3 text-[16px] outline-none focus:border-[var(--primary)]" autoFocus />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-1.5 block">Comentario (opcional)</label>
            <input type="text" value={comentario} onChange={e => setComentario(e.target.value)} placeholder="Ej: Para pagar el alquiler"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] outline-none focus:border-[var(--primary)]" />
          </div>
          {formError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
              <IconAlertCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-[12px] text-red-600">{formError}</p>
            </div>
          )}
          <button type="submit" disabled={submitting} className="w-full py-3 bg-[image:var(--gradient)] text-white text-[14px] font-semibold rounded-xl cursor-pointer disabled:opacity-60">
            {submitting ? 'Enviando...' : 'Enviar solicitud'}
          </button>
        </form>
      )}

      {successMsg && (
        <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <IconCheck size={15} className="text-green-500 mt-0.5 flex-shrink-0" />
          <p className="text-[13px] text-green-700">{successMsg}</p>
        </div>
      )}

      {loading ? (
        <div className="py-12 flex justify-center">
          <div className="w-6 h-6 border-2 border-gray-200 border-t-[var(--primary)] rounded-full animate-spin" />
        </div>
      ) : byYear.length === 0 ? (
        <div className="text-center py-12">
          <IconDollar size={40} className="mx-auto mb-3 text-gray-200" />
          <p className="text-[14px] text-gray-400">Todavía no tenés adelantos</p>
        </div>
      ) : byYear.map(yg => (
        <div key={yg.year} className="space-y-3">
          <p className="text-[13px] font-bold text-gray-400">{yg.year}</p>
          {yg.months.map(mg => (
            <div key={mg.mes}>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">{mesLabel(mg.mes)}</p>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="divide-y divide-gray-50">
                  {mg.items.map(a => (
                    <div key={a.id} className="px-4 py-3.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <EstadoBadge estado={a.estado} />
                        <p className="text-[17px] font-bold text-[var(--text)]">{fmtMonto(a.monto_aprobado ?? a.monto)}</p>
                      </div>
                      {a.estado === 'approved' && a.monto_aprobado !== null && a.monto_aprobado !== a.monto && (
                        <p className="text-[11px] text-gray-400">Solicitado: {fmtMonto(a.monto)}</p>
                      )}
                      <p className="text-[11px] text-gray-400">{fmtFecha(a.created_at)}</p>
                      {a.comentario_empleado && <p className="text-[12px] text-gray-500 leading-relaxed">{a.comentario_empleado}</p>}
                      {a.comentario_admin && <p className="text-[12px] text-[var(--primary)] italic">"{a.comentario_admin}"</p>}
                      {a.estado === 'pending' && (
                        <button
                          onClick={() => openAction(a, 'cancel')}
                          className="text-[11px] text-red-400 hover:text-red-600 font-medium cursor-pointer mt-0.5"
                        >
                          Cancelar solicitud
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}

      {ActionModal}
    </div>
  )
}
