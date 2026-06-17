'use client'

import { createPortal } from 'react-dom'
import { IconX, IconExternalLink } from '@/components/ui/Icons'

function getDriveEmbedUrl(url: string): string | null {
  // https://drive.google.com/file/d/{id}/view  or  /preview
  const m1 = url.match(/drive\.google\.com\/file\/d\/([^/?]+)/)
  if (m1) return `https://drive.google.com/file/d/${m1[1]}/preview`
  // https://drive.google.com/uc?export=download&id={id}
  const m2 = url.match(/[?&]id=([^&]+)/)
  if (m2 && url.includes('drive.google.com')) return `https://drive.google.com/file/d/${m2[1]}/preview`
  return null
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
  const driveEmbed = getDriveEmbedUrl(url)
  const isImg = !driveEmbed && isImageUrl(url)

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/95">
      {/* Header */}
      <div className="flex items-center justify-between px-4 shrink-0 bg-black/60 border-b border-white/10"
        style={{ height: 'calc(52px + env(safe-area-inset-top, 0px))', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <p className="text-white text-[14px] font-medium truncate flex-1 mr-4">{name || 'Archivo'}</p>
        <div className="flex items-center gap-1">
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="p-2 text-white/60 hover:text-white rounded-lg transition-colors"
            title="Abrir en nueva pestaña">
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
      <div className="flex-1 overflow-hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {driveEmbed ? (
          <iframe
            src={driveEmbed}
            className="w-full h-full border-0"
            title={name ?? 'Archivo'}
            allow="autoplay"
          />
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
