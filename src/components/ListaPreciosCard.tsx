'use client'

import { useState } from 'react'
import { IconSparkles, IconChevronRight } from '@/components/ui/Icons'
import FileViewer from '@/components/FileViewer'

// Lista de precios vigente: la misma de la web de BCO Turnos (el último PDF armado en Catálogo →
// Lista de precios). Se pide al tocar, así siempre es la actual.
// En el celular se abre el PDF directo (el visor del teléfono es el que mejor lo muestra: un PDF dentro
// de la página no se ve bien en iPhone ni en Android); en la compu, dentro del visor de la app.
export default function ListaPreciosCard() {
  const [url, setUrl] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  async function abrir() {
    if (cargando) return
    setCargando(true); setError('')
    const celular = window.matchMedia('(pointer: coarse)').matches
    // La pestaña se abre en el mismo toque (si no, el celular la bloquea) y después se le pone la dirección
    const pestaña = celular ? window.open('', '_blank') : null
    try {
      const d = await fetch('/api/lista-precios').then(r => r.json())
      if (!d.url) { pestaña?.close(); setError(d.error || 'No se pudo abrir la lista de precios'); return }
      if (pestaña) pestaña.location.href = d.url
      else if (celular) window.location.href = d.url // no se pudo abrir otra pestaña: se abre acá
      else setUrl(d.url)
    } catch { pestaña?.close(); setError('No se pudo abrir la lista de precios') }
    finally { setCargando(false) }
  }

  return (
    <>
      <button
        onClick={abrir}
        className="w-full flex items-center gap-3 rounded-2xl p-4 shadow-sm hover:opacity-95 transition-opacity text-left cursor-pointer"
        style={{ background: 'linear-gradient(135deg, #EC4899 0%, #DB2777 100%)' }}>
        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
          <IconSparkles size={20} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold text-white">Lista de precios vigente</p>
          <p className="text-[12px] text-white/70">{cargando ? 'Abriendo…' : error || 'Tocá para ver los precios actualizados'}</p>
        </div>
        <IconChevronRight size={16} className="text-white/60 shrink-0" />
      </button>

      {url && (
        <FileViewer url={url} name="Lista de precios" onClose={() => setUrl(null)} />
      )}
    </>
  )
}
