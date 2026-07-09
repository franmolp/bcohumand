'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { IconBarChart, IconEye, IconEyeOff } from '@/components/ui/Icons'

const LS_KEY = 'admin_kpi_visible'
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

interface KpiData { totalCitas: number; ventasNetas: number }

export default function AdminKpiCard() {
  const [visible, setVisible] = useState(true)
  const [data, setData] = useState<KpiData | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY)
    if (stored === 'false') setVisible(false)
  }, [])

  useEffect(() => {
    const tz = 'America/Argentina/Buenos_Aires'
    const mes = new Date().toLocaleDateString('en-CA', { timeZone: tz }).slice(0, 7)
    fetch(`/api/informes?mes=${mes}`)
      .then(r => r.json())
      .then(d => { if (d.kpis) setData({ totalCitas: d.kpis.totalCitas, ventasNetas: d.kpis.ventasNetas }) })
      .catch(() => {})
  }, [])

  function toggle(e: React.MouseEvent) {
    e.preventDefault()
    const next = !visible
    setVisible(next)
    localStorage.setItem(LS_KEY, String(next))
  }

  const mesLabel = MESES[new Date().getMonth()]
  const fmtPesos = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')
  const montoCitas = data ? String(data.totalCitas) : '—'
  const montoVentas = data ? (visible ? fmtPesos(data.ventasNetas) : '••••••') : '—'

  return (
    <Link href="/dashboard/informes"
      className="col-span-2 lg:col-span-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:opacity-90 transition-opacity cursor-pointer">

      {/* Mobile */}
      <div className="flex items-stretch gap-2 lg:hidden">
        <div className="flex flex-col items-center flex-shrink-0 w-16">
          <div className="w-8 h-8 bg-emerald-50 rounded-xl flex items-center justify-center mb-auto">
            <IconBarChart size={16} className="text-emerald-500" />
          </div>
          <p className="text-[28px] font-bold leading-none text-gray-800 mt-2">{montoCitas}</p>
          <p className="text-[10px] text-gray-400 mt-0.5 text-center leading-tight">Citas {mesLabel}</p>
        </div>
        <div className="w-px bg-gray-100 self-stretch mx-1" />
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
          <p className="text-[11px] text-gray-400">Ventas netas</p>
          <div className="flex items-center gap-1.5">
            <p className="text-[18px] font-bold text-emerald-600 leading-none">{montoVentas}</p>
            <button onClick={toggle} className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer shrink-0 transition-colors" aria-label="Mostrar/ocultar monto">
              {visible ? <IconEye size={14} /> : <IconEyeOff size={14} />}
            </button>
          </div>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden lg:flex lg:flex-col h-full">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-emerald-50 rounded-lg flex items-center justify-center">
              <IconBarChart size={14} className="text-emerald-500" />
            </div>
            <span className="text-[13px] font-semibold text-gray-600">Mes en curso</span>
          </div>
        </div>
        <div className="h-px bg-gray-100 mb-2.5" />
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-400">Citas {mesLabel}</span>
            <span className="text-[16px] font-bold text-gray-800 leading-none">{montoCitas}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-400">Ventas netas</span>
            <div className="flex items-center gap-1">
              <span className="text-[14px] font-bold text-emerald-600 leading-none">{montoVentas}</span>
              <button onClick={toggle} className="p-0.5 text-gray-400 hover:text-gray-600 cursor-pointer transition-colors" aria-label="Mostrar/ocultar monto">
                {visible ? <IconEye size={12} /> : <IconEyeOff size={12} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}
