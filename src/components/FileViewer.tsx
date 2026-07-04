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
          // PDFs en iframe fallan en iOS Safari → mostrar botón nativo
          <div className="flex flex-col items-center justify-center h-full gap-5">
            <svg width={56} height={56} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/20">
              <path d="M14 3v4a1 1 0 001 1h4"/><path d="M17 21h-10a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z"/>
              <path d="M9 9l1 0"/><path d="M9 13l6 0"/><path d="M9 17l6 0"/>
            </svg>
            <p className="text-white/50 text-[13px] text-center px-8 max-w-xs">{name || 'Documento PDF'}</p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white text-gray-900 font-semibold text-[14px] rounded-2xl px-8 py-3.5 flex items-center gap-2 active:opacity-80 hover:bg-gray-100 transition-colors"
            >
              <IconExternalLink size={17} />
              Abrir PDF
            </a>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
