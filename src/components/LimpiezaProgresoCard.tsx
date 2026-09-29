'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { IconSparkles, IconChevronRight } from '@/components/ui/Icons'

// Card full-width para el dashboard admin: progreso de limpieza del día, clickeable
// al módulo. Cuenta tareas para el "X/Y" y subtareas para la barra (granularidad fina).
export default function LimpiezaProgresoCard({ className = '' }: { className?: string }) {
  const [tot, setTot] = useState(0)
  const [hec, setHec] = useState(0)
  const [leafTot, setLeafTot] = useState(0)
  const [leafHec, setLeafHec] = useState(0)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
    fetch(`/api/limpieza/dia?fecha=${hoy}`).then(r => r.json()).then(d => {
      const tareas = Array.isArray(d?.tareas) ? d.tareas : []
      let t = 0, h = 0, lt = 0, lh = 0
      for (const x of tareas as { hecho?: boolean; subtareas?: { hecho?: boolean }[] }[]) {
        t += 1; h += x.hecho ? 1 : 0
        const subs = x.subtareas ?? []
        if (subs.length) { lt += subs.length; lh += subs.filter(s => s.hecho).length }
        else { lt += 1; lh += x.hecho ? 1 : 0 }
      }
      setTot(t); setHec(h); setLeafTot(lt); setLeafHec(lh); setListo(true)
    }).catch(() => setListo(true))
  }, [])

  const pct = leafTot ? Math.round(leafHec / leafTot * 100) : 0

  return (
    <Link href="/dashboard/limpieza"
      className={`block bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 bg-[image:var(--gradient)] rounded-xl flex items-center justify-center flex-shrink-0">
            <IconSparkles size={14} className="text-white" />
          </div>
          <p className="text-[13px] font-bold text-[var(--text)] truncate">Progreso de limpieza de hoy</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[11px] font-bold text-[var(--primary)]">
            {listo ? (tot > 0 ? `${hec}/${tot} tareas` : 'Sin tareas') : '…'}
          </span>
          <IconChevronRight size={14} className="text-gray-300" />
        </div>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-[var(--primary)] rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] text-[var(--text-muted)] mt-1">
        {listo ? (tot > 0 ? `${pct}% completado` : 'No hay tareas cargadas para hoy') : 'Cargando…'}
      </p>
    </Link>
  )
}
