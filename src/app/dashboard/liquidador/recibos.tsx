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

interface PagoEmpleada {
  anio: number
  mes: number
  total: number
  efectivo: number
  transferencia: number
}

function fmtPeso(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

export function EmployeeRecibosView({ user }: { user: SessionUser }) {
  const [recibos, setRecibos] = useState<ReciboDB[]>([])
  const [pagos,   setPagos]   = useState<PagoEmpleada[]>([])
  const [loading, setLoading] = useState(true)
  const [viewer, setViewer] = useState<{ url: string; name: string } | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/liquidador/recibos').then(r => r.json()),
      fetch('/api/liquidador/pagos').then(r => r.json()),
    ]).then(([rData, pData]) => {
      setRecibos(Array.isArray(rData) ? (rData as ReciboDB[]).sort((a, b) => b.anio - a.anio || b.mes - a.mes) : [])
      setPagos(Array.isArray(pData) ? (pData as PagoEmpleada[]) : [])
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner />

  // Build unified list of months: from recibos + pagos (deduplicated)
  const keys = new Map<string, { anio: number; mes: number }>()
  recibos.forEach(r => keys.set(`${r.anio}-${r.mes}`, { anio: r.anio, mes: r.mes }))
  pagos.forEach(p => keys.set(`${p.anio}-${p.mes}`, { anio: p.anio, mes: p.mes }))
  const meses = Array.from(keys.values()).sort((a, b) => b.anio - a.anio || b.mes - a.mes)

  const reciboMap = new Map(recibos.map(r => [`${r.anio}-${r.mes}`, r]))
  const pagoMap   = new Map(pagos.map(p => [`${p.anio}-${p.mes}`, p]))

  return (
    <div className="space-y-3 mt-4">
      <p className="text-[13px] font-semibold text-[var(--text-sub)]">Mis liquidaciones</p>
      {meses.length === 0 ? (
        <p className="text-[13px] text-[var(--text-sub)] text-center py-8">Sin liquidaciones disponibles</p>
      ) : meses.map(({ anio, mes }) => {
        const recibo = reciboMap.get(`${anio}-${mes}`)
        const pago   = pagoMap.get(`${anio}-${mes}`)
        return (
          <div key={`${anio}-${mes}`}
            className="w-full bg-white rounded-xl border border-gray-200/60 overflow-hidden">
            {/* Header — clickeable si hay recibo */}
            {recibo ? (
              <button
                onClick={() => setViewer({ url: recibo.storage_url, name: recibo.nombre_archivo })}
                className="w-full p-3.5 flex items-center gap-3 hover:bg-gray-50 transition-colors cursor-pointer text-left">
                <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center shrink-0">
                  <IconFileText size={18} className="text-[var(--primary)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold">{MESES[mes - 1]} {anio}</p>
                  <p className="text-[11px] text-gray-400 truncate">{recibo.nombre_archivo}</p>
                </div>
                <span className="text-[12px] font-semibold text-[var(--primary)] shrink-0">Ver recibo</span>
              </button>
            ) : (
              <div className="p-3.5 flex items-center gap-3">
                <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center shrink-0">
                  <IconFileText size={18} className="text-gray-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold">{MESES[mes - 1]} {anio}</p>
                  <p className="text-[11px] text-gray-400">Recibo pendiente</p>
                </div>
              </div>
            )}
            {/* Payment breakdown */}
            {pago && (
              <div className="border-t border-gray-100 px-3.5 py-3 bg-gray-50/60 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-[var(--text-main)]">Total a liquidar</span>
                  <span className="text-[13px] font-bold text-[var(--primary)]">{fmtPeso(pago.total)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[var(--text-sub)]">Efectivo</span>
                  <span className="text-[11px] font-medium text-[var(--text-main)]">{fmtPeso(pago.efectivo)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[var(--text-sub)]">Transferencia</span>
                  <span className="text-[11px] font-medium text-[var(--text-main)]">{fmtPeso(pago.transferencia)}</span>
                </div>
              </div>
            )}
          </div>
        )
      })}
      {viewer && <FileViewer url={viewer.url} name={viewer.name} onClose={() => setViewer(null)} />}
    </div>
  )
}

// ─── Admin Recibos Tab ─────────────────────────────────────────────────────────

export function RecibosTab({ onSyncDone }: { onSyncDone?: () => void } = {}) {
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
      if ((data.inserted ?? 0) > 0) onSyncDone?.()
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

    try {
      // Dynamic imports (client-only, avoid SSR)
      const [PDFLib, pdfjs] = await Promise.all([
        import('pdf-lib'),
        import('pdfjs-dist'),
      ])

      // Configure pdfjs worker via unpkg CDN (matches installed version)
      const version = (pdfjs as unknown as { version: string }).version
      ;(pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc =
        `//unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`

      // Remove white background from signature
      const sigBytes = await removeWhiteBg(firma)

      // Read source PDF
      const pdfBuffer = await pdfFile.arrayBuffer()
      const pdfBytes  = new Uint8Array(pdfBuffer)

      // Load with pdf-lib (for modification)
      const srcDoc = await PDFLib.PDFDocument.load(pdfBytes.slice().buffer as ArrayBuffer)

      // Load with pdfjs (for text extraction)
      const pdfJsLib = pdfjs as unknown as {
        getDocument: (opts: { data: Uint8Array }) => { promise: Promise<{ getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: { str: string }[] }> }> }> }
      }
      const pdfJsDoc = await pdfJsLib.getDocument({ data: pdfBytes.slice() }).promise

      const numPages = srcDoc.getPageCount()
      setProgreso({ actual: 0, total: numPages })

      const results: ReciboProcesado[] = []

      for (let i = 0; i < numPages; i++) {
        setProgreso({ actual: i + 1, total: numPages })

        // Extract text
        const pdfJsPage  = await pdfJsDoc.getPage(i + 1)
        const textContent = await pdfJsPage.getTextContent()
        const fullText   = textContent.items.map(it => it.str).join(' ')

        // Name regex: "Nombre y Apellido: OJEDA ROCIO AYELEN"
        const nameMatch =
          fullText.match(/Nombre\s+y\s+Apellido[\s:]+([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ\s]+?)(?:\s{2,}|CUIL|DNI|Per[ií]|$)/i) ??
          fullText.match(/Apellido\s+y\s+Nombre[\s:]+([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ\s]+?)(?:\s{2,}|CUIL|DNI|Per[ií]|$)/i)

        // Period regex: "Período Febrero 2026"
        const periodMatch = fullText.match(/Per[ií]odo[\s:]+([A-Za-záéíóúüñ]+)\s+(\d{4})/i)

        const nombreRaw       = nameMatch?.[1]?.trim() ?? `Página ${i + 1}`
        const mesStr          = periodMatch?.[1] ?? MESES[mes - 1]
        const anioStr         = periodMatch?.[2] ?? String(anio)
        const nombreFormateado = nameMatch ? formatearNombrePDF(nombreRaw) : `Página ${i + 1}`
        const nombreArchivo   = `${nombreFormateado} Liquidacion ${mesStr}.pdf`

        // Create individual signed PDF
        const newDoc = await PDFLib.PDFDocument.create()
        const [copiedPage] = await newDoc.copyPages(srcDoc, [i])
        newDoc.addPage(copiedPage)

        const page  = newDoc.getPages()[0]
        const { width, height } = page.getSize()

        // Embed signature
        const sigImage  = await newDoc.embedPng(sigBytes)
        const sigWidth  = width * 0.12
        const sigHeight = sigWidth * (sigImage.height / sigImage.width)

        page.drawImage(sigImage, {
          x: width * 0.61,
          y: height * 0.04,
          width: sigWidth,
          height: sigHeight,
          opacity: 0.92,
        })

        const signedBytes = await newDoc.save()

        // Generate preview using pdfjs
        let previewUrl = ''
        try {
          const prevDoc  = await pdfJsLib.getDocument({ data: signedBytes.slice() }).promise
          const prevPage = await prevDoc.getPage(1)
          const vp = (prevPage as unknown as {
            getViewport: (opts: { scale: number }) => {
              width: number; height: number;
              clone: (o: object) => typeof vp
            }
          }).getViewport({ scale: 1.2 })
          const canvas = document.createElement('canvas')
          canvas.width = vp.width; canvas.height = vp.height
          const ctx = canvas.getContext('2d')!
          await (prevPage as unknown as {
            render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: typeof vp }) => { promise: Promise<void> }
          }).render({ canvasContext: ctx, viewport: vp }).promise
          previewUrl = canvas.toDataURL('image/jpeg', 0.82)
        } catch (e) {
          console.warn('Preview render failed', e)
        }

        results.push({
          pageIndex: i,
          nombreRaw, nombreFormateado,
          mesStr, anioStr,
          pdfBytes: signedBytes,
          previewUrl,
          status: 'pending',
          nombreArchivo,
        })
      }

      setRecibos(results)
    } catch (e) {
      console.error('Error procesando PDF', e)
      showToast('Error al procesar el PDF. Verificá que pdf-lib y pdfjs-dist estén instalados.', 'error')
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
              Procesando página {progreso.actual} de {progreso.total}...
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className="bg-[var(--primary)] h-2 rounded-full transition-all"
              style={{ width: `${progreso.total > 0 ? (progreso.actual / progreso.total) * 100 : 0}%` }} />
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
                    style={{ maxHeight: 280 }} />
                ) : (
                  <div className="h-20 bg-gray-50 flex items-center justify-center border-b border-gray-100">
                    <IconFileText size={24} className="text-gray-300" />
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
