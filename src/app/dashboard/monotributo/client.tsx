'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { SessionUser, MonotributoRecord } from '@/types'
import { Modal, Toast, Spinner } from '@/components/ui'
import {
  IconReceipt, IconCheck, IconX, IconPlus, IconAlertCircle,
  IconEye, IconSettings, IconUsers, IconTrash, IconUpload, IconBell, IconRefresh,
} from '@/components/ui/Icons'
import { compressImage } from '@/lib/compress-image'
import FileViewer from '@/components/FileViewer'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function mesLabel(m: string) {
  const [y, mo] = m.split('-')
  return `${MESES[parseInt(mo) - 1]} ${y}`
}

function currentMes() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function fmtFecha(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

interface EmpResumen { id: string; nombre: string; record: MonotributoRecord | null }
interface EmpConfig { id: string; nombre: string; monotributo_habilitado: boolean }

// ─── Estado badge ────────────────────────────────────────────────────────────
function EstadoBadge({ record }: { record: MonotributoRecord | null }) {
  if (!record) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-600 border border-red-200">
      <IconX size={11} /> Pendiente
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
      <IconCheck size={11} /> Presentado
    </span>
  )
}

// ─── File link ───────────────────────────────────────────────────────────────
function FileLink({ url, nombre, label, onView }: {
  url: string | null; nombre: string | null; label: string
  onView?: (url: string, nombre: string | null) => void
}) {
  if (!url) return <span className="text-gray-300 text-xs">—</span>
  return (
    <button
      onClick={() => onView ? onView(url, nombre ?? label) : window.open(url, '_blank')}
      className="inline-flex items-center gap-1 text-xs text-[var(--primary)] hover:underline cursor-pointer">
      <IconEye size={12} /> {nombre ?? label}
    </button>
  )
}

// ─── Upload input ────────────────────────────────────────────────────────────
function FileInput({ label, required, onChange, currentName }: {
  label: string; required?: boolean; onChange: (f: File | null) => void; currentName?: string | null
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [name, setName] = useState<string | null>(currentName ?? null)
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div
        onClick={() => ref.current?.click()}
        className="flex items-center gap-2 h-11 px-3 border border-dashed border-[var(--border)] rounded-xl cursor-pointer hover:border-[var(--primary)] hover:bg-[var(--primary-light)]/40 transition-colors">
        <IconUpload size={15} className="text-gray-400 flex-shrink-0" />
        <span className="text-sm text-[var(--text-muted)] truncate flex-1">{name ?? 'Seleccionar archivo…'}</span>
        {name && <IconCheck size={14} className="text-emerald-500 flex-shrink-0" />}
      </div>
      <input
        ref={ref}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0] ?? null
          setName(f?.name ?? null)
          onChange(f)
        }}
      />
      <p className="text-[10px] text-[var(--text-muted)] mt-1">PDF, JPG o PNG · máx. 10 MB</p>
    </div>
  )
}

