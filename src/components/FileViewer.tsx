'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { IconX, IconExternalLink } from '@/components/ui/Icons'

function getDriveFileId(url: string): string | null {
  const m1 = url.match(/drive\.google\.com\/file\/d\/([^/?]+)/)
  if (m1) return m1[1]
  const m2 = url.match(/[?&]id=([^&]+)/)
  if (m2 && url.includes('drive.google.com')) return m2[1]
  return null
}

function isAbsoluteUrl(url: string): boolean {
  return /^https?:\/\//.test(url)
}

function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp)(\?|#|$)/i.test(url)
}

interface FileViewerProps {
  url: string
  name?: string | null
  onClose: () => void
}

export default function FileViewer({ url, name, onClose }: FileViewerProps) {
  const [showFallback, setShowFallback] = useState(false)

  const isAbsolute  = isAbsoluteUrl(url)
  const driveId     = isAbsolute ? getDriveFileId(url) : null
  const driveEmbed  = driveId ? `https://drive.google.com/file/d/${driveId}/preview` : null
  const driveOpen   = driveId ? `https://drive.google.com/file/d/${driveId}/view` : (isAbsolute ? url : null)
  const driveSearch = `https://drive.google.com/drive/search?q=${encodeURIComponent(name || url)}`
  const isImg       = isAbsolute && !driveId && isImageUrl(url)

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/95">
      {/* Header */}
      <div className="flex items-center justify-between px-4 shrink-0 bg-black/60 border-b border-white/10"
        style={{ height: 'calc(52px + env(safe-area-inset-top, 0px))', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <p className="text-white text-[14px] font-medium truncate flex-1 mr-4">{name || 'Archivo'}</p>
        <div className="flex items-center gap-1">
          <a href={driveOpen ?? driveSearch} target="_blank" rel="noopener noreferrer"
            className="p-2 text-white/60 hover:text-white rounded-lg transition-colors"
            title="Abrir en Drive">
            <IconExternalLink size={18} />
          </a>
          <button onClick={onClose}
            className="p-2 text-white/60 hover:text-white rounded-lg transition-colors cursor-pointer"
            title="Cerrar">
            <IconX size={20} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>

        {!isAbsolute ? (
          /* URL inválida — GAS guardó solo el nombre de archivo */
          <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center mb-1">
              <IconExternalLink size={24} className="text-white/60" />
            </div>
            <p className="text-white text-[15px] font-semibold">No se puede previsualizar</p>
            <p className="text-white/50 text-[13px] leading-relaxed max-w-xs">
              El archivo está en Drive pero la URL no quedó guardada correctamente. Podés abrirlo directo desde Drive.
            </p>
            <a href={driveSearch} target="_blank" rel="noopener noreferrer"
              className="mt-2 px-6 py-3 bg-white text-gray-900 rounded-xl text-[14px] font-semibold hover:bg-gray-100 transition-colors">
              Buscar en Drive →
            </a>
          </div>

        ) : driveEmbed ? (
          <>
            <iframe
              src={driveEmbed}
              className="w-full h-full border-0"
              title={name ?? 'Archivo'}
              allow="autoplay"
              onLoad={() => setShowFallback(true)}
            />
            {/* Fallback para archivos privados o cuando el embed falla */}
            {showFallback && (
              <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-6"
                style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))' }}>
                <a href={driveOpen!} target="_blank" rel="noopener noreferrer"
                  className="px-5 py-2.5 bg-white/90 text-gray-900 rounded-xl text-[13px] font-semibold shadow-lg hover:bg-white transition-colors backdrop-blur-sm">
                  ¿No podés verlo? Abrí en Drive →
                </a>
              </div>
            )}
          </>

        ) : isImg ? (
          <div className="flex items-center justify-center h-full p-4" onClick={onClose}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={name ?? 'Archivo'}
              className="max-w-full max-h-full object-contain rounded-lg"
              onClick={e => e.stopPropagation()}
            />
          </div>

        ) : (
          <iframe
            src={url}
            className="w-full h-full border-0"
            title={name ?? 'Archivo'}
          />
        )}
      </div>
    </div>,
    document.body
  )
}
