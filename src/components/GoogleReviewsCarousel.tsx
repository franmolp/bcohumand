'use client'

import { useState, useEffect } from 'react'
import type { GoogleReview } from '@/app/api/google-reviews/route'

const GOOGLE_MAPS_URL = 'https://share.google/kcJbqR4Zw9vxXObJW'
const INTERVAL = 6000

function Stars({ n }: { n: number }) {
  return (
    <span className="text-yellow-400 text-[13px] tracking-tight leading-none">
      {'★'.repeat(Math.round(n))}
      <span className="text-gray-200">{'★'.repeat(5 - Math.round(n))}</span>
    </span>
  )
}

export default function GoogleReviewsCarousel() {
  const [reviews, setReviews] = useState<GoogleReview[]>([])
  const [idx, setIdx] = useState(0)
  const [visible, setVisible] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/google-reviews')
      .then(r => r.json())
      .then(d => { setReviews(d.reviews ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (reviews.length <= 1) return
    const t = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIdx(i => (i + 1) % reviews.length)
        setVisible(true)
      }, 220)
    }, INTERVAL)
    return () => clearInterval(t)
  }, [reviews.length])

  function goTo(i: number) {
    if (i === idx) return
    setVisible(false)
    setTimeout(() => { setIdx(i); setVisible(true) }, 150)
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 animate-pulse">
        <div className="h-3.5 bg-gray-100 rounded w-40 mb-4" />
        <div className="flex gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-full bg-gray-100 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 bg-gray-100 rounded w-24" />
            <div className="h-2.5 bg-gray-100 rounded w-16" />
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="h-3 bg-gray-100 rounded" />
          <div className="h-3 bg-gray-100 rounded w-4/5" />
        </div>
      </div>
    )
  }

  if (!reviews.length) return null

  const r = reviews[idx]

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        <h2 className="text-[14px] font-bold text-[var(--text)]">Lo que dicen de nosotras</h2>
      </div>

      {/* Review */}
      <div
        className="px-5 py-4 min-h-[110px] transition-opacity duration-200"
        style={{ opacity: visible ? 1 : 0 }}
      >
        <div className="flex items-start gap-2.5 mb-2.5">
          {r.avatar
            ? <img src={r.avatar} alt={r.author} className="w-8 h-8 rounded-full object-cover shrink-0" />
            : (
              <div className="w-8 h-8 rounded-full bg-[image:var(--gradient)] flex items-center justify-center shrink-0">
                <span className="text-[11px] font-bold text-white">{r.author[0]?.toUpperCase() ?? '?'}</span>
              </div>
            )
          }
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold leading-snug truncate">{r.author}</p>
            <div className="flex items-center gap-2">
              <Stars n={r.rating} />
              {r.date && <span className="text-[11px] text-gray-400">{r.date}</span>}
            </div>
          </div>
        </div>
        {r.text && (
          <p className="text-[13px] text-gray-600 leading-relaxed line-clamp-3">{r.text}</p>
        )}
      </div>

      {/* Dots + link */}
      <div className="px-5 pb-4 flex items-center justify-between gap-3">
        <div className="flex gap-1 items-center">
          {reviews.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`Reseña ${i + 1}`}
              className={`rounded-full transition-all duration-300 cursor-pointer ${
                i === idx
                  ? 'w-4 h-1.5 bg-[var(--primary)]'
                  : 'w-1.5 h-1.5 bg-gray-200 hover:bg-gray-300'
              }`}
            />
          ))}
        </div>
        <a
          href={GOOGLE_MAPS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-gray-400 hover:text-[var(--primary)] transition-colors flex items-center gap-1 font-medium"
        >
          Ver en Google
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
            <path d="M15 3h6v6"/>
            <path d="M10 14L21 3"/>
          </svg>
        </a>
      </div>
    </div>
  )
}
