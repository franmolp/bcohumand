'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { RecibosTab, EmployeeRecibosView, normalizarNombre } from './recibos'
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

// ─── Liquidaciones tab (unified) ──────────────────────────────────────────────

function LiquidacionesTab() {
  const now = new Date()
  const [anio, setAnio] = useState(now.getFullYear())
  const [mes,  setMes]  = useState(now.getMonth() + 1)
  const [recibos, setRecibos] = useState<ReciboDB[]>([])
  const [pagos,   setPagos]   = useState<PagoRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [viewer, setViewer]   = useState<{ url: string; name: string } | null>(null)
  const [preview, setPreview] = useState<ParsedPago[] | null>(null)
  const [parseErr, setParseErr] = useState<string | null>(null)
  const [saving, setSaving]   = useState(false)
  const [editTarget, setEditTarget] = useState<PagoRow | null>(null)
  const [editForm, setEditForm]     = useState({ total: '', efectivo: '', transferencia: '' })
  const [editSaving, setEditSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    setLoadErr(null)
    try {
      const [rRes, pRes] = await Promise.all([
        fetch(`/api/liquidador/recibos?anio=${anio}&mes=${mes}`).then(r => r.json()),
        fetch(`/api/liquidador/pagos?anio=${anio}&mes=${mes}`).then(r => r.json()),
      ])
      setRecibos(Array.isArray(rRes) ? rRes : [])
      if (pRes?.error) setLoadErr(pRes.error)
      else setPagos(Array.isArray(pRes) ? pRes : [])
    } catch {
      setLoadErr('Error al cargar datos')
    }
    setLoading(false)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [anio, mes])

  // Build unified list: one entry per employee, merging recibo + pago
  const empleadas = useMemo(() => {
    const map = new Map<string, { nombre: string; recibo: ReciboDB | null; pago: PagoRow | null }>()
    for (const r of recibos) {
      map.set(r.nombre_empleada, { nombre: r.nombre_empleada, recibo: r, pago: null })
    }
    for (const p of pagos) {
      const key = normalizarNombre(p.nombre_excel)
      if (map.has(key)) {
        map.get(key)!.pago = p
      } else {
        // try first-name match as fallback
        const firstName = key.split(' ')[0]
        let matched = false
        for (const [k, entry] of map) {
          if (!entry.pago && k.startsWith(firstName + ' ')) {
            entry.pago = p
            matched = true
            break
          }
        }
        if (!matched) map.set(key, { nombre: p.nombre_excel, recibo: null, pago: p })
      }
    }
    return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [recibos, pagos])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setParseErr(null); setPreview(null)
    try {
      const XLSX = (await import('xlsx')).default ?? await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets['Pagos mes en curso']
      if (!sheet) throw new Error('No se encontró la hoja "Pagos mes en curso" en el archivo')
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { header: ['A','B','C','D','E','F'], range: 1, defval: null })
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

  async function handleEditSave() {
    if (!editTarget) return
    setEditSaving(true)
    const r = await fetch(`/api/liquidador/pagos/${editTarget.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ total: Number(editForm.total), efectivo: Number(editForm.efectivo), transferencia: Number(editForm.transferencia) }),
    })
    if (r.ok) { setEditTarget(null); await load() }
    setEditSaving(false)
  }

  function fmtDate(iso: string) {
    try { return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) }
    catch { return iso }
  }

  return (
    <div className="space-y-4">
      {/* Header: mes + importar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <MonthPicker anio={anio} mes={mes} onChange={(a, m) => { setAnio(a); setMes(m) }} />
        <label className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--primary)] cursor-pointer hover:underline">
          <IconUpload size={13} />
          {pagos.length > 0 ? 'Reimportar Excel' : 'Importar Excel'}
          <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls" className="hidden" onChange={handleFile} />
        </label>
      </div>

      {/* Errors */}
      {(parseErr || loadErr) && (
        <div className="flex items-center gap-2 text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
          <IconX size={13} />{parseErr || loadErr}
        </div>
      )}

      {/* Preview de importación */}
      {preview && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
          <p className="text-[12px] font-semibold text-amber-800">
            Vista previa — {preview.length} empleadas · Confirmar para guardar
          </p>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {preview.map((p, i) => (
              <div key={i} className="flex items-center justify-between text-[12px] py-1 border-b border-amber-100 last:border-0">
                <span className="font-medium text-amber-900">{p.nombre}</span>
                <span className="text-amber-700 tabular-nums">{fmtPeso(p.total)} · Ef {fmtPeso(p.efectivo)} · Tr {fmtPeso(p.transferencia)}</span>
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

      {/* Lista unificada de empleadas */}
      {loading ? <Spinner /> : empleadas.length === 0 && !preview ? (
        <div className="text-center py-10">
          <IconFileText size={30} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-[var(--text-sub)]">Sin datos para {MESES[mes - 1]} {anio}</p>
          <p className="text-[12px] text-gray-400 mt-1">Importá el Excel o sincronizá con Drive</p>
        </div>
      ) : !preview && (
        <div className="bg-white rounded-xl border border-gray-200/60 divide-y divide-gray-100">
          {empleadas.map(({ nombre, recibo, pago }) => (
            <div key={nombre} className="px-4 py-3 hover:bg-gray-50/60 transition-colors">
              <div className="flex items-center gap-3">
                {/* PDF icon */}
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${recibo ? 'bg-indigo-50' : 'bg-gray-100'}`}>
                  <IconFileText size={16} className={recibo ? 'text-[var(--primary)]' : 'text-gray-300'} />
                </div>
                {/* Nombre */}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold truncate">{nombre}</p>
                  {recibo ? (
                    <button
                      onClick={() => setViewer({ url: recibo.storage_url, name: recibo.nombre_archivo })}
                      className="text-[11px] text-[var(--primary)] hover:underline cursor-pointer">
                      Ver recibo · {fmtDate(recibo.subido_el)}
                    </button>
                  ) : (
                    <p className="text-[11px] text-gray-400">Sin recibo</p>
                  )}
                </div>
                {/* Montos */}
                {pago && (
                  <div className="text-right shrink-0">
                    <p className="text-[13px] font-bold tabular-nums text-[var(--text)]">{fmtPeso(pago.total)}</p>
                    <p className="text-[11px] text-gray-400 tabular-nums">
                      Ef {fmtPeso(pago.efectivo)} · Tr {fmtPeso(pago.transferencia)}
                    </p>
                  </div>
                )}
                {/* Edit */}
                {pago && (
                  <button
                    onClick={() => { setEditTarget(pago); setEditForm({ total: String(pago.total), efectivo: String(pago.efectivo), transferencia: String(pago.transferencia) }) }}
                    className="p-1.5 rounded-lg text-[var(--primary)] hover:bg-indigo-50 transition-colors cursor-pointer shrink-0">
                    <IconEdit size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal edición */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title={`Editar · ${editTarget?.nombre_excel}`}>
        <div className="space-y-4">
          <Input label="Total a cobrar" type="number" value={editForm.total}
            onChange={e => setEditForm(f => ({ ...f, total: e.target.value }))} />
          <Input label="Efectivo" type="number" value={editForm.efectivo}
            onChange={e => setEditForm(f => ({ ...f, efectivo: e.target.value }))} />
          <Input label="Transferencia" type="number" value={editForm.transferencia}
            onChange={e => setEditForm(f => ({ ...f, transferencia: e.target.value }))} />
          <div className="flex gap-3 pt-1">
            <Button className="flex-1" loading={editSaving} onClick={handleEditSave}>Guardar</Button>
            <Button variant="secondary" onClick={() => setEditTarget(null)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

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
