'use client'

import { useState, useEffect } from 'react'
import { Button, Spinner, Toast } from '@/components/ui'
import { IconPlus, IconFileText, IconCheck, IconAlertCircle, IconX } from '@/components/ui/Icons'
import { MESES } from '@/lib/liquidador'
import type { SessionUser } from '@/types'
import FileViewer from '@/components/FileViewer'

// ─── Types ──────────────────────────────────────────────────────────────────────

interface ReciboProcesado {
  pageIndex: number
  nombreRaw: string
  nombreFormateado: string
  mesStr: string
  anioStr: string
  pdfBytes: Uint8Array
  previewUrl: string
  status: 'pending' | 'uploading' | 'uploaded' | 'error'
  errorMsg?: string
  storageUrl?: string
  nombreArchivo: string
}

interface ReciboDB {
  id: string
  anio: number
  mes: number
  nombre_empleada: string
  nombre_archivo: string
  storage_url: string
  subido_el: string
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function cap(s: string): string {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

// "OJEDA ROCIO AYELEN" → "Rocio O"
function formatearNombrePDF(nombreRaw: string): string {
  const partes = nombreRaw.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return nombreRaw
  if (partes.length === 1) return cap(partes[0])
  return cap(partes[1]) + ' ' + partes[0].charAt(0).toUpperCase()
}

// "Rocio Ojeda" → "Rocio O"
export function normalizarNombre(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return nombre
  if (partes.length === 1) return cap(partes[0])
  return cap(partes[0]) + ' ' + partes[partes.length - 1].charAt(0).toUpperCase()
}

const SIG_KEY = 'humand_firma_empleador'

// pdfjs without CDN worker — runs in main thread, works on iOS Safari
async function getPdfjsLib() {
  const pdfjs = await import('pdfjs-dist')
  // Empty workerSrc disables the worker and runs synchronously in-thread
  ;(pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = ''
  return pdfjs as unknown as {
    getDocument: (opts: object) => { promise: Promise<{
      numPages: number
      getPage: (n: number) => Promise<{
        getTextContent: () => Promise<{ items: { str: string }[] }>
        getViewport: (o: { scale: number }) => { width: number; height: number }
        render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> }
      }>
    }> }
  }
}

// Extract employee names from each page of the PDF (client-side)
async function extractPageNames(file: File): Promise<string[]> {
  try {
    const pdfjs = await getPdfjsLib()
    const bytes = new Uint8Array(await file.arrayBuffer())
    const doc = await pdfjs.getDocument({ data: bytes, useWorkerFetch: false, isEvalSupported: false }).promise
    const names: string[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      const text = content.items.map(it => it.str).join(' ')
      const match =
        text.match(/Nombre\s+y\s+Apellido[\s:]+([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ\s]+?)(?:\s{2,}|CUIL|DNI|Per[ií]|$)/i) ??
        text.match(/Apellido\s+y\s+Nombre[\s:]+([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ\s]+?)(?:\s{2,}|CUIL|DNI|Per[ií]|$)/i)
      names.push(match ? match[1].trim() : '')
    }
    return names
  } catch {
    return []
  }
}

// Render page 1 of a single-page PDF to a JPEG data URL thumbnail
async function renderThumbnail(pdfBytes: Uint8Array): Promise<string> {
  try {
    const pdfjs = await getPdfjsLib()
    const doc  = await pdfjs.getDocument({ data: pdfBytes, useWorkerFetch: false, isEvalSupported: false }).promise
    const page = await doc.getPage(1)
    const vp   = page.getViewport({ scale: 0.65 })
    const canvas = document.createElement('canvas')
    canvas.width = vp.width; canvas.height = vp.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    await page.render({ canvasContext: ctx, viewport: vp }).promise
    return canvas.toDataURL('image/jpeg', 0.75)
  } catch {
    return ''
  }
}

// Remove white pixels from signature image → returns PNG Uint8Array
async function removeWhiteBg(dataUrl: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width; canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const d = ctx.getImageData(0, 0, canvas.width, canvas.height)
      for (let i = 0; i < d.data.length; i += 4) {
        if (d.data[i] > 210 && d.data[i+1] > 210 && d.data[i+2] > 210) d.data[i+3] = 0
      }
      ctx.putImageData(d, 0, 0)
      canvas.toBlob(b => {
        if (!b) { reject(new Error('canvas')); return }
        b.arrayBuffer().then(buf => resolve(new Uint8Array(buf)))
      }, 'image/png')
    }
    img.onerror = reject
    img.src = dataUrl
  })
}

