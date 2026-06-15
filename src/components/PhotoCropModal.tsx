'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Spinner } from '@/components/ui'
import { IconX, IconCamera, IconTrash } from '@/components/ui/Icons'

const PREVIEW = 230
const OUTPUT = 220

interface Props {
  currentUrl?: string | null
  initials: string
  onClose: () => void
  onSaved: (url: string) => void
  onDeleted?: () => void
}

export default function PhotoCropModal({ currentUrl, initials, onClose, onSaved, onDeleted }: Props) {
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [minScale, setMinScale] = useState(1)
  const [dragging, setDragging] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [mounted, setMounted] = useState(false)

  const dragRef = useRef({ startX: 0, startY: 0, posX: 0, posY: 0 })
  const touchRef = useRef<{ dist: number; scale: number; posX: number; posY: number } | null>(null)
  const minScaleRef = useRef(1)
  const scaleRef = useRef(1)
  const posRef = useRef({ x: 0, y: 0 })
  const draggingRef = useRef(false)
  const imgNatRef = useRef({ w: 0, h: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setMounted(true) }, [])

  // Keep refs in sync
  useEffect(() => { scaleRef.current = scale }, [scale])
  useEffect(() => { posRef.current = pos }, [pos])
  useEffect(() => { draggingRef.current = dragging }, [dragging])
  useEffect(() => { minScaleRef.current = minScale }, [minScale])

  // Attach non-passive wheel and touch listeners
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY > 0 ? 0.92 : 1.08
      const next = Math.max(minScaleRef.current, Math.min(scaleRef.current * factor, minScaleRef.current * 8))
      scaleRef.current = next
      setScale(next)
    }

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      if (e.touches.length === 1 && draggingRef.current) {
        const dx = e.touches[0].clientX - dragRef.current.startX
        const dy = e.touches[0].clientY - dragRef.current.startY
        const next = { x: dragRef.current.posX + dx, y: dragRef.current.posY + dy }
        posRef.current = next
        setPos(next)
      } else if (e.touches.length === 2 && touchRef.current) {
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        const dist = Math.sqrt(dx * dx + dy * dy)
        const next = Math.max(minScaleRef.current, Math.min(touchRef.current.scale * (dist / touchRef.current.dist), minScaleRef.current * 8))
        scaleRef.current = next
        setScale(next)
      }
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchmove', onTouchMove)
    }
  }, [imgSrc])

  function handleFile(file: File) {
    if (!file.type.startsWith('image/')) return
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const ms = Math.max(PREVIEW / img.naturalWidth, PREVIEW / img.naturalHeight)
      imgNatRef.current = { w: img.naturalWidth, h: img.naturalHeight }
      minScaleRef.current = ms
      scaleRef.current = ms
      setMinScale(ms)
      setScale(ms)
      setPos({ x: 0, y: 0 })
      setImgSrc(url)
    }
    img.src = url
  }

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!imgSrc) return
    setDragging(true)
    draggingRef.current = true
    dragRef.current = { startX: e.clientX, startY: e.clientY, posX: posRef.current.x, posY: posRef.current.y }
  }, [imgSrc])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    const next = { x: dragRef.current.posX + dx, y: dragRef.current.posY + dy }
    posRef.current = next
    setPos(next)
  }, [])

  const handleMouseUp = useCallback(() => {
    setDragging(false)
    draggingRef.current = false
  }, [])

  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 1) {
      dragRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, posX: posRef.current.x, posY: posRef.current.y }
      setDragging(true)
      draggingRef.current = true
      touchRef.current = null
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      touchRef.current = { dist: Math.sqrt(dx * dx + dy * dy), scale: scaleRef.current, posX: posRef.current.x, posY: posRef.current.y }
      setDragging(false)
      draggingRef.current = false
    }
  }

  function handleTouchEnd() {
    setDragging(false)
    draggingRef.current = false
    touchRef.current = null
  }

  async function handleSave() {
    if (!imgRef.current) return
    setSaving(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = OUTPUT
      canvas.height = OUTPUT
      const ctx = canvas.getContext('2d')!
      ctx.beginPath()
      ctx.arc(OUTPUT / 2, OUTPUT / 2, OUTPUT / 2, 0, Math.PI * 2)
      ctx.clip()

      const ratio = OUTPUT / PREVIEW
      const drawW = imgNatRef.current.w * scaleRef.current * ratio
      const drawH = imgNatRef.current.h * scaleRef.current * ratio
      const drawX = OUTPUT / 2 + posRef.current.x * ratio - drawW / 2
      const drawY = OUTPUT / 2 + posRef.current.y * ratio - drawH / 2
      ctx.drawImage(imgRef.current, drawX, drawY, drawW, drawH)

      canvas.toBlob(async blob => {
        if (!blob) { setSaving(false); return }
        const fd = new FormData()
        fd.append('file', new File([blob], 'avatar.jpg', { type: 'image/jpeg' }))
        try {
          const r = await fetch('/api/perfil/foto', { method: 'POST', body: fd })
          const { url, error } = await r.json()
          if (error || !url) { setSaving(false); return }
          onSaved(url)
        } catch { setSaving(false) }
      }, 'image/jpeg', 0.88)
    } catch { setSaving(false) }
  }

  async function handleDelete() {
    if (!onDeleted) return
    setDeleting(true)
    try {
      await fetch('/api/perfil/foto', { method: 'DELETE' })
      onDeleted()
    } finally {
      setDeleting(false)
    }
  }

  if (!mounted) return null

  const modal = (
    <div className="fixed inset-0 z-[70] flex items-end lg:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-t-2xl lg:rounded-2xl shadow-2xl w-full max-w-sm"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle mobile */}
        <div className="flex justify-center pt-3 pb-1 lg:hidden">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="px-6 pt-4 pb-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-[16px] font-bold text-[var(--text)]">Foto de Perfil</h2>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-full cursor-pointer">
              <IconX size={18} />
            </button>
          </div>

          {!imgSrc ? (
            <div className="flex flex-col items-center gap-5">
              {/* Current photo or placeholder */}
              <div className="w-36 h-36 rounded-full overflow-hidden bg-[image:var(--gradient)] flex items-center justify-center shadow-lg ring-4 ring-white">
                {currentUrl
                  ? <img src={currentUrl} alt="" className="w-full h-full object-cover" />
                  : <span className="text-3xl font-bold text-white/40 flex flex-col items-center gap-1">
                      <IconCamera size={40} />
                    </span>
                }
              </div>

              <div className="flex flex-col items-center gap-3 w-full">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 px-6 py-2.5 bg-[image:var(--gradient)] text-white text-[14px] font-semibold rounded-xl cursor-pointer w-full justify-center"
                >
                  <IconCamera size={16} />
                  {currentUrl ? 'Cambiar foto' : 'Elegir foto'}
                </button>

                {currentUrl && onDeleted && (
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex items-center gap-1.5 text-[13px] text-red-500 hover:underline cursor-pointer disabled:opacity-50"
                  >
                    {deleting ? <Spinner size={13} inline /> : <IconTrash size={14} />}
                    Eliminar foto
                  </button>
                )}
              </div>

              <p className="text-[12px] text-gray-400 text-center leading-relaxed">
                Elegí una imagen y acomodala dentro del círculo.<br />
                Podés arrastrar y hacer zoom.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              {/* Crop circle */}
              <div
                ref={containerRef}
                className="relative bg-gray-200 select-none flex-shrink-0"
                style={{
                  width: PREVIEW,
                  height: PREVIEW,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  cursor: dragging ? 'grabbing' : 'grab',
                  touchAction: 'none',
                  boxShadow: '0 0 0 4px white, 0 0 0 6px #e5e7eb',
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imgRef}
                  src={imgSrc}
                  draggable={false}
                  alt=""
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px)) scale(${scale})`,
                    transformOrigin: 'center center',
                    maxWidth: 'none',
                    userSelect: 'none',
                    pointerEvents: 'none',
                    willChange: 'transform',
                  }}
                />
              </div>

              <p className="text-[11px] text-gray-400 text-center">
                Arrastrá para reposicionar · Pellizcá o usá la rueda para hacer zoom
              </p>

              <div className="flex gap-3 w-full">
                <button
                  onClick={() => { setImgSrc(null); setPos({ x: 0, y: 0 }); setScale(1) }}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-[14px] text-gray-600 cursor-pointer hover:bg-gray-50"
                >
                  Cambiar foto
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-2.5 bg-[image:var(--gradient)] text-white text-[14px] font-semibold rounded-xl disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
                >
                  {saving && <Spinner size={15} inline />}
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
        />
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