// ─── Admin: Resumen ───────────────────────────────────────────────────────────
function AdminResumen() {
  const [mes, setMes] = useState(currentMes())
  const [data, setData] = useState<EmpResumen[]>([])
  const [loading, setLoading] = useState(true)
  const [notifying, setNotifying] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [toast, setToast] = useState({ visible: false, msg: '', type: 'success' as 'success' | 'error' })
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [fotosMap, setFotosMap] = useState<Record<string, string | null>>({})
  const [viewer, setViewer] = useState<{ url: string; name: string | null } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ visible: true, msg, type })
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 4000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/monotributo?mes=${mes}`)
    const json = await res.json()
    const d: EmpResumen[] = Array.isArray(json) ? json : []
    setData(d)
    setLoading(false)
    if (d.length) {
      const ids = d.map(e => e.id).join(',')
      fetch(`/api/usuarios/fotos?ids=${ids}`).then(r => r.json()).then(setFotosMap).catch(() => {})
    }
  }, [mes])

  useEffect(() => { load() }, [load])

  async function handleDelete(id: string) {
    const res = await fetch(`/api/monotributo/${id}`, { method: 'DELETE' })
    if (res.ok) { showToast('Registro eliminado'); load() }
    else showToast('Error al eliminar', 'error')
    setDeleteId(null)
  }

  async function notificar() {
    setNotifying(true)
    const res = await fetch('/api/monotributo/notificar', { method: 'POST' })
    const json = await res.json()
    setNotifying(false)
    if (json.error) showToast(json.error, 'error')
    else if (json.notified === 0 && json.message) showToast(json.message)
    else showToast(`${json.notified} notificacion${json.notified === 1 ? '' : 'es'} enviada${json.notified === 1 ? '' : 's'}`)
  }

  async function syncDrive() {
    setSyncing(true)
    const res = await fetch('/api/monotributo/sync-drive', { method: 'POST' })
    const json = await res.json()
    setSyncing(false)
    if (json.error) { showToast(json.error, 'error'); return }
    const { imported = 0, skipped = 0, noMatch = [], errors = [] } = json
    const parts: string[] = []
    if (imported > 0) parts.push(`${imported} importado${imported !== 1 ? 's' : ''}`)
    if (skipped > 0) parts.push(`${skipped} ya existían`)
    if (noMatch.length > 0) parts.push(`sin match: ${noMatch.join(', ')}`)
    if (errors.length > 0) parts.push(`${errors.length} error${errors.length !== 1 ? 'es' : ''}: ${errors[0]}`)
    showToast(parts.length ? parts.join(' · ') : 'Sin cambios', imported > 0 ? 'success' : 'error')
    if (imported > 0) load()
  }

  const presentados = data.filter(d => d.record).length
  const pendientes = data.filter(d => !d.record).length

  return (
    <div className="space-y-4">
      <Toast visible={toast.visible} message={toast.msg} type={toast.type} onClose={() => setToast(t => ({ ...t, visible: false }))} />

      {/* Header */}
      <div className="flex flex-wrap gap-2 items-center">
        <input type="month" value={mes} onChange={e => setMes(e.target.value)}
          className="h-10 px-3 bg-white border border-[var(--border)] rounded-xl text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
          style={{ fontSize: 16 }} />
        <button onClick={notificar} disabled={notifying}
          className="h-10 px-4 rounded-xl text-sm font-medium border border-[var(--border)] bg-white text-[var(--text-sub)] flex items-center gap-1.5 hover:bg-gray-50 disabled:opacity-50 transition-colors">
          <IconBell size={15} /> {notifying ? 'Enviando…' : 'Notificar pendientes'}
        </button>
        <button onClick={syncDrive} disabled={syncing}
          className="h-10 px-4 rounded-xl text-sm font-medium border border-[var(--border)] bg-white text-[var(--text-sub)] flex items-center gap-1.5 hover:bg-gray-50 disabled:opacity-50 transition-colors">
          <IconRefresh size={15} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Sincronizando…' : 'Sincronizar Drive'}
        </button>
        {data.length > 0 && (
          <div className="ml-auto flex gap-3 text-sm">
            <span className="text-emerald-600 font-medium">{presentados} presentado{presentados !== 1 ? 's' : ''}</span>
            {pendientes > 0 && <span className="text-red-500 font-medium">{pendientes} pendiente{pendientes !== 1 ? 's' : ''}</span>}
          </div>
        )}
      </div>

      {loading ? <Spinner /> : data.length === 0 ? (
        <div className="text-center py-16 text-[var(--text-muted)] text-sm">
          No hay empleadas con Monotributo habilitado
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden lg:block bg-white rounded-2xl border border-[var(--border)] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Empleada</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-left">Comprobante</th>
                  <th className="px-4 py-3 text-left">Factura</th>
                  <th className="px-4 py-3 text-left">Fecha</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.map(emp => (
                  <tr key={emp.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-sm font-medium text-[var(--text)]">{emp.nombre}</td>
                    <td className="px-4 py-3"><EstadoBadge record={emp.record} /></td>
                    <td className="px-4 py-3"><FileLink url={emp.record?.comprobante_url ?? null} nombre={emp.record?.comprobante_nombre ?? null} label="Ver" onView={(url, name) => setViewer({ url, name })} /></td>
                    <td className="px-4 py-3"><FileLink url={emp.record?.factura_url ?? null} nombre={emp.record?.factura_nombre ?? null} label="Ver" onView={(url, name) => setViewer({ url, name })} /></td>
                    <td className="px-4 py-3 text-xs text-[var(--text-muted)]">{emp.record ? fmtFecha(emp.record.fecha_carga) : '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {emp.record && (
                        <button onClick={() => setDeleteId(emp.record!.id)}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                          <IconTrash size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden space-y-2">
            {data.map(emp => (
              <div key={emp.id} className="bg-white rounded-xl border border-[var(--border)] p-3">
                <div className="flex items-center gap-2 mb-2">
                  {fotosMap[emp.id]
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={fotosMap[emp.id]!} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0 shadow-sm" />
                    : <div className="w-7 h-7 rounded-full bg-[image:var(--gradient)] flex items-center justify-center flex-shrink-0 shadow-sm">
                        <span className="text-[9px] font-bold text-white">{emp.nombre.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}</span>
                      </div>
                  }
                  <span className="text-sm font-medium text-[var(--text)] flex-1">{emp.nombre}</span>
                  <EstadoBadge record={emp.record} />
                  {emp.record && (
                    <button onClick={() => setDeleteId(emp.record!.id)} className="p-1 text-gray-300 hover:text-red-500">
                      <IconTrash size={14} />
                    </button>
                  )}
                </div>
                {emp.record && (
                  <div className="flex flex-wrap gap-3 text-xs mt-1">
                    <FileLink url={emp.record.comprobante_url} nombre={emp.record.comprobante_nombre} label="Comprobante" onView={(url, name) => setViewer({ url, name })} />
                    <FileLink url={emp.record.factura_url} nombre={emp.record.factura_nombre} label="Factura" onView={(url, name) => setViewer({ url, name })} />
                    <span className="text-[var(--text-muted)] ml-auto">{fmtFecha(emp.record.fecha_carga)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Confirm delete */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Eliminar registro"
        footer={
          <>
            <button onClick={() => setDeleteId(null)} className="flex-1 h-10 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--text-muted)]">Cancelar</button>
            <button onClick={() => deleteId && handleDelete(deleteId)} className="flex-1 h-10 rounded-xl bg-red-500 text-white text-sm font-medium">Eliminar</button>
          </>
        }>
        <p className="text-sm text-[var(--text-sub)]">¿Eliminás el monotributo presentado? La empleada deberá volver a cargarlo.</p>
      </Modal>

      {viewer && <FileViewer url={viewer.url} name={viewer.name} onClose={() => setViewer(null)} />}
    </div>
  )
}

// ─── Admin: Configuración ─────────────────────────────────────────────────────
function AdminConfig() {
  const [empleados, setEmpleados] = useState<EmpConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [toast, setToast] = useState({ visible: false, msg: '', type: 'success' as 'success' | 'error' })
  const [fotosMap, setFotosMap] = useState<Record<string, string | null>>({})

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ visible: true, msg, type })
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 3000)
  }

  useEffect(() => {
    fetch('/api/monotributo/config').then(r => r.json()).then(d => {
      const data: EmpConfig[] = Array.isArray(d) ? d : []
      setEmpleados(data)
      setLoading(false)
      if (data.length) {
        const ids = data.map(e => e.id).join(',')
        fetch(`/api/usuarios/fotos?ids=${ids}`).then(r => r.json()).then(setFotosMap).catch(() => {})
      }
    })
  }, [])

  async function toggle(id: string, habilitado: boolean) {
    setSaving(id)
    setEmpleados(prev => prev.map(e => e.id === id ? { ...e, monotributo_habilitado: habilitado } : e))
    const res = await fetch('/api/monotributo/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario_id: id, habilitado }),
    })
    setSaving(null)
    if (!res.ok) {
      setEmpleados(prev => prev.map(e => e.id === id ? { ...e, monotributo_habilitado: !habilitado } : e))
      showToast('Error al guardar', 'error')
    }
  }

  const habilitadas = empleados.filter(e => e.monotributo_habilitado).length

  return (
    <div className="space-y-4">
      <Toast visible={toast.visible} message={toast.msg} type={toast.type} onClose={() => setToast(t => ({ ...t, visible: false }))} />

      {habilitadas > 0 && (
        <p className="text-sm text-[var(--text-muted)]">
          <span className="font-semibold text-[var(--text)]">{habilitadas}</span> empleada{habilitadas !== 1 ? 's' : ''} con Monotributo habilitado
        </p>
      )}

      {loading ? <Spinner /> : (
        <div className="bg-white rounded-2xl border border-[var(--border)] overflow-hidden">
          {empleados.map((emp, i) => (
            <div key={emp.id} className={`flex items-center gap-3 px-4 py-3.5 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
              {fotosMap[emp.id]
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={fotosMap[emp.id]!} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0 shadow-sm" />
                : <div className="w-8 h-8 rounded-full bg-[image:var(--gradient)] flex items-center justify-center flex-shrink-0 shadow-sm">
                    <span className="text-[10px] font-bold text-white">{emp.nombre.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</span>
                  </div>
              }
              <span className="text-sm text-[var(--text)] flex-1">{emp.nombre}</span>
              {saving === emp.id && <div className="w-4 h-4 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />}
              <button
                onClick={() => toggle(emp.id, !emp.monotributo_habilitado)}
                disabled={saving === emp.id}
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
                  emp.monotributo_habilitado ? 'bg-[var(--primary)]' : 'bg-gray-200'
                }`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                  emp.monotributo_habilitado ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Employee view ────────────────────────────────────────────────────────────
function EmployeeView({ userId }: { userId: string }) {
  const mes = currentMes()
  const [records, setRecords] = useState<MonotributoRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [comprobante, setComprobante] = useState<File | null>(null)
  const [factura, setFactura] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState({ visible: false, msg: '', type: 'success' as 'success' | 'error' })
  const [viewer, setViewer] = useState<{ url: string; name: string | null } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ visible: true, msg, type })
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 4000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/monotributo')
    const json = await res.json()
    setRecords(Array.isArray(json) ? json : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function uploadFile(file: File, tipo: string): Promise<{ url: string; nombre: string } | null> {
    const toUpload = await compressImage(file)
    const fd = new FormData()
    fd.append('file', toUpload)
    fd.append('tipo', tipo)
    fd.append('mes', mes)
    const res = await fetch('/api/monotributo/upload', { method: 'POST', body: fd })
    if (!res.ok) { const j = await res.json(); showToast(j.error ?? 'Error al subir archivo', 'error'); return null }
    return res.json()
  }

  async function submit() {
    if (!comprobante) return
    setSubmitting(true)
    try {
      const comp = await uploadFile(comprobante, 'comprobante')
      if (!comp) { setSubmitting(false); return }

      let fact: { url: string; nombre: string } | null = null
      if (factura) { fact = await uploadFile(factura, 'factura'); if (!fact) { setSubmitting(false); return } }

      const res = await fetch('/api/monotributo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mes,
          comprobante_url: comp.url,
          comprobante_nombre: comp.nombre,
          factura_url: fact?.url ?? null,
          factura_nombre: fact?.nombre ?? null,
        }),
      })
      const json = await res.json()
      if (json.error) { showToast(json.error, 'error') }
      else { showToast('Monotributo presentado'); setShowModal(false); setComprobante(null); setFactura(null); load() }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <Spinner />

  const currentRecord = records.find(r => r.mes === mes) ?? null
  const history = records.filter(r => r.mes !== mes)

  return (
    <div className="space-y-4 max-w-lg mx-auto">
      <Toast visible={toast.visible} message={toast.msg} type={toast.type} onClose={() => setToast(t => ({ ...t, visible: false }))} />

      {/* Mes actual */}
      <div className={`rounded-2xl border p-5 ${currentRecord ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-[var(--border)]'}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-[var(--text-muted)] mb-0.5">Mes en curso</p>
            <p className="text-lg font-bold text-[var(--text)]">{mesLabel(mes)}</p>
          </div>
          <EstadoBadge record={currentRecord} />
        </div>

        {currentRecord ? (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <IconCheck size={14} className="text-emerald-600" />
              <span className="text-[var(--text-muted)]">Presentado el {fmtFecha(currentRecord.fecha_carga)}</span>
            </div>
            <div className="flex flex-wrap gap-3 mt-3">
              <FileLink url={currentRecord.comprobante_url} nombre={currentRecord.comprobante_nombre} label="Comprobante" onView={(url, name) => setViewer({ url, name })} />
              {currentRecord.factura_url && <FileLink url={currentRecord.factura_url} nombre={currentRecord.factura_nombre} label="Factura" onView={(url, name) => setViewer({ url, name })} />}
            </div>
            <button onClick={() => setShowModal(true)} className="mt-3 text-xs text-[var(--primary)] hover:underline">
              Reemplazar archivos
            </button>
          </div>
        ) : (
          <button onClick={() => setShowModal(true)}
            className="mt-4 w-full h-11 rounded-xl bg-[image:var(--gradient)] text-white text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
            <IconUpload size={16} /> Presentar Monotributo
          </button>
        )}
      </div>

      {/* Historial */}
      {history.length > 0 && (
        <div className="bg-white rounded-2xl border border-[var(--border)] overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Historial</span>
          </div>
          {history.map((rec, i) => (
            <div key={rec.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
              <div className="flex-1">
                <p className="text-sm font-medium text-[var(--text)]">{mesLabel(rec.mes)}</p>
                <p className="text-[11px] text-[var(--text-muted)]">{fmtFecha(rec.fecha_carga)}</p>
              </div>
              <div className="flex gap-3">
                <FileLink url={rec.comprobante_url} nombre={null} label="Comprobante" onView={(url, name) => setViewer({ url, name })} />
                {rec.factura_url && <FileLink url={rec.factura_url} nombre={null} label="Factura" onView={(url, name) => setViewer({ url, name })} />}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal presentar */}
      <Modal
        open={showModal}
        onClose={() => { setShowModal(false); setComprobante(null); setFactura(null) }}
        title={`Monotributo — ${mesLabel(mes)}`}
        footer={
          <>
            <button onClick={() => { setShowModal(false); setComprobante(null); setFactura(null) }}
              className="flex-1 h-10 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--text-muted)]">
              Cancelar
            </button>
            <button onClick={submit} disabled={!comprobante || submitting}
              className="flex-1 h-10 rounded-xl bg-[image:var(--gradient)] text-white text-sm font-semibold disabled:opacity-40 transition-opacity">
              {submitting ? 'Subiendo…' : 'Presentar'}
            </button>
          </>
        }>
        <div className="space-y-4">
          <FileInput label="Comprobante de pago" required onChange={setComprobante} />
          <FileInput label="Factura" onChange={setFactura} />
          {submitting && (
            <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <div className="w-4 h-4 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
              Subiendo archivos…
            </div>
          )}
        </div>
      </Modal>

      {viewer && <FileViewer url={viewer.url} name={viewer.name} onClose={() => setViewer(null)} />}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function MonotributoClient({ user, isAdmin, habilitado }: {
  user: SessionUser; isAdmin: boolean; habilitado: boolean
}) {
  const [tab, setTab] = useState<'resumen' | 'config'>('resumen')

  if (!isAdmin && !habilitado) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <IconReceipt size={24} className="text-gray-400" />
        </div>
        <p className="text-base font-semibold text-[var(--text)] mb-1">Módulo no habilitado</p>
        <p className="text-sm text-[var(--text-muted)]">Tu administrador aún no activó el módulo de Monotributo para tu usuario.</p>
      </div>
    )
  }

  return (
    <div className="py-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-[image:var(--gradient)] flex items-center justify-center flex-shrink-0 shadow-sm">
          <IconReceipt size={18} className="text-white" />
        </div>
        <h1 className="text-[17px] font-bold text-[var(--text)]">Monotributo</h1>
      </div>

      {isAdmin ? (
        <>
          {/* Admin tabs */}
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-5 w-fit">
            {([['resumen', IconUsers, 'Resumen'], ['config', IconSettings, 'Configuración']] as const).map(([key, Icon, label]) => (
              <button key={key} onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tab === key ? 'bg-white text-[var(--primary)] shadow-sm' : 'text-gray-500 hover:text-[var(--text)]'}`}>
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>
          {tab === 'resumen' ? <AdminResumen /> : <AdminConfig />}
        </>
      ) : (
        <EmployeeView userId={user.id} />
      )}
    </div>
  )
}
