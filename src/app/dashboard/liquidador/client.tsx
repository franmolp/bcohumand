'use client'

import { useState, useEffect } from 'react'
import { RecibosTab, EmployeeRecibosView } from './recibos'
import { Spinner } from '@/components/ui'
import { IconDollar, IconFileText } from '@/components/ui/Icons'
import type { SessionUser } from '@/types'
import { MESES } from '@/lib/liquidador'
import FileViewer from '@/components/FileViewer'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ReciboDB {
  id: string
  anio: number
  mes: number
  nombre_empleada: string
  nombre_archivo: string
  storage_url: string
  subido_el: string
  estado: string
}

// ─── Month picker ──────────────────────────────────────────────────────────────

function MonthPicker({ anio, mes, onChange }: {
  anio: number; mes: number
  onChange: (a: number, m: number) => void
}) {
  function prev() { mes === 1 ? onChange(anio - 1, 12) : onChange(anio, mes - 1) }
  function next() { mes === 12 ? onChange(anio + 1, 1) : onChange(anio, mes + 1) }
  const now = new Date()
  const isNextDisabled = anio > now.getFullYear() || (anio === now.getFullYear() && mes >= now.getMonth() + 1)
  return (
    <div className="flex items-center gap-2">
      <button onClick={prev} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 cursor-pointer text-gray-500 text-lg font-light">‹</button>
      <span className="text-sm font-semibold min-w-[120px] text-center">{MESES[mes - 1]} {anio}</span>
      <button onClick={next} disabled={isNextDisabled} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 cursor-pointer text-gray-500 text-lg font-light disabled:opacity-30">›</button>
    </div>
  )
}

// ─── Vista empleada ────────────────────────────────────────────────────────────

function EmployeeView({ user }: { user: SessionUser }) {
  return (
    <div className="py-4 fade-in">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-[image:var(--gradient)] flex items-center justify-center flex-shrink-0 shadow-sm">
          <IconDollar size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-[17px] font-bold text-[var(--text)]">Mi liquidación</h1>
          <p className="text-xs text-[var(--text-sub)]">{user.nombre}</p>
        </div>
      </div>
      <EmployeeRecibosView user={user} />
    </div>
  )
}

// ─── Liquidaciones tab ─────────────────────────────────────────────────────────

function LiquidacionesTab() {
  const now = new Date()
  const [anio, setAnio] = useState(now.getFullYear())
  const [mes,  setMes]  = useState(now.getMonth() + 1)
  const [rows, setRows] = useState<ReciboDB[]>([])
  const [loading, setLoading] = useState(false)
  const [viewer, setViewer] = useState<{ url: string; name: string } | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/liquidador/recibos?anio=${anio}&mes=${mes}`)
      .then(r => r.json())
      .then(d => setRows((Array.isArray(d) ? d : []).sort((a: ReciboDB, b: ReciboDB) =>
        a.nombre_empleada.localeCompare(b.nombre_empleada, 'es')
      )))
      .finally(() => setLoading(false))
  }, [anio, mes])

  function fmtDate(iso: string) {
    try { return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) }
    catch { return iso }
  }

  return (
    <div className="space-y-4">
      <MonthPicker anio={anio} mes={mes} onChange={(a, m) => { setAnio(a); setMes(m) }} />

      {loading ? <Spinner /> : rows.length === 0 ? (
        <div className="text-center py-12">
          <IconFileText size={36} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-[var(--text-sub)]">Sin recibos para {MESES[mes-1]} {anio}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200/60 divide-y divide-gray-100">
          {rows.map(r => (
            <button key={r.id}
              onClick={() => setViewer({ url: r.storage_url, name: r.nombre_archivo })}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left cursor-pointer">
              <IconFileText size={18} className="text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium truncate">{r.nombre_empleada}</p>
                <p className="text-[11px] text-[var(--text-sub)] truncate">{r.nombre_archivo}</p>
              </div>
              <span className="text-[11px] text-[var(--text-sub)] shrink-0">{fmtDate(r.subido_el)}</span>
            </button>
          ))}
        </div>
      )}

      {viewer && <FileViewer url={viewer.url} name={viewer.name} onClose={() => setViewer(null)} />}
    </div>
  )
}

// ─── Admin view ────────────────────────────────────────────────────────────────

function AdminView() {
  const [tab, setTab] = useState<'liquidaciones' | 'recibos'>('liquidaciones')

  return (
    <div className="py-4 fade-in">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-[image:var(--gradient)] flex items-center justify-center flex-shrink-0 shadow-sm">
          <IconDollar size={18} className="text-white" />
        </div>
        <h1 className="text-[17px] font-bold text-[var(--text)]">Liquidaciones</h1>
      </div>

      <div className="flex bg-gray-100 rounded-xl p-0.5 mb-5">
        {(['liquidaciones', 'recibos'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-[12px] lg:text-[13px] font-medium rounded-[10px] cursor-pointer transition-all capitalize ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
            {t === 'liquidaciones' ? 'Liquidaciones' : 'Firmar recibos'}
          </button>
        ))}
      </div>

      {tab === 'liquidaciones' && <LiquidacionesTab />}
      {tab === 'recibos'       && <RecibosTab onSyncDone={() => setTab('liquidaciones')} />}
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export default function LiquidadorClient({ user }: { user: SessionUser }) {
  const isAdmin = user.rol === 'admin' || user.rol === 'Admin'
  return isAdmin ? <AdminView /> : <EmployeeView user={user} />
}