// Month picker component (inline)
function MonthPicker({ anio, mes, onChange }: { anio: number; mes: number; onChange: (a: number, m: number) => void }) {
  function prev() { mes === 1 ? onChange(anio - 1, 12) : onChange(anio, mes - 1) }
  function next() { mes === 12 ? onChange(anio + 1, 1) : onChange(anio, mes + 1) }
  const now = new Date()
  const isNext = anio > now.getFullYear() || (anio === now.getFullYear() && mes >= now.getMonth() + 1)
  return (
    <div className="flex items-center gap-2">
      <button onClick={prev} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 cursor-pointer text-gray-500 text-lg">‹</button>
      <span className="text-sm font-semibold min-w-[120px] text-center">{MESES[mes - 1]} {anio}</span>
      <button onClick={next} disabled={isNext} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 cursor-pointer text-gray-500 text-lg disabled:opacity-30">›</button>
    </div>
  )
}

// Status badge
function StatusBadge({ status, errorMsg }: { status: ReciboProcesado['status']; errorMsg?: string }) {
  if (status === 'pending')   return <span className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-gray-100 text-gray-500">Pendiente</span>
  if (status === 'uploading') return <span className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-amber-50 text-amber-600 animate-pulse">Subiendo...</span>
  if (status === 'uploaded')  return <span className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 flex items-center gap-1 w-fit"><IconCheck size={11} />Subido</span>
  return <span className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-red-50 text-red-600 flex items-center gap-1 w-fit" title={errorMsg}><IconX size={11} />Error</span>
}

// ─── Employee View ─────────────────────────────────────────────────────────────

