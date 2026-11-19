'use client'

// Visor de PDF dentro de la app (con PDF.js, el mismo worker local que usan los recibos): dibuja cada página
// en la pantalla, así no se ve la dirección del archivo y anda igual en iPhone, Android y la compu.
// Zoom con − / + y descarga con un nombre prolijo.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconX } from '@/components/ui/Icons'
import { cargarPdfjs } from '@/lib/pdfjs'

type Pagina = { getViewport: (o: { scale: number }) => { width: number; height: number }; render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> } }
type Doc = { numPages: number; getPage: (n: number) => Promise<Pagina> }
type Pdfjs = { getDocument: (o: object) => { promise: Promise<Doc> } }

const cargar = () => cargarPdfjs<Pdfjs>()

const ZOOMS = [1, 1.5, 2, 3]

export default function VisorPdf({ url, nombre, archivo, onClose }: { url: string; nombre: string; archivo: string; onClose: () => void }) {
  const [doc, setDoc] = useState<Doc | null>(null)
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null)
  const [error, setError] = useState('')
  const [zoom, setZoom] = useState(0)
  const [ancho, setAncho] = useState(0)
  const cont = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch(url)
        if (!r.ok) throw new Error()
        const b = await r.arrayBuffer()
        const lib = await cargar()
        const d = await lib.getDocument({ data: b.slice(0) }).promise
        if (vivo) { setBytes(b); setDoc(d) }
      } catch { if (vivo) setError('No se pudo abrir la lista de precios') }
    })()
    return () => { vivo = false }
  }, [url])

  useEffect(() => {
    const medir = () => setAncho(cont.current?.clientWidth ?? 0)
    medir(); window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [])

  function descargar() {
    if (!bytes) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
    a.download = archivo
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 10000)
  }

  const base = 'h-9 min-w-9 px-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer font-semibold disabled:opacity-30'
  const boton = `${base} text-[18px]`
  // Ancho de cada página: el de la pantalla (con un tope en la compu) por el zoom
  const anchoPagina = Math.min(ancho - 16, 900) * ZOOMS[zoom]

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-neutral-900">
      <div className="flex items-center gap-1 px-3 shrink-0 bg-black/70 border-b border-white/10"
        style={{ height: 'calc(52px + env(safe-area-inset-top, 0px))', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <p className="text-white text-[14px] font-medium truncate flex-1 mr-2">{nombre}</p>
        <button onClick={() => setZoom(z => Math.max(0, z - 1))} disabled={zoom === 0} className={boton} title="Alejar">−</button>
        <button onClick={() => setZoom(z => Math.min(ZOOMS.length - 1, z + 1))} disabled={zoom === ZOOMS.length - 1} className={boton} title="Acercar">+</button>
        <button onClick={descargar} disabled={!bytes} className={`${base} text-[13px]`} title="Descargar">Descargar</button>
        <button onClick={onClose} className={boton} title="Cerrar"><IconX size={20} className="mx-auto" /></button>
      </div>
      <div ref={cont} className="flex-1 overflow-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {error ? <p className="text-white/70 text-center mt-16 px-6">{error}</p>
          : !doc ? <p className="text-white/60 text-center mt-16">Abriendo la lista de precios…</p>
          : anchoPagina > 0 && (
            <div className="py-2 space-y-2" style={{ width: Math.max(anchoPagina + 16, ancho), }}>
              {Array.from({ length: doc.numPages }, (_, i) => <PaginaPdf key={i} doc={doc} n={i + 1} ancho={anchoPagina} />)}
            </div>
          )}
      </div>
    </div>,
    document.body
  )
}

// Cada página se dibuja cuando se acerca a la pantalla (los PDF de Canva pueden tener muchas y pesadas)
function PaginaPdf({ doc, n, ancho }: { doc: Doc; n: number; ancho: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [alto, setAlto] = useState(ancho * 1.414)
  const [visible, setVisible] = useState(n <= 2)
  useEffect(() => {
    const c = ref.current
    if (!c || visible) return
    const io = new IntersectionObserver(e => { if (e[0].isIntersecting) { setVisible(true); io.disconnect() } }, { rootMargin: '800px' })
    io.observe(c)
    return () => io.disconnect()
  }, [visible])
  useEffect(() => {
    if (!visible) return
    let vivo = true
    ;(async () => {
      const p = await doc.getPage(n)
      const base = p.getViewport({ scale: 1 })
      const css = ancho / base.width, dpr = Math.min(window.devicePixelRatio || 1, 3)
      const vp = p.getViewport({ scale: css * dpr })
      const c = ref.current
      if (!c || !vivo) return
      c.width = Math.floor(vp.width); c.height = Math.floor(vp.height)
      setAlto(base.height * css)
      const ctx = c.getContext('2d')
      if (ctx) await p.render({ canvasContext: ctx, viewport: vp }).promise.catch(() => {})
    })()
    return () => { vivo = false }
  }, [doc, n, ancho, visible])
  return <canvas ref={ref} className="block mx-auto bg-white shadow-lg" style={{ width: ancho, height: alto }} />
}
