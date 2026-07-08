'use client'

import { useState, useEffect, useRef } from 'react'
import { RecibosTab, EmployeeRecibosView } from './recibos'
import { Spinner, Modal, Button, Input } from '@/components/ui'
import { IconDollar, IconFileText, IconEdit, IconUpload, IconCheck, IconX } from '@/components/ui/Icons'
import type { SessionUser } from '@/types'
import { MESES } from '@/lib/liquidador'
import FileViewer from '@/components/FileViewer'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ReciboDB {
  id: string
  anio: number
  mes: number
  nombre_empleada: string
  nombre_archivo: string
  storage_url: string
  subido_el: string
  estado: string
}

interface PagoRow {
  id: number
  nombre_excel: string
  usuario_id: string | null
  total: number
  efectivo: number
  transferencia: number
}

interface ParsedPago {
  nombre: string
  total: number
  efectivo: number
  transferencia: number
}

// ─── Month picker ──────────────────────────────────────────────────────────────

function MonthPicker({ anio, mes, onChange }: {
  anio: number; mes: number
  onChange: (a: number, m: number) => void
}) {
  function prev() { mes === 1 ? onChange(anio - 1, 12) : onChange(anio, mes - 1) }
  function next() { mes === 12 ? onChange(anio + 1, 1) : onChange(anio, mes + 1) }
  const now = new Date()
  const isNextDisabled = anio > now.getFullYear() || (anio === now.getFullYear() && mes >= now.getMonth() + 1)
  return (
    <div className="flex items-center gap-2">
      <button onClick={prev} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 cursor-pointer text-gray-500 text-lg font-light">‹</button>
      <span className="text-sm font-semibold min-w-[120px] text-center">{MESES[mes - 1]} {anio}</span>
      <button onClick={next} disabled={isNextDisabled} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 cursor-pointer text-gray-500 text-lg font-light disabled:opacity-30">›</button>
    </div>
  )
}

// ─── Format peso ───────────────────────────────────────────────────────────────