export function EmployeeRecibosView({ user }: { user: SessionUser }) {
  const [recibos, setRecibos] = useState<ReciboDB[]>([])
  const [loading, setLoading] = useState(true)
  const [viewer, setViewer] = useState<{ url: string; name: string } | null>(null)

  useEffect(() => {
    fetch('/api/liquidador/recibos')
      .then(r => r.json())
      .then(d => setRecibos(Array.isArray(d) ? (d as ReciboDB[]).sort((a, b) => b.anio - a.anio || b.mes - a.mes) : []))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner />

  return (
    <div className="space-y-3 mt-4">
      <p className="text-[13px] font-semibold text-[var(--text-sub)]">Recibos de sueldo</p>
      {recibos.length === 0 ? (
        <p className="text-[13px] text-[var(--text-sub)] text-center py-8">Sin recibos disponibles</p>
      ) : recibos.map(r => (
        <button key={r.id}
          onClick={() => setViewer({ url: r.storage_url, name: r.nombre_archivo })}
          className="w-full bg-white rounded-xl border border-gray-200/60 p-3.5 flex items-center gap-3 hover:bg-gray-50 transition-colors cursor-pointer text-left">
          <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center shrink-0">
            <IconFileText size={18} className="text-[var(--primary)]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold">{MESES[r.mes - 1]} {r.anio}</p>
            <p className="text-[11px] text-gray-400 truncate">{r.nombre_archivo}</p>
          </div>
          <span className="text-[12px] font-semibold text-[var(--primary)] shrink-0">Ver</span>
        </button>
      ))}
      {viewer && <FileViewer url={viewer.url} name={viewer.name} onClose={() => setViewer(null)} />}
    </div>
  )
}

// ─── Admin Recibos Tab ─────────────────────────────────────────────────────────

export function RecibosTab() {
  const now = new Date()
  const [anio, setAnio] = useState(now.getFullYear())
  const [mes,  setMes]  = useState(now.getMonth() + 1)

  const [firma,      setFirma]      = useState<string | null>(null)
  const [pdfFile,    setPdfFile]    = useState<File | null>(null)
  const [procesando, setProcesando] = useState(false)
  const [progreso,   setProgreso]   = useState({ actual: 0, total: 0 })
  const [recibos,    setRecibos]    = useState<ReciboProcesado[]>([])
  const [subiendo,   setSubiendo]   = useState(false)
  const [syncing,    setSyncing]    = useState(false)
  const [syncResult, setSyncResult] = useState<{ inserted: number; skipped: number } | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500)
  }

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res  = await fetch('/api/drive/sync', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tipo: 'liquidaciones' }),
      })
      const data = await res.json()
      if (data.error) { showToast(data.error, 'error'); return }
      setSyncResult({ inserted: data.inserted ?? 0, skipped: data.skipped ?? 0 })
      showToast(`Sincronización completa: ${data.inserted} importados, ${data.skipped} ya existían`)
    } catch {
      showToast('Error al conectar con Drive', 'error')
    } finally {
      setSyncing(false)
    }
  }

  // Load signature from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(SIG_KEY)
    if (saved) setFirma(saved)
  }, [])

  function handleFirma(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string
      localStorage.setItem(SIG_KEY, dataUrl)
      setFirma(dataUrl)
    }
    reader.readAsDataURL(file)
  }

  async function procesarPDF() {
    if (!pdfFile || !firma) return
    setProcesando(true)
    setRecibos([])
    setProgreso({ actual: 0, total: 0 })

    try {
      // 1. Extraer nombres de cada página (client-side, sin CDN worker)
      const nombres = await extractPageNames(pdfFile)

      // 2. Quitar fondo blanco de firma (Canvas API)
      const sigBytes = await removeWhiteBg(firma)

      // 3. Enviar al servidor para dividir y firmar
      const fd = new FormData()
      fd.append('pdf', pdfFile)
      fd.append('firma', new Blob([sigBytes], { type: 'image/png' }), 'firma.png')
      fd.append('mes', String(mes))
      fd.append('anio', String(anio))
      fd.append('nombres', JSON.stringify(nombres))

      const res  = await fetch('/api/liquidador/recibos/procesar', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error del servidor')

      const pages: Array<{
        pageIndex: number; nombreRaw: string; nombreFormateado: string
        mesStr: string; anioStr: string; pdfBase64: string; nombreArchivo: string
      }> = data.pages

      // 4. Convertir base64 → bytes y armar estado inicial (sin thumbnails aún)
      const results: ReciboProcesado[] = pages.map(p => {
        const binary = atob(p.pdfBase64)
        const bytes  = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        return {
          pageIndex: p.pageIndex, nombreRaw: p.nombreRaw,
          nombreFormateado: p.nombreFormateado,
          mesStr: p.mesStr, anioStr: p.anioStr,
          pdfBytes: bytes, previewUrl: '',
          status: 'pending' as const, nombreArchivo: p.nombreArchivo,
        }
      })

      setProgreso({ actual: data.total, total: data.total })
      setRecibos(results)

      // 5. Generar thumbnails uno por uno en el fondo
      for (let i = 0; i < results.length; i++) {
        const thumb = await renderThumbnail(results[i].pdfBytes)
        if (thumb) setRecibos(prev => prev.map((r, idx) => idx === i ? { ...r, previewUrl: thumb } : r))
      }
    } catch (e) {
      console.error('Error procesando PDF', e)
      showToast(e instanceof Error ? e.message : 'Error al procesar el PDF', 'error')
    } finally {
      setProcesando(false)
    }
  }

  async function subirRecibo(index: number) {
    const recibo = recibos[index]
    if (!recibo || recibo.status === 'uploaded') return

    setRecibos(prev => prev.map((r, i) => i === index ? { ...r, status: 'uploading' } : r))

    try {
      const fd = new FormData()
      fd.append('file', new Blob([recibo.pdfBytes], { type: 'application/pdf' }), recibo.nombreArchivo)
      fd.append('anio', recibo.anioStr)
      fd.append('mes', String(mes))
      fd.append('nombre', recibo.nombreFormateado)
      fd.append('nombre_archivo', recibo.nombreArchivo)

      const r = await fetch('/api/liquidador/recibos/upload', { method: 'POST', body: fd })
      const d = await r.json()

      if (r.ok) {
        setRecibos(prev => prev.map((rec, i) => i === index ? { ...rec, status: 'uploaded', storageUrl: d.url } : rec))
      } else {
        setRecibos(prev => prev.map((rec, i) => i === index ? { ...rec, status: 'error', errorMsg: d.error } : rec))
      }
    } catch {
      setRecibos(prev => prev.map((rec, i) => i === index ? { ...rec, status: 'error', errorMsg: 'Error de red' } : rec))
    }
  }

  async function subirTodos() {
    setSubiendo(true)
    for (let i = 0; i < recibos.length; i++) {
      if (recibos[i].status === 'pending' || recibos[i].status === 'error') {
        await subirRecibo(i)
      }
    }
    setSubiendo(false)
    showToast('Proceso completado')
  }

  const pendientes = recibos.filter(r => r.status === 'pending' || r.status === 'error').length
  const subidos    = recibos.filter(r => r.status === 'uploaded').length
  const fileCls    = "w-full h-10 px-3 border border-[var(--border)] rounded-xl text-[13px] outline-none focus:border-[var(--primary)] bg-white"

  return (
    <div>
      {/* Month */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <MonthPicker anio={anio} mes={mes} onChange={(a, m) => { setAnio(a); setMes(m) }} />
        <div className="ml-auto flex items-center gap-3">
          {syncResult && (
            <span className="text-[12px] text-emerald-600 font-medium">
              {syncResult.inserted} importados · {syncResult.skipped} ya existían
            </span>
          )}
          <button onClick={handleSync} disabled={syncing}
            className="h-9 px-3 rounded-xl border border-[var(--border)] bg-white text-[12px] font-medium text-[var(--text-sub)] hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer transition-colors">
            {syncing
              ? <><div className="w-3.5 h-3.5 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /> Importando…</>
              : '↑ Importar historial de Drive'}
          </button>
        </div>
      </div>

      {/* Setup section */}
      <div className="grid lg:grid-cols-2 gap-4 mb-5">

        {/* PDF Input */}
        <div>
          <p className="text-[12px] font-semibold text-[var(--text-sub)] mb-2">PDF de recibos (multi-página)</p>
          <label className={`flex items-center gap-2 cursor-pointer h-24 border-2 border-dashed rounded-xl transition-colors ${pdfFile ? 'border-[var(--primary)] bg-[var(--primary-light)]' : 'border-gray-200 hover:border-[var(--primary)] hover:bg-[var(--primary-light)]'}`}>
            <input type="file" accept=".pdf" className="hidden"
              onChange={e => setPdfFile(e.target.files?.[0] || null)} />
            <div className="w-full text-center">
              <IconFileText size={20} className={`mx-auto mb-1 ${pdfFile ? 'text-[var(--primary)]' : 'text-gray-300'}`} />
              <p className={`text-[12px] ${pdfFile ? 'font-semibold text-[var(--primary)]' : 'text-gray-400'}`}>
                {pdfFile ? pdfFile.name : 'PDF de la contadora'}
              </p>
              {pdfFile && (
                <p className="text-[11px] text-[var(--text-sub)]">{(pdfFile.size / 1024).toFixed(0)} KB</p>
              )}
            </div>
          </label>
        </div>

        {/* Signature Input */}
        <div>
          <p className="text-[12px] font-semibold text-[var(--text-sub)] mb-2">Firma del empleador</p>
          {firma ? (
            <div className="h-24 border-2 border-[var(--primary)] bg-[var(--primary-light)] rounded-xl flex items-center justify-between px-4">
              <img src={firma} alt="Firma" className="max-h-14 max-w-[120px] object-contain" style={{ background: 'transparent' }} />
              <button onClick={() => { localStorage.removeItem(SIG_KEY); setFirma(null) }}
                className="text-[12px] text-[var(--text-sub)] hover:text-red-500 cursor-pointer ml-2 shrink-0">
                Cambiar
              </button>
            </div>
          ) : (
            <label className="flex items-center justify-center h-24 border-2 border-dashed border-gray-200 hover:border-[var(--primary)] hover:bg-[var(--primary-light)] rounded-xl cursor-pointer transition-colors">
              <input type="file" accept="image/*" className="hidden" onChange={handleFirma} />
              <div className="text-center">
                <IconPlus size={18} className="mx-auto text-gray-300 mb-1" />
                <p className="text-[12px] text-gray-400">Subir imagen de firma</p>
                <p className="text-[11px] text-gray-300">PNG / JPEG / WebP · se guarda localmente</p>
              </div>
            </label>
          )}
        </div>
      </div>

      {/* Process button */}
      {!procesando && recibos.length === 0 && (
        <Button
          disabled={!pdfFile || !firma}
          onClick={procesarPDF}
          icon={<IconFileText size={15} />}
          className="w-full lg:w-auto">
          Procesar PDF
        </Button>
      )}

      {/* Progress bar */}
      {procesando && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Spinner size={20} inline />
            <span className="text-[13px] text-[var(--text-sub)]">
              Procesando recibos...
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div className="h-2 rounded-full bg-[var(--primary)] animate-pulse w-full" />
          </div>
        </div>
      )}

      {/* Results */}
      {recibos.length > 0 && (
        <div>
          {/* Summary + actions */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[13px] font-semibold">{recibos.length} recibos procesados</p>
              <p className="text-[11px] text-[var(--text-sub)]">{subidos} subidos · {pendientes} pendientes</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => { setRecibos([]); setPdfFile(null) }}>
                Limpiar
              </Button>
              {pendientes > 0 && (
                <Button size="sm" loading={subiendo} onClick={subirTodos} icon={<IconCheck size={14} />}>
                  Subir todos ({pendientes})
                </Button>
              )}
            </div>
          </div>

          {/* Cards grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {recibos.map((r, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200/60 overflow-hidden">
                {/* Preview */}
                {r.previewUrl ? (
                  <img src={r.previewUrl} alt={r.nombreFormateado}
                    className="w-full object-cover border-b border-gray-100"
                    style={{ maxHeight: 320 }} />
                ) : (
                  <div className="h-24 bg-gray-50 flex flex-col items-center justify-center gap-2 border-b border-gray-100">
                    <div className="w-4 h-4 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
                    <p className="text-[11px] text-gray-400">Generando vista previa...</p>
                  </div>
                )}
                {/* Info */}
                <div className="p-3 flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold">{r.nombreFormateado}</p>
                    <p className="text-[11px] text-gray-400 truncate">{r.nombreArchivo}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <StatusBadge status={r.status} errorMsg={r.errorMsg} />
                      {r.storageUrl && (
                        <a href={r.storageUrl} target="_blank" rel="noopener noreferrer"
                          className="text-[11px] text-[var(--primary)] hover:underline">
                          Ver PDF
                        </a>
                      )}
                    </div>
                    {r.errorMsg && (
                      <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
                        <IconAlertCircle size={11} />{r.errorMsg}
                      </p>
                    )}
                  </div>
                  {(r.status === 'pending' || r.status === 'error') && !subiendo && (
                    <button onClick={() => subirRecibo(i)}
                      className="p-2 text-[var(--primary)] bg-[var(--primary-light)] hover:brightness-95 rounded-lg cursor-pointer shrink-0 mt-0.5"
                      title="Subir este recibo">
                      <IconCheck size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Toast message={toast?.msg ?? ''} visible={!!toast} type={toast?.type ?? 'success'} />
    </div>
  )
}
