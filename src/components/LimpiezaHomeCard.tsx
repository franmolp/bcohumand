'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { IconSparkles, IconChevronRight } from '@/components/ui/Icons'

// Tarjeta del Inicio para el equipo de limpieza: tareas de hoy y pedidos pendientes.
export default function LimpiezaHomeCard() {
  const [hechas, setHechas] = useState(0)
  const [total, setTotal] = useState(0)
  const [pendientes, setPendientes] = useState(0)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
    Promise.all([
      fetch(`/api/limpieza/dia?fecha=${hoy}`).then(r => r.json()).catch(() => ({ tareas: [] })),
      fetch('/api/limpieza/pedidos').then(r => r.json()).catch(() => []),
    ]).then(([dia, pedidos]) => {
      const tareas = Array.isArray(dia?.tareas) ? dia.tareas : []
      // Contador general por tareas (no subtareas). Progreso fino queda para el módulo.
      let tot = 0, hec = 0
      for (const t of tareas as { hecho?: boolean }[]) { tot += 1; hec += t.hecho ? 1 : 0 }
      setTotal(tot)
      setHechas(hec)
      setPendientes(Array.isArray(pedidos) ? pedidos.filter((p: { estado: string }) => p.estado !== 'resuelto').length : 0)
      setListo(true)
    })
  }, [])

  const pct = total ? Math.round(hechas / total * 100) : 0

  return (
    <Link href="/dashboard/limpieza"
      className="flex items-center gap-3 rounded-2xl p-4 shadow-sm hover:opacity-95 transition-opacity"
      style={{ background: 'var(--gradient)' }}>
      <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
        <IconSparkles size={20} className="text-white" />
      </div>
      <div className="flex-1 min-w-0 text-white">
        <p className="text-[15px] font-bold leading-tight">Plan de limpieza de hoy</p>
        <p className="text-[12px] text-white/85 mt-0.5">
          {listo ? (
            total > 0 ? `${hechas} de ${total} tarea${total !== 1 ? 's' : ''} hecha${total !== 1 ? 's' : ''} (${pct}%)` : 'Sin tareas para hoy'
          ) : 'Cargando…'}
        </p>
        {pendientes > 0 && (
          <p className="text-[12px] font-semibold text-white mt-1.5 inline-flex items-center gap-1 bg-white/20 rounded-lg px-2 py-1">
            {pendientes === 1 ? 'Tenés una solicitud especial — revisala' : `Tenés ${pendientes} solicitudes especiales — revisalas`}
          </p>
        )}
      </div>
      <IconChevronRight size={18} className="text-white/80 flex-shrink-0" />
    </Link>
  )
}