function fmtPeso(n: number) {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

// ─── Pagos section (admin) ─────────────────────────────────────────────────────

function PagosSection({ anio, mes }: { anio: number; mes: number }) {
  const [pagos, setPagos]         = useState<PagoRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [preview, setPreview]     = useState<ParsedPago[] | null>(null)
  const [parseErr, setParseErr]   = useState<string | null>(null)
  const [saving, setSaving]       = useState(false)
  const [editTarget, setEditTarget] = useState<PagoRow | null>(null)
  const [editForm, setEditForm]   = useState({ total: '', efectivo: '', transferencia: '' })
  const [editSaving, setEditSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    const r = await fetch(`/api/liquidador/pagos?anio=${anio}&mes=${mes}`)
    if (r.ok) setPagos(await r.json())
    setLoading(false)
  }
  useEffect(() => { load() }, [anio, mes])  // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setParseErr(null)
    setPreview(null)
    try {
      const XLSX = (await import('xlsx')).default ?? await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets['Pagos mes en curso']
      if (!sheet) throw new Error('No se encontró la hoja "Pagos mes en curso" en el archivo')
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        header: ['A','B','C','D','E','F'],
        range: 1,
        defval: null,
      })
      const SKIP = new Set(['TOTAL', 'DISPONIBLE', 'FALTA/SOBRA'])
      const parsed: ParsedPago[] = rows
        .filter(r => r.A && !SKIP.has(String(r.A).trim().toUpperCase()))
        .map(r => ({
          nombre: String(r.A).trim(),
          total: Math.round(Number(r.B) || 0),
          efectivo: Math.round(Number(r.C) || 0),
          transferencia: Math.round(Number(r.D) || 0),
        }))
      if (!parsed.length) throw new Error('No se encontraron filas de empleadas en la hoja')
      setPreview(parsed)
    } catch (err) {
      setParseErr(err instanceof Error ? err.message : 'Error al leer el archivo')
    }
    e.target.value = ''
  }

  async function handleSaveImport() {
    if (!preview) return
    setSaving(true)
    const r = await fetch('/api/liquidador/pagos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anio, mes, filas: preview }),
    })
    if (r.ok) { setPreview(null); await load() }
    else {
      const err = await r.json().catch(() => ({}))
      setParseErr(err.error || 'Error al guardar')
    }
    setSaving(false)
  }

  function openEdit(p: PagoRow) {
    setEditTarget(p)
    setEditForm({ total: String(p.total), efectivo: String(p.efectivo), transferencia: String(p.transferencia) })
  }

  async function handleEditSave() {
    if (!editTarget) return
    setEditSaving(true)
    const r = await fetch(`/api/liquidador/pagos/${editTarget.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        total: Number(editForm.total),
        efectivo: Number(editForm.efectivo),
        transferencia: Number(editForm.transferencia),
      }),
    })
    if (r.ok) { setEditTarget(null); await load() }
    setEditSaving(false)
  }

  if (loading) return <div className="py-4"><Spinner /></div>

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] font-semibold text-[var(--text-sub)]">
          Pagos {MESES[mes - 1]} {anio}
          {pagos.length > 0 && <span className="ml-1.5 text-gray-400 font-normal">· {pagos.length} empleadas</span>}
        </p>
        <label className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--primary)] cursor-pointer hover:underline">
          <IconUpload size={13} />
          {pagos.length > 0 ? 'Reimportar Excel' : 'Importar Excel'}
          <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls" className="hidden" onChange={handleFile} />
        </label>
      </div>

      {parseErr && (
        <div className="flex items-center gap-2 text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-3">
          <IconX size={13} />{parseErr}
        </div>
      )}

      {/* Preview antes de guardar */}
      {preview && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 space-y-2">
          <p className="text-[12px] font-semibold text-amber-800">
            Vista previa — {preview.length} empleadas · Confirmar para guardar
          </p>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {preview.map((p, i) => (
              <div key={i} className="flex items-center justify-between text-[12px] py-1 border-b border-amber-100 last:border-0">
                <span className="font-medium text-amber-900">{p.nombre}</span>
                <span className="text-amber-700 text-right tabular-nums">
                  {fmtPeso(p.total)} · Ef {fmtPeso(p.efectivo)} · Tr {fmtPeso(p.transferencia)}
                </span>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" loading={saving} onClick={handleSaveImport} icon={<IconCheck size={13} />}>
              Guardar {preview.length} registros
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setPreview(null)}>Cancelar</Button>
          </div>
        </div>
      )}

      {/* Tabla de pagos guardados */}
      {!preview && pagos.length === 0 ? (
        <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 py-8 text-center">
          <p className="text-[13px] text-[var(--text-sub)]">Sin datos de pago para {MESES[mes - 1]} {anio}</p>
          <p className="text-[11px] text-gray-400 mt-1">Importá el Excel de sueldos para cargar los montos</p>
        </div>
      ) : !preview && (
        <div className="bg-white rounded-xl border border-gray-200/60 overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 px-4 py-2 bg-gray-50 border-b border-gray-100 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
            <span>Empleada</span>
            <span className="text-right">Total</span>
            <span className="text-right">Efectivo</span>
            <span className="text-right">Transf.</span>
            <span />
          </div>
          {pagos.map(p => (
            <div key={p.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 items-center px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
              <span className="text-[13px] font-medium truncate">{p.nombre_excel}</span>
              <span className="text-[13px] tabular-nums text-right font-semibold">{fmtPeso(p.total)}</span>
              <span className="text-[12px] tabular-nums text-right text-gray-500">{p.efectivo > 0 ? fmtPeso(p.efectivo) : '—'}</span>
              <span className="text-[12px] tabular-nums text-right text-gray-500">{p.transferencia > 0 ? fmtPeso(p.transferencia) : '—'}</span>
              <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg text-[var(--primary)] hover:bg-indigo-50 transition-colors cursor-pointer">
                <IconEdit size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal de edición */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title={`Editar · ${editTarget?.nombre_excel}`}>
        <div className="space-y-4">
          <Input
            label="Total a cobrar"
            type="number"
            value={editForm.total}
            onChange={e => setEditForm(f => ({ ...f, total: e.target.value }))}
          />
          <Input
            label="Efectivo"
            type="number"
            value={editForm.efectivo}
            onChange={e => setEditForm(f => ({ ...f, efectivo: e.target.value }))}
          />
          <Input
            label="Transferencia"
            type="number"
            value={editForm.transferencia}
            onChange={e => setEditForm(f => ({ ...f, transferencia: e.target.value }))}
          />
          <div className="flex gap-3 pt-1">
            <Button className="flex-1" loading={editSaving} onClick={handleEditSave}>Guardar</Button>
            <Button variant="secondary" onClick={() => setEditTarget(null)}>Cancelar</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ─── Liquidaciones tab ─────────────────────────────────────────────────────────

function LiquidacionesTab() {
  const now = new Date()
  const [anio, setAnio] = useState(now.getFullYear())
  const [mes,  setMes]  = useState(now.getMonth() + 1)
  const [rows, setRows] = useState<ReciboDB[]>([])
  const [loading, setLoading] = useState(false)
  const [viewer, setViewer] = useState<{ url: string; name: string } | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/liquidador/recibos?anio=${anio}&mes=${mes}`)
      .then(r => r.json())
      .then(d => setRows((Array.isArray(d) ? d : []).sort((a: ReciboDB, b: ReciboDB) =>
        a.nombre_empleada.localeCompare(b.nombre_empleada, 'es')
      )))
      .finally(() => setLoading(false))
  }, [anio, mes])

  function fmtDate(iso: string) {
    try { return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) }
    catch { return iso }
  }

  return (
    <div className="space-y-5">
      <MonthPicker anio={anio} mes={mes} onChange={(a, m) => { setAnio(a); setMes(m) }} />

      {/* Recibos PDF */}
      <div>
        <p className="text-[13px] font-semibold text-[var(--text-sub)] mb-3">
          Recibos firmados
          {!loading && rows.length > 0 && <span className="ml-1.5 text-gray-400 font-normal">· {rows.length}</span>}
        </p>
        {loading ? <Spinner /> : rows.length === 0 ? (
          <div className="text-center py-8">
            <IconFileText size={30} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-[var(--text-sub)]">Sin recibos para {MESES[mes-1]} {anio}</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200/60 divide-y divide-gray-100">
            {rows.map(r => (
              <button key={r.id}
                onClick={() => setViewer({ url: r.storage_url, name: r.nombre_archivo })}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left cursor-pointer">
                <IconFileText size={18} className="text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate">{r.nombre_empleada}</p>
                  <p className="text-[11px] text-[var(--text-sub)] truncate">{r.nombre_archivo}</p>
                </div>
                <span className="text-[11px] text-[var(--text-sub)] shrink-0">{fmtDate(r.subido_el)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Pagos del mes */}
      <PagosSection anio={anio} mes={mes} />

      {viewer && <FileViewer url={viewer.url} name={viewer.name} onClose={() => setViewer(null)} />}
    </div>
  )
}

// ─── Admin view ────────────────────────────────────────────────────────────────

function AdminView() {
  const [tab, setTab] = useState<'liquidaciones' | 'recibos'>('liquidaciones')

  return (
    <div className="py-4 fade-in">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-[image:var(--gradient)] flex items-center justify-center flex-shrink-0 shadow-sm">
          <IconDollar size={18} className="text-white" />
        </div>
        <h1 className="text-[17px] font-bold text-[var(--text)]">Liquidaciones</h1>
      </div>

      <div className="flex bg-gray-100 rounded-xl p-0.5 mb-5">
        {(['liquidaciones', 'recibos'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-[12px] lg:text-[13px] font-medium rounded-[10px] cursor-pointer transition-all capitalize ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
            {t === 'liquidaciones' ? 'Liquidaciones' : 'Firmar recibos'}
          </button>
        ))}
      </div>

      {tab === 'liquidaciones' && <LiquidacionesTab />}
      {tab === 'recibos'       && <RecibosTab onSyncDone={() => setTab('liquidaciones')} />}
    </div>
  )
}

// ─── Vista empleada ────────────────────────────────────────────────────────────

function EmployeeView({ user }: { user: SessionUser }) {
  return (
    <div className="py-4 fade-in">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-[image:var(--gradient)] flex items-center justify-center flex-shrink-0 shadow-sm">
          <IconDollar size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-[17px] font-bold text-[var(--text)]">Mi liquidación</h1>
          <p className="text-xs text-[var(--text-sub)]">{user.nombre}</p>
        </div>
      </div>
      <EmployeeRecibosView user={user} />
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export default function LiquidadorClient({ user }: { user: SessionUser }) {
  const isAdmin = user.rol === 'admin' || user.rol === 'Admin'
  return isAdmin ? <AdminView /> : <EmployeeView user={user} />
}
