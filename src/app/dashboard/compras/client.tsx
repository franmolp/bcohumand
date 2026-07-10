'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { SessionUser, Compra, Proveedor } from '@/types'
import { Modal, Button, Input, Confirm, Spinner } from '@/components/ui'
import { IconShoppingBag, IconEdit, IconTrash, IconPlus, IconAlertCircle } from '@/components/ui/Icons'
import { compressImage } from '@/lib/compress-image'
import FileViewer from '@/components/FileViewer'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const ESTADOS: { value: string; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'pendiente', label: 'Pendiente de pago' },
]

function fmtFecha(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function fmtMonto(n: number) {
  return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatMontoInput(value: string): string {
  let v = value
  // Aceptar . como separador decimal (teclado inglés/iOS en inglés)
  // Si no hay coma y hay un punto al final o seguido de 1-2 dígitos al final,
  // convertirlo a coma
  if (!v.includes(',') && /\.\d{0,2}$/.test(v)) {
    const lastDot = v.lastIndexOf('.')
    v = v.slice(0, lastDot) + ',' + v.slice(lastDot + 1)
  }
  // Quitar todos los puntos restantes (eran separadores de miles que el usuario no debe ingresar)
  v = v.replace(/\./g, '')
  const clean = v.replace(/[^0-9,]/g, '')
  const commaIdx = clean.indexOf(',')
  let intPart = commaIdx >= 0 ? clean.slice(0, commaIdx) : clean
  const decPart = commaIdx >= 0 ? clean.slice(commaIdx + 1, commaIdx + 3) : undefined
  intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return decPart !== undefined ? `${intPart},${decPart}` : intPart
}

function numToMontoStr(n: number): string {
  const rounded = Math.round(n * 100)
  const cents = rounded % 100
  const intPart = Math.floor(rounded / 100)
  const intStr = String(intPart).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return cents > 0 ? `${intStr},${String(cents).padStart(2, '0')}` : intStr
}
function estadoBadge(e: string) {
  if (e === 'efectivo') return <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-green-50 text-green-700 border border-green-100">Efectivo</span>
  if (e === 'transferencia') return <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-blue-50 text-blue-700 border border-blue-100">Transferencia</span>
  return <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-amber-50 text-amber-700 border border-amber-100">Pendiente</span>
}

// ─── Formulario modal ────────────────────────────────────────────────────────

interface FormState {
  fecha: string
  proveedor_id: string
  proveedor_nombre_nuevo: string
  monto: string
  numero_factura: string
  detalle: string
  estado_pago: string
  agregar_proveedor: boolean
}

const FORM_EMPTY: FormState = {
  fecha: new Date().toISOString().slice(0, 10),
  proveedor_id: '',
  proveedor_nombre_nuevo: '',
  monto: '',
  numero_factura: '',
  detalle: '',
  estado_pago: 'efectivo',
  agregar_proveedor: false,
}

function compraToForm(c: Compra): FormState {
  return {
    fecha: c.fecha,
    proveedor_id: c.proveedor_id ? String(c.proveedor_id) : '',
    proveedor_nombre_nuevo: '',
    monto: numToMontoStr(c.monto),
    numero_factura: c.numero_factura ?? '',
    detalle: c.detalle ?? '',
    estado_pago: c.estado_pago,
    agregar_proveedor: false,
  }
}

interface CompraModalProps {
  open: boolean
  editTarget: Compra | null
  proveedores: Proveedor[]
  onClose: () => void
  onSaved: (c: Compra) => void
  onProveedorCreated: (p: Proveedor) => void
}

function CompraModal({ open, editTarget, proveedores, onClose, onSaved, onProveedorCreated }: CompraModalProps) {
  const [form, setForm] = useState<FormState>(FORM_EMPTY)
  const [fotoFile, setFotoFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [viewerUrl, setViewerUrl] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setForm(editTarget ? compraToForm(editTarget) : { ...FORM_EMPTY, fecha: new Date().toISOString().slice(0, 10) })
      setFotoFile(null)
      setError('')
    }
  }, [open, editTarget])

  const set = (k: keyof FormState, v: string | boolean) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    let finalProveedorId: number | null = null
    let finalProveedorNombre: string | null = null

    if (form.agregar_proveedor) {
      if (!form.proveedor_nombre_nuevo.trim()) { setError('Ingresá el nombre del proveedor'); return }
      setSaving(true)
      const res = await fetch('/api/proveedores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: form.proveedor_nombre_nuevo }) })
      const pData = await res.json()
      if (!res.ok) { setError(pData.error || 'Error al crear proveedor'); setSaving(false); return }
      onProveedorCreated(pData)
      finalProveedorId = pData.id
      finalProveedorNombre = pData.nombre
      setSaving(false)
    } else {
      if (!form.proveedor_id) { setError('Seleccioná un proveedor'); return }
      finalProveedorId = Number(form.proveedor_id)
      finalProveedorNombre = proveedores.find(p => p.id === finalProveedorId)?.nombre ?? null
    }

    const parseMonto = (v: string) => Number(v.replace(/\./g, '').replace(',', '.'))
    if (!form.monto || parseMonto(form.monto) <= 0) { setError('Ingresá un monto válido'); return }
    if (!form.detalle.trim()) { setError('El detalle es obligatorio'); return }

    setSaving(true)

    // Upload foto to Drive if a new file was selected
    let fotoUrl: string | null = editTarget?.foto_url ?? null
    if (fotoFile) {
      const toUpload = await compressImage(fotoFile)
      const fd = new FormData()
      fd.append('file', toUpload)
      const ur = await fetch('/api/compras/upload', { method: 'POST', body: fd })
      const ud = await ur.json()
      if (!ur.ok) { setError(ud.error || 'Error al subir la factura'); setSaving(false); return }
      fotoUrl = ud.url
    }

    const body = {
      fecha: form.fecha,
      proveedor_id: finalProveedorId,
      proveedor_nombre: finalProveedorNombre,
      monto: parseMonto(form.monto),
      numero_factura: form.numero_factura || null,
      detalle: form.detalle || null,
      estado_pago: form.estado_pago,
      foto_url: fotoUrl,
    }

    const url = editTarget ? `/api/compras/${editTarget.id}` : '/api/compras'
    const method = editTarget ? 'PUT' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error || 'Error al guardar'); return }
    onSaved(data)
    onClose()
  }

  return (
    <>
    <Modal open={open} onClose={onClose} title={editTarget ? 'Editar Compra' : '+ Nueva Compra'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[13px] font-medium text-[var(--text)] mb-1">Fecha <span className="text-red-500">*</span></label>
          <input type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} required
            style={{ fontSize: 16, WebkitAppearance: 'none' }}
            className="w-full min-w-0 rounded-xl border border-[var(--border)] px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"/>
        </div>

        <div>
          <label className="block text-[13px] font-medium text-[var(--text)] mb-1">Proveedor <span className="text-red-500">*</span></label>
          {!form.agregar_proveedor ? (
            <div className="flex gap-2">
              <select
                value={form.proveedor_id}
                onChange={e => set('proveedor_id', e.target.value)}
                className="flex-1 rounded-xl border border-[var(--border)] px-3 py-2.5 text-[15px] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
              >
                <option value="">Seleccionar...</option>
                {proveedores.sort((a,b) => a.nombre.localeCompare(b.nombre, 'es')).map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
              <button type="button" onClick={() => set('agregar_proveedor', true)} className="px-3 py-2 rounded-xl border border-[var(--border)] text-[var(--primary)] text-[13px] font-medium hover:bg-gray-50 whitespace-nowrap">
                + Nuevo
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                value={form.proveedor_nombre_nuevo}
                onChange={e => set('proveedor_nombre_nuevo', e.target.value)}
                placeholder="Nombre del proveedor"
                className="flex-1"
              />
              <button type="button" onClick={() => set('agregar_proveedor', false)} className="px-3 py-2 rounded-xl border border-[var(--border)] text-gray-500 text-[13px] hover:bg-gray-50">
                Cancelar
              </button>
            </div>
          )}
        </div>

        <Input
          label="Monto *"
          type="text"
          inputMode="decimal"
          value={form.monto}
          onChange={e => set('monto', formatMontoInput(e.target.value))}
          placeholder="0"
          required
        />

        <div>
          <label className="block text-[13px] font-medium text-[var(--text)] mb-1">Detalle/Comentario <span className="text-red-500">*</span></label>
          <textarea
            value={form.detalle}
            onChange={e => set('detalle', e.target.value)}
            placeholder="Ej: Compra de insumos para el mes..."
            rows={3}
            required
            className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-[15px] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
          />
        </div>

        <Input
          label="N° de Factura (opcional)"
          value={form.numero_factura}
          onChange={e => set('numero_factura', e.target.value)}
          placeholder="A-0001-00000000"
        />

        <div>
          <label className="block text-[13px] font-medium text-[var(--text)] mb-1">Estado de pago <span className="text-red-500">*</span></label>
          <select
            value={form.estado_pago}
            onChange={e => set('estado_pago', e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-[15px] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
          >
            {ESTADOS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-[13px] font-medium text-[var(--text)] mb-1">Foto de Factura (opcional)</label>
          {editTarget?.foto_url && !fotoFile && (
            <div className="mb-2 flex items-center gap-2">
              <button type="button" onClick={() => editTarget?.foto_url && setViewerUrl(editTarget.foto_url)}
                className="text-[12px] text-[var(--primary)] hover:underline">Ver factura actual</button>
              <span className="text-[11px] text-gray-400">· subí otra para reemplazarla</span>
            </div>
          )}
          <label className="flex items-center gap-2 h-10 px-3 border border-dashed border-[var(--border)] rounded-xl cursor-pointer hover:border-[var(--primary)] hover:bg-[var(--primary-light)]/30 transition-colors">
            <input type="file" accept="image/*,.pdf" className="hidden"
              onChange={e => setFotoFile(e.target.files?.[0] ?? null)} />
            {fotoFile
              ? <span className="text-[13px] text-[var(--primary)] truncate">{fotoFile.name}</span>
              : <span className="text-[13px] text-gray-400">Seleccionar imagen o PDF…</span>}
          </label>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
            <IconAlertCircle size={15} className="text-red-500 shrink-0"/>
            <p className="text-[13px] text-red-600">{error}</p>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <Button type="submit" loading={saving} className="flex-1">Guardar</Button>
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        </div>
      </form>
    </Modal>
    {viewerUrl && <FileViewer url={viewerUrl} name="Factura" onClose={() => setViewerUrl(null)} />}
    </>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ComprasClient({ user }: { user: SessionUser }) {
  const isAdmin = user.rol === 'Admin' || user.rol === 'admin' || user.rol === 'HR'
  const now = new Date()
  const [mes, setMes] = useState(now.getMonth())
  const [anio, setAnio] = useState(now.getFullYear())
  const [compras, setCompras] = useState<Compra[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [search, setSearch] = useState('')
  const [allCompras, setAllCompras] = useState<Compra[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Compra | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Compra | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [viewer, setViewer] = useState<string | null>(null)

  const isSearching = search.trim().length > 0

  const mesStr = `${anio}-${String(mes + 1).padStart(2, '0')}`

  const fetchCompras = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/compras?mes=${mesStr}`)
    if (res.ok) {
      const d = await res.json()
      setCompras(d.compras)
      setTotal(d.total)
    }
    setLoading(false)
  }, [mesStr])

  const fetchAllCompras = useCallback(async () => {
    const res = await fetch('/api/compras')
    if (res.ok) {
      const d = await res.json()
      setAllCompras(d.compras || [])
    }
  }, [])

  useEffect(() => { fetchCompras() }, [fetchCompras])

  useEffect(() => {
    if (isSearching) fetchAllCompras()
  }, [isSearching, fetchAllCompras])

  const displayed = useMemo(() => {
    if (!isSearching) return compras
    const q = search.trim().toLowerCase()
    return allCompras.filter(c => {
      const prov = ((c.proveedor as { nombre: string } | null)?.nombre ?? c.proveedor_nombre ?? '').toLowerCase()
      const det = (c.detalle ?? '').toLowerCase()
      const monto = String(Math.round(c.monto))
      return prov.includes(q) || det.includes(q) || monto.includes(q)
    })
  }, [search, isSearching, compras, allCompras])

  useEffect(() => {
    fetch('/api/proveedores').then(r => r.json()).then(d => { if (Array.isArray(d)) setProveedores(d) })
  }, [])

  function openNew() { setEditTarget(null); setModalOpen(true) }
  function openEdit(c: Compra) { setEditTarget(c); setModalOpen(true) }

  function handleSaved(c: Compra) {
    setCompras(prev => {
      const idx = prev.findIndex(x => x.id === c.id)
      if (idx >= 0) { const n = [...prev]; n[idx] = c; return n }
      return [c, ...prev]
    })
    if (isAdmin) fetchCompras()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    await fetch(`/api/compras/${deleteTarget.id}`, { method: 'DELETE' })
    setCompras(prev => prev.filter(c => c.id !== deleteTarget.id))
    if (isAdmin) setTotal(prev => prev !== null ? prev - Number(deleteTarget.monto) : null)
    setDeleteTarget(null)
    setDeleting(false)
  }

  const anios = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i)

  return (
    <div className="py-4 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[image:var(--gradient)] flex items-center justify-center flex-shrink-0 shadow-sm">
            <IconShoppingBag size={18} className="text-white" />
          </div>
          <h1 className="text-[17px] font-bold text-[var(--text)]">Compras</h1>
        </div>
        <Button onClick={openNew} size="sm">
          <IconPlus size={15} className="mr-1" /> Nueva Compra
        </Button>
      </div>

      {/* Búsqueda + Filtros */}
      <div className="bg-white rounded-2xl border border-[var(--border)] shadow-sm p-4 mb-4 space-y-3">
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por proveedor, detalle o monto…"
          className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
        />
        {!isSearching && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[13px] text-[var(--text-muted)] font-medium">Filtrar por mes:</span>
            <select
              value={mes}
              onChange={e => setMes(Number(e.target.value))}
              className="rounded-xl border border-[var(--border)] px-3 py-2 text-[14px] bg-white"
            >
              {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select
              value={anio}
              onChange={e => setAnio(Number(e.target.value))}
              className="rounded-xl border border-[var(--border)] px-3 py-2 text-[14px] bg-white"
            >
              {anios.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Total — solo admin */}
      {isAdmin && (isSearching ? displayed.length > 0 : total !== null) && (
        <div className="rounded-2xl p-5 mb-4" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
          <p className="text-white/70 text-[12px] font-medium mb-1">{isSearching ? 'Total encontrado' : 'Total del mes'}</p>
          <p className="text-white text-[28px] font-bold leading-none">{fmtMonto(isSearching ? displayed.reduce((s, c) => s + Number(c.monto), 0) : total!)}</p>
          <p className="text-white/60 text-[12px] mt-1">{displayed.length} compra{displayed.length !== 1 ? 's' : ''} registrada{displayed.length !== 1 ? 's' : ''}</p>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden">
        {loading && !isSearching ? (
          <div className="py-16"><Spinner /></div>
        ) : displayed.length === 0 ? (
          <div className="py-16 text-center text-[var(--text-muted)] text-sm">
            {isSearching ? `Sin resultados para "${search}"` : `Sin compras en ${MESES[mes]} ${anio}`}
          </div>
        ) : (
          <>
            <p className="px-4 pt-3 pb-2 text-[12px] text-[var(--text-muted)]">Mostrando {displayed.length} compra{displayed.length !== 1 ? 's' : ''}{isSearching ? ` · todos los tiempos` : ''}</p>

            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-t border-[var(--border)] bg-gray-50">
                    <th className="px-4 py-3 text-left font-semibold text-[var(--text-muted)]">Fecha</th>
                    <th className="px-4 py-3 text-left font-semibold text-[var(--text-muted)]">Proveedor</th>
                    <th className="px-4 py-3 text-left font-semibold text-[var(--text-muted)]">Detalle</th>
                    <th className="px-4 py-3 text-right font-semibold text-[var(--text-muted)]">Monto</th>
                    <th className="px-4 py-3 text-left font-semibold text-[var(--text-muted)]">Estado</th>
                    <th className="px-4 py-3 text-center font-semibold text-[var(--text-muted)]">Factura</th>
                    {isAdmin && <th className="px-4 py-3 text-left font-semibold text-[var(--text-muted)]">Usuario</th>}
                    {isAdmin && <th className="px-4 py-3 text-right font-semibold text-[var(--text-muted)]">Acciones</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {displayed.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-[var(--text-muted)]">{fmtFecha(c.fecha)}</td>
                      <td className="px-4 py-3 font-medium text-[var(--text)]">{(c.proveedor as {nombre:string}|null)?.nombre ?? c.proveedor_nombre ?? '—'}</td>
                      <td className="px-4 py-3 text-[var(--text-muted)] max-w-[200px]">
                        <span className="truncate block" title={c.detalle ?? ''}>{c.detalle ? (c.detalle.length > 40 ? c.detalle.slice(0, 40) + '…' : c.detalle) : '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-green-600">{fmtMonto(c.monto)}</td>
                      <td className="px-4 py-3">{estadoBadge(c.estado_pago)}</td>
                      <td className="px-4 py-3 text-center">
                        {c.foto_url
                          ? <button onClick={() => setViewer(c.foto_url!)} className="text-[var(--primary)] hover:underline text-[12px]">Ver</button>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      {isAdmin && <td className="px-4 py-3 text-[var(--text-muted)]">{(c.cargado_por as {nombre:string}|null)?.nombre ?? c.usuario_email ?? '—'}</td>}
                      {isAdmin && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg text-[var(--primary)] hover:bg-indigo-50 transition-colors"><IconEdit size={15}/></button>
                            <button onClick={() => setDeleteTarget(c)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 transition-colors"><IconTrash size={15}/></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="lg:hidden divide-y divide-[var(--border)]">
              {displayed.map(c => (
                <div key={c.id} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[14px] text-[var(--text)]">{(c.proveedor as {nombre:string}|null)?.nombre ?? c.proveedor_nombre ?? '—'}</p>
                      <p className="text-[12px] text-[var(--text-muted)]">{fmtFecha(c.fecha)}{isAdmin && (c.cargado_por as {nombre:string}|null)?.nombre ? ` · ${(c.cargado_por as {nombre:string}).nombre}` : ''}</p>
                    </div>
                    <p className="text-[15px] font-bold text-green-600 ml-3">{fmtMonto(c.monto)}</p>
                  </div>
                  {c.detalle && <p className="text-[13px] text-[var(--text-muted)] mb-2 line-clamp-2">{c.detalle}</p>}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {estadoBadge(c.estado_pago)}
                      {c.foto_url && <button onClick={() => setViewer(c.foto_url!)} className="text-[11px] text-[var(--primary)]">Ver factura</button>}
                    </div>
                    {isAdmin && (
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg text-[var(--primary)] hover:bg-indigo-50"><IconEdit size={15}/></button>
                        <button onClick={() => setDeleteTarget(c)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50"><IconTrash size={15}/></button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modal compra */}
      <CompraModal
        open={modalOpen}
        editTarget={editTarget}
        proveedores={proveedores}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
        onProveedorCreated={p => setProveedores(prev => [...prev, p])}
      />

      {/* Confirm eliminar */}
      <Confirm
        open={!!deleteTarget}
        title="Eliminar compra"
        message={`¿Eliminás la compra de ${deleteTarget?.proveedor?.nombre ?? deleteTarget?.proveedor_nombre ?? ''} por ${deleteTarget ? fmtMonto(deleteTarget.monto) : ''}?`}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
        loading={deleting}
        danger
      />
      {viewer && <FileViewer url={viewer} name="Factura" onClose={() => setViewer(null)} />}
    </div>
  )
}
