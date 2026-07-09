'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
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

// ─── Liquidaciones tab (unified) ──────────────────────────────────────────────

function LiquidacionesTab() {
  const now = new Date()
  const [anio, setAnio] = useState(now.getFullYear())
  const [mes,  setMes]  = useState(now.getMonth() + 1)
  const [recibos, setRecibos] = useState<ReciboDB[]>([])
  const [pagos,   setPagos]   = useState<PagoRow[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [syncing,  setSyncing]  = useState(false)
  const [syncMsg,  setSyncMsg]  = useState<string | null>(null)
  const [viewer,   setViewer]   = useState<{ url: string; name: string } | null>(null)
  const [preview,  setPreview]  = useState<ParsedPago[] | null>(null)
  const [parseErr, setParseErr] = useState<string | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [brutaHistorial, setBrutaHistorial] = useState<{ anio: number; mes: number; nombre: string; bruto: number }[]>([])
  const [editTarget,  setEditTarget]  = useState<{ id?: number; nombre: string } | null>(null)
  const [editForm,    setEditForm]    = useState({ total: '', efectivo: '', transferencia: '' })
  const [editSaving,  setEditSaving]  = useState(false)
  const [urlTarget,    setUrlTarget]   = useState<ReciboDB | null>(null)
  const [createNombre, setCreateNombre] = useState<string | null>(null)
  const [urlInput,     setUrlInput]   = useState('')
  const [urlSaving,    setUrlSaving]  = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function loadData() {
    setDataLoading(true)
    const [recibosRes, pagosRes] = await Promise.all([
      fetch(`/api/liquidador/recibos?anio=${anio}&mes=${mes}`).then(r => r.json()).catch(() => []),
      fetch(`/api/liquidador/pagos?anio=${anio}&mes=${mes}`).then(r => r.json()).catch(() => []),
    ])
    const r = Array.isArray(recibosRes) ? recibosRes : []
    const p = Array.isArray(pagosRes) ? pagosRes : []
    console.log('[liquidador] recibos nombres:', r.map((x: ReciboDB) => JSON.stringify(x.nombre_empleada)))
    console.log('[liquidador] pagos nombres:', p.map((x: PagoRow) => JSON.stringify(x.nombre_excel)))
    setRecibos(r)
    setPagos(p)
    setDataLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData() }, [anio, mes])

  // Lista unificada: pagos como primaria, match por nombre normalizado
  const unified = useMemo(() => {
    const normKey = (s: string) => s.trim().normalize('NFC').replace(/\s+/g, ' ').toLowerCase()
    const reciboByNorm = new Map(recibos.map(r => [normKey(r.nombre_empleada), r]))
    const seen = new Set<string>()
    const items: { nombre: string; recibo: ReciboDB | null; pago: PagoRow | null }[] = []
    for (const p of pagos) {
      const recibo = reciboByNorm.get(normKey(p.nombre_excel)) ?? null
      items.push({ nombre: p.nombre_excel, recibo, pago: p })
      seen.add(normKey(p.nombre_excel))
    }
    for (const r of recibos) {
      if (!seen.has(normKey(r.nombre_empleada))) {
        items.push({ nombre: r.nombre_empleada, recibo: r, pago: null })
      }
    }
    return items.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [recibos, pagos])

  async function handleSync(repair = false) {
    setSyncing(true); setSyncMsg(null)
    try {
      const res  = await fetch('/api/drive/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'liquidaciones', repair }) })
      const data = await res.json()
      if (data.error) { setSyncMsg(data.error); return }
      const parts = [`${data.inserted} importados`, `${data.skipped} ya existían`]
      if (repair && data.repaired != null) parts.unshift(`${data.repaired} rotos eliminados`)
      if (data.urlsFixed) parts.push(`${data.urlsFixed} URLs reparadas`)
      if (data.errors?.length) parts.push(`${data.errors.length} errores (ver consola)`)
      console.log('[sync] resultado:', data)
      setSyncMsg(parts.join(' · '))
      await loadData()
    } catch {
      setSyncMsg('Error al conectar con Drive')
    } finally {
      setSyncing(false)
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setParseErr(null); setPreview(null); setBrutaHistorial([])
    try {
      const XLSX = (await import('xlsx')).default ?? await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })

      // Hoja "Pagos mes en curso" — comportamiento existente
      const sheet = wb.Sheets['Pagos mes en curso']
      if (!sheet) throw new Error('No se encontró la hoja "Pagos mes en curso" en el archivo')
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { header: ['A','B','C','D','E','F'], range: 1, defval: null })
      const SKIP = new Set(['TOTAL', 'DISPONIBLE', 'FALTA/SOBRA'])
      const parsed: ParsedPago[] = rows
        .filter(r => r.A && !SKIP.has(String(r.A).trim().toUpperCase()))
        .map(r => ({ nombre: String(r.A).trim(), total: Math.round(Number(r.B) || 0), efectivo: Math.round(Number(r.C) || 0), transferencia: Math.round(Number(r.D) || 0) }))
      if (!parsed.length) throw new Error('No se encontraron filas de empleadas en la hoja')
      setPreview(parsed)

      // Hoja "Todas" — brutos históricos por empleada
      const sheetTodas = wb.Sheets['Todas']
      if (sheetTodas) {
        const rowsTodas = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheetTodas, { header: 1, defval: null })
        const headers = rowsTodas[0] as (string | null)[]
        const now2 = new Date()
        const curAnio = now2.getFullYear()
        const curMes = now2.getMonth() + 1
        const SKIP_COLS = new Set(['APORTES', 'APORTES MAI', '$ Sueldos', 'Ventas', 'Resto', '% Sueldos/Ventas'])
        const filas: { anio: number; mes: number; nombre: string; bruto: number }[] = []
        for (let i = 1; i < rowsTodas.length; i++) {
          const row = rowsTodas[i] as (string | number | null)[]
          const col0 = row[0]
          if (typeof col0 !== 'number') continue // ignora BONO/AGUIN y vacías
          const d = new Date(Math.round((col0 - 25569) * 86400 * 1000))
          const anio = d.getUTCFullYear()
          const mes = d.getUTCMonth() + 1
          if (anio === curAnio && mes === curMes) continue // mes en curso: no tomar
          for (let j = 1; j < headers.length; j++) {
            const nombre = headers[j]
            if (!nombre || SKIP_COLS.has(nombre)) continue
            const bruto = row[j]
            if (typeof bruto !== 'number' || bruto <= 0) continue
            filas.push({ anio, mes, nombre, bruto })
          }
        }
        setBrutaHistorial(filas)
      }
    } catch (err) {
      setParseErr(err instanceof Error ? err.message : 'Error al leer el archivo')
    }
    e.target.value = ''
  }

  async function handleSaveImport() {
    if (!preview) return
    setSaving(true)
    const r = await fetch('/api/liquidador/pagos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ anio, mes, filas: preview, replace: true }) })
    if (r.ok) {
      // Enviar brutos históricos de la hoja "Todas" en tandas de 500
      if (brutaHistorial.length > 0) {
        const BATCH = 500
        for (let i = 0; i < brutaHistorial.length; i += BATCH) {
          await fetch('/api/liquidador/bruto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filas: brutaHistorial.slice(i, i + BATCH) }),
          }).catch(() => {})
        }
        setBrutaHistorial([])
      }
      setPreview(null)
      await loadData()
    } else {
      const err = await r.json().catch(() => ({}))
      setParseErr(err.error || 'Error al guardar')
    }
    setSaving(false)
  }

  async function handleUrlSave() {
    if (!urlTarget || !urlInput.startsWith('http')) return
    setUrlSaving(true)
    await fetch(`/api/liquidador/recibos/${urlTarget.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storage_url: urlInput.trim() }),
    })
    setUrlTarget(null); setUrlInput('')
    await loadData()
    setUrlSaving(false)
  }

  async function handleUrlCreate() {
    if (!createNombre || !urlInput.startsWith('http')) return
    setUrlSaving(true)
    const nombreArchivo = `${createNombre} Liquidación ${MESES[mes - 1]}.pdf`
    await fetch('/api/liquidador/recibos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anio, mes, nombre_empleada: createNombre, nombre_archivo: nombreArchivo, storage_url: urlInput.trim() }),
    })
    setCreateNombre(null); setUrlInput('')
    await loadData()
    setUrlSaving(false)
  }

  async function handleEditSave() {
    if (!editTarget) return
    setEditSaving(true)
    const payload = { total: Number(editForm.total), efectivo: Number(editForm.efectivo), transferencia: Number(editForm.transferencia) }
    const r = editTarget.id
      ? await fetch(`/api/liquidador/pagos/${editTarget.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      : await fetch('/api/liquidador/pagos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ anio, mes, filas: [{ nombre: editTarget.nombre, ...payload }] }) })
    if (r.ok) { setEditTarget(null); await loadData() }
    setEditSaving(false)
  }

  const brokenCount = useMemo(() => unified.filter(i => i.recibo && !i.recibo.storage_url.startsWith('http')).length, [unified])

  return (
    <div className="space-y-4">
      {/* Header: mes + acciones */}
      <div className="flex items-center gap-3 flex-wrap">
        <MonthPicker anio={anio} mes={mes} onChange={(a, m) => { setAnio(a); setMes(m) }} />
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--primary)] cursor-pointer hover:underline">
            <IconUpload size={13} />
            {pagos.length > 0 ? 'Reimportar Excel' : 'Importar Excel'}
            <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls" className="hidden" onChange={handleFile} />
          </label>
          {brokenCount > 0 && (
            <button onClick={() => handleSync(true)} disabled={syncing}
              className="h-8 px-3 rounded-xl border border-amber-300 bg-amber-50 text-[12px] font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer transition-colors">
              {syncing
                ? <><div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />Reparando…</>
                : `⚠ Reparar ${brokenCount} URL${brokenCount > 1 ? 's' : ''}`}
            </button>
          )}
          <button onClick={() => handleSync()} disabled={syncing}
            className="h-8 px-3 rounded-xl border border-[var(--border)] bg-white text-[12px] font-medium text-[var(--text-sub)] hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer transition-colors">
            {syncing
              ? <><div className="w-3 h-3 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />Sincronizando…</>
              : '↻ Sincronizar con Drive'}
          </button>
        </div>
      </div>

      {syncMsg && (
        <p className={`text-[12px] ${syncMsg.includes('importados') ? 'text-emerald-600' : 'text-red-600'}`}>{syncMsg}</p>
      )}

      {parseErr && (
        <div className="flex items-center gap-2 text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
          <IconX size={13} />{parseErr}
        </div>
      )}

      {/* Preview importación */}
      {preview && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
          <p className="text-[12px] font-semibold text-amber-800">Vista previa — {preview.length} empleadas · Confirmar para guardar</p>
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

      {/* Lista unificada */}
      {dataLoading ? <Spinner /> : unified.length === 0 && !preview ? (
        <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 py-8 text-center">
          <p className="text-[13px] text-[var(--text-sub)]">Sin datos para {MESES[mes - 1]} {anio}</p>
          <p className="text-[11px] text-gray-400 mt-1">Sincronizá con Drive e importá el Excel de pagos</p>
        </div>
      ) : !preview && (
        <div className="space-y-2">
          {unified.map(item => (
            <div key={item.nombre} className="bg-white rounded-xl border border-gray-200/60 px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold">{item.nombre}</p>
                <div className="mt-0.5">
                  {item.recibo && item.recibo.storage_url.startsWith('http') ? (
                    <button onClick={() => setViewer({ url: item.recibo!.storage_url, name: item.recibo!.nombre_archivo })}
                      className="flex items-center gap-1 text-[11px] text-[var(--primary)] hover:underline cursor-pointer">
                      <IconFileText size={12} />Ver recibo
                    </button>
                  ) : item.recibo ? (
                    <button onClick={() => { setUrlTarget(item.recibo!); setUrlInput('') }}
                      className="flex items-center gap-1 text-[11px] text-amber-500 hover:text-amber-700 cursor-pointer">
                      ⚠ Sin URL · pegar link
                    </button>
                  ) : (
                    <button onClick={() => { setCreateNombre(item.nombre); setUrlInput('') }}
                      className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-[var(--primary)] cursor-pointer transition-colors">
                      + Agregar recibo
                    </button>
                  )}
                </div>
              </div>
              {item.pago ? (
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className={`text-[13px] font-bold tabular-nums ${(item.pago.efectivo > 0 || item.pago.transferencia > 0) && item.pago.efectivo + item.pago.transferencia !== item.pago.total ? 'text-red-500' : ''}`}>{fmtPeso(item.pago.total)}</p>
                    <p className="text-[10px] text-gray-500 tabular-nums">
                      {[
                        item.pago.efectivo > 0 ? `Ef ${fmtPeso(item.pago.efectivo)}` : '',
                        item.pago.transferencia > 0 ? `Tr ${fmtPeso(item.pago.transferencia)}` : '',
                      ].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <button
                    onClick={() => { setEditTarget({ id: item.pago!.id, nombre: item.pago!.nombre_excel }); setEditForm({ total: String(item.pago!.total), efectivo: String(item.pago!.efectivo), transferencia: String(item.pago!.transferencia) }) }}
                    className="p-1.5 rounded-lg text-[var(--primary)] hover:bg-indigo-50 transition-colors cursor-pointer">
                    <IconEdit size={13} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setEditTarget({ nombre: item.nombre }); setEditForm({ total: '', efectivo: '', transferencia: '' }) }}
                  className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-[var(--primary)] transition-colors cursor-pointer shrink-0">
                  <IconEdit size={12} />Sin montos
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal URL manual */}
      <Modal open={!!urlTarget} onClose={() => setUrlTarget(null)} title={`Pegar URL Drive · ${urlTarget?.nombre_empleada}`}>
        <div className="space-y-4">
          <p className="text-[12px] text-[var(--text-sub)]">Abrí el archivo en Drive, copiá el link y pegalo acá.</p>
          <Input
            label="URL de Drive"
            placeholder="https://drive.google.com/file/d/..."
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
          />
          {urlInput && !urlInput.startsWith('http') && (
            <p className="text-[11px] text-red-500">La URL debe empezar con https://</p>
          )}
          <div className="flex gap-3 pt-1">
            <Button className="flex-1" loading={urlSaving} onClick={handleUrlSave}
              disabled={!urlInput.startsWith('http')}>
              Guardar URL
            </Button>
            <Button variant="secondary" onClick={() => setUrlTarget(null)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* Modal agregar recibo (sin registro previo) */}
      <Modal open={!!createNombre} onClose={() => setCreateNombre(null)} title={`Agregar recibo · ${createNombre}`}>
        <div className="space-y-4">
          <p className="text-[12px] text-[var(--text-sub)]">Abrí el archivo en Drive, copiá el link y pegalo acá.</p>
          <Input
            label="URL de Drive"
            placeholder="https://drive.google.com/file/d/..."
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
          />
          {urlInput && !urlInput.startsWith('http') && (
            <p className="text-[11px] text-red-500">La URL debe empezar con https://</p>
          )}
          <div className="flex gap-3 pt-1">
            <Button className="flex-1" loading={urlSaving} onClick={handleUrlCreate}
              disabled={!urlInput.startsWith('http')}>
              Guardar URL
            </Button>
            <Button variant="secondary" onClick={() => setCreateNombre(null)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* Modal edición */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title={`${editTarget?.id ? 'Editar' : 'Agregar montos'} · ${editTarget?.nombre}`}>
        <div className="space-y-4">
          <Input label="Total a cobrar" type="number" value={editForm.total} onChange={e => setEditForm(f => ({ ...f, total: e.target.value }))} />
          <Input label="Efectivo" type="number" value={editForm.efectivo} onChange={e => setEditForm(f => ({ ...f, efectivo: e.target.value }))} />
          <Input label="Transferencia" type="number" value={editForm.transferencia} onChange={e => setEditForm(f => ({ ...f, transferencia: e.target.value }))} />
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
      {tab === 'recibos'       && <RecibosTab />}
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
