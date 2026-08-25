'use client'

import { useState } from 'react'
import { IconSparkles, IconChevronRight } from '@/components/ui/Icons'
import FileViewer from '@/components/FileViewer'

// Link fijo a la lista de precios en Google Drive (siempre el mismo archivo).
const LISTA_PRECIOS_URL = 'https://drive.google.com/file/d/1HkNdq6gm4EhBa33TbtlGzNHW2HBXRLL7/view?usp=drivesdk'

export default function ListaPreciosCard() {
  const [abierto, setAbierto] = useState(false)

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="w-full flex items-center gap-3 rounded-2xl p-4 shadow-sm hover:opacity-95 transition-opacity text-left cursor-pointer"
        style={{ background: 'linear-gradient(135deg, #EC4899 0%, #DB2777 100%)' }}>
        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
          <IconSparkles size={20} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold text-white">Lista de precios vigente</p>
          <p className="text-[12px] text-white/70">Tocá para ver los precios actualizados</p>
        </div>
        <IconChevronRight size={16} className="text-white/60 shrink-0" />
      </button>

      {abierto && (
        <FileViewer url={LISTA_PRECIOS_URL} name="Lista de precios" onClose={() => setAbierto(false)} />
      )}
    </>
  )
}
