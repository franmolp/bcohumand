'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button, Modal, Spinner, Toast, Select, Confirm } from '@/components/ui'
import { IconSparkles, IconChevronLeft, IconChevronRight, IconPlus, IconTrash, IconEdit, IconCheck } from '@/components/ui/Icons'

type Tarea = {
  id: number
  tipo: 'diaria' | 'semanal' | 'puntual'
  dia_semana: number | null
  fecha: string | null
  titulo: string
  detalle: string | null
  horario: string | null
  orden: number
  hecho?: boolean
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const DIAS_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function todayAR(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}
function addDays(fecha: string, n: number): string {
  const d = new Date(fecha + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function dow(fecha: string): number {
  return new Date(fecha + 'T12:00:00Z').getUTCDay()
}
function fmtFechaLarga(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number)
  return `${DIAS[dow(fecha)]} ${d}/${m}/${y}`
}
const GRUPO_LABEL: Record<string, string> = { diaria: 'Base diaria', semanal: 'Extra del día', puntual: 'Puntual de hoy' }

export default function LimpiezaClient({ isAdmin }: { isAdmin: boolean }) {
  const [tab, setTab] = useState<'hoy' | 'plan' | 'cumplimiento'>('hoy')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type }); setTimeout(() => setToast(null), 2500)
  }

  return (
    <div className="py-4 fade-in">
      <Toast message={toast?.msg ?? ''} visible={!!toast} type={toast?.type} />

      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-[image:var(--gradient)] flex items-center justify-center flex-shrink-0 shadow-sm">
          <IconSparkles size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-[17px] font-bold text-[var(--text)] leading-tight">Limpieza</h1>
          <p className="text-[12px] text-[var(--text-muted)]">Plan de limpieza diario</p>
        </div>
      </div>

      {/* Tabs (solo admin) */}
      {isAdmin && (
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-4">
          {([['hoy', 'Hoy'], ['plan', 'Plan'], ['cumplimiento', 'Cumplimiento']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-all cursor-pointer ${
                tab === k ? 'bg-white text-[var(--primary)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}>
              {l}
            </button>
          ))}
        </div>
      )}

      {tab === 'hoy' && <TabHoy showToast={showToast} />}
      {tab === 'plan' && isAdmin && <TabPlan showToast={showToast} />}
      {tab === 'cumplimiento' && isAdmin && <TabCumplimiento />}
    </div>
  )
}

// ─── HOY: checklist del día ───────────────────────────────────────────────────
function TabHoy({ showToast }: { showToast: (m: string, t?: 'success' | 'error') => void }) {
  const [fecha, setFecha] = useState(todayAR())
  const [tareas, setTareas] = useState<Tarea[] | null>(null)
  const [loading, setLoading] = useState(true)

  const cargar = useCallback((f: string) => {
    setLoading(true)
    fetch(`/api/limpieza/dia?fecha=${f}`)
      .then(r => r.json())
      .then(d => setTareas(Array.isArray(d.tareas) ? d.tareas : []))
      .catch(() => setTareas([]))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { cargar(fecha) }, [cargar, fecha])

  async function toggle(t: Tarea) {
    const nuevo = !t.hecho
    setTareas(prev => prev?.map(x => x.id === t.id ? { ...x, hecho: nuevo } : x) ?? prev)
    const res = await fetch('/api/limpieza/hechas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tarea_id: t.id, fecha, hecho: nuevo }),
    }).catch(() => null)
    if (!res || !res.ok) {
      setTareas(prev => prev?.map(x => x.id === t.id ? { ...x, hecho: !nuevo } : x) ?? prev)
      showToast('No se pudo guardar', 'error')
    }
  }

  const hoy = todayAR()
  const total = tareas?.length ?? 0
  const hechas = tareas?.filter(t => t.hecho).length ?? 0
  const grupos = ['diaria', 'semanal', 'puntual'] as const

  return (
    <div>
      {/* Navegador de día */}
      <div className="flex items-center justify-between bg-white rounded-2xl border border-[var(--border)] px-3 py-2.5 mb-3">
        <button onClick={() => setFecha(f => addDays(f, -1))} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-gray-50 cursor-pointer">
          <IconChevronLeft size={18} />
        </button>
        <div className="text-center">
          <p className="text-[14px] font-semibold text-[var(--text)]">{fecha === hoy ? 'Hoy' : DIAS[dow(fecha)]}</p>
          <p className="text-[11px] text-[var(--text-muted)]">{fmtFechaLarga(fecha)}</p>
        </div>
        <button onClick={() => setFecha(f => addDays(f, 1))} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-gray-50 cursor-pointer">
          <IconChevronRight size={18} />
        </button>
      </div>

      {/* Progreso */}
      {!loading && total > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] font-medium text-[var(--text-sub)]">{hechas} de {total} hechas</span>
            <span className="text-[12px] font-semibold text-[var(--primary)]">{Math.round(hechas / total * 100)}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-[var(--primary)] rounded-full transition-all" style={{ width: `${total ? hechas / total * 100 : 0}%` }} />
          </div>
        </div>
      )}

      {loading ? <div className="py-12"><Spinner /></div>
        : total === 0 ? (
          <div className="bg-white rounded-2xl border border-[var(--border)] py-12 text-center">
            <p className="text-sm text-[var(--text-muted)]">No hay tareas para este día</p>
          </div>
        ) : (
          <div className="space-y-3">
            {grupos.map(g => {
              const items = tareas!.filter(t => t.tipo === g)
              if (!items.length) return null
              return (
                <div key={g} className="bg-white rounded-2xl border border-[var(--border)] overflow-hidden">
                  <div className="px-4 py-2 bg-gray-50 border-b border-[var(--border)]">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{GRUPO_LABEL[g]}</p>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {items.map(t => (
                      <button key={t.id} onClick={() => toggle(t)}
                        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors cursor-pointer">
                        <span className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          t.hecho ? 'bg-[var(--primary)] border-[var(--primary)]' : 'border-gray-300'
                        }`}>
                          {t.hecho && <IconCheck size={13} className="text-white" />}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className={`text-[14px] font-medium ${t.hecho ? 'line-through text-[var(--text-muted)]' : 'text-[var(--text)]'}`}>
                            {t.titulo}
                            {t.horario && <span className="ml-2 text-[11px] font-normal text-[var(--text-muted)]">{t.horario}</span>}
                          </span>
                          {t.detalle && <span className="block text-[12px] text-[var(--text-muted)] mt-0.5">{t.detalle}</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
    </div>
  )
}

// ─── PLAN: editor del admin ───────────────────────────────────────────────────
const BLANK: Partial<Tarea> = { tipo: 'diaria', dia_semana: 1, fecha: null, titulo: '', detalle: '', horario: '', orden: 0 }

function TabPlan({ showToast }: { showToast: (m: string, t?: 'success' | 'error') => void }) {
  const [tareas, setTareas] = useState<Tarea[] | null>(null)
  const [edit, setEdit] = useState<Partial<Tarea> | null>(null)
  const [saving, setSaving] = useState(false)
  const [del, setDel] = useState<Tarea | null>(null)
  const [deleting, setDeleting] = useState(false)

  const cargar = useCallback(() => {
    fetch('/api/limpieza/tareas').then(r => r.json()).then(d => setTareas(Array.isArray(d) ? d : [])).catch(() => setTareas([]))
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function guardar() {
    if (!edit?.titulo?.trim()) { showToast('Falta el título', 'error'); return }
    setSaving(true)
    const esNueva = !edit.id
    const url = esNueva ? '/api/limpieza/tareas' : `/api/limpieza/tareas/${edit.id}`
    const res = await fetch(url, {
      method: esNueva ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo: edit.tipo, titulo: edit.titulo, detalle: edit.detalle, horario: edit.horario,
        dia_semana: edit.tipo === 'semanal' ? edit.dia_semana : null,
        fecha: edit.tipo === 'puntual' ? edit.fecha : null,
        orden: edit.orden ?? 0,
      }),
    }).catch(() => null)
    setSaving(false)
    if (!res || !res.ok) { const b = await res?.json().catch(() => ({})); showToast(b?.error ?? 'No se pudo guardar', 'error'); return }
    setEdit(null); cargar(); showToast('Guardado')
  }

  async function borrar() {
    if (!del) return
    setDeleting(true)
    const res = await fetch(`/api/limpieza/tareas/${del.id}`, { method: 'DELETE' }).catch(() => null)
    setDeleting(false)
    if (!res || !res.ok) { showToast('No se pudo quitar', 'error'); return }
    setDel(null); cargar(); showToast('Tarea quitada')
  }

  if (!tareas) return <div className="py-12"><Spinner /></div>

  const diarias = tareas.filter(t => t.tipo === 'diaria')
  const puntuales = tareas.filter(t => t.tipo === 'puntual').sort((a, b) => (a.fecha ?? '').localeCompare(b.fecha ?? ''))
  const semanalPorDia = (d: number) => tareas.filter(t => t.tipo === 'semanal' && t.dia_semana === d).sort((a, b) => a.orden - b.orden)

  const fila = (t: Tarea) => (
    <div key={t.id} className="flex items-start gap-2 px-4 py-2.5">
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-[var(--text)]">
          {t.titulo}{t.horario && <span className="ml-2 text-[11px] font-normal text-[var(--text-muted)]">{t.horario}</span>}
        </p>
        {t.detalle && <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{t.detalle}</p>}
      </div>
      <button onClick={() => setEdit(t)} className="p-1.5 text-gray-300 hover:text-[var(--primary)] cursor-pointer"><IconEdit size={13} /></button>
      <button onClick={() => setDel(t)} className="p-1.5 text-gray-300 hover:text-red-500 cursor-pointer"><IconTrash size={13} /></button>
    </div>
  )

  const seccion = (titulo: string, items: Tarea[], nueva: Partial<Tarea>) => (
    <div className="bg-white rounded-2xl border border-[var(--border)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-[var(--border)]">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{titulo}</p>
        <button onClick={() => setEdit({ ...BLANK, ...nueva, orden: items.length + 1 })}
          className="text-[11px] font-medium text-[var(--primary)] flex items-center gap-1 cursor-pointer hover:opacity-80">
          <IconPlus size={12} /> Agregar
        </button>
      </div>
      {items.length ? <div className="divide-y divide-gray-50">{items.map(fila)}</div>
        : <p className="px-4 py-3 text-[12px] text-[var(--text-muted)]">Sin tareas</p>}
    </div>
  )

  return (
    <div className="space-y-3">
      {seccion('Base diaria (todos los días)', diarias, { tipo: 'diaria' })}
      {[1, 2, 3, 4, 5, 6].map(d => seccion(`Extra · ${DIAS[d]}`, semanalPorDia(d), { tipo: 'semanal', dia_semana: d }))}
      {seccion('Puntuales (fecha específica)', puntuales, { tipo: 'puntual', fecha: todayAR() })}

      {/* Modal alta/edición */}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar tarea' : 'Nueva tarea'}
        footer={<>
          <Button variant="secondary" className="flex-1" onClick={() => setEdit(null)} disabled={saving}>Cancelar</Button>
          <Button className="flex-1" onClick={guardar} loading={saving}>Guardar</Button>
        </>}>
        {edit && (
          <div className="space-y-3">
            <Select label="Tipo" value={edit.tipo ?? 'diaria'} onChange={v => setEdit(e => ({ ...e, tipo: v as Tarea['tipo'] }))}>
              <option value="diaria">Diaria (todos los días)</option>
              <option value="semanal">Semanal (un día de la semana)</option>
              <option value="puntual">Puntual (una fecha)</option>
            </Select>
            {edit.tipo === 'semanal' && (
              <Select label="Día" value={String(edit.dia_semana ?? 1)} onChange={v => setEdit(e => ({ ...e, dia_semana: Number(v) }))}>
                {[1, 2, 3, 4, 5, 6, 0].map(d => <option key={d} value={d}>{DIAS[d]}</option>)}
              </Select>
            )}
            {edit.tipo === 'puntual' && (
              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Fecha</label>
                <input type="date" value={edit.fecha ?? ''} onChange={e => setEdit(x => ({ ...x, fecha: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:border-[var(--primary)]" style={{ fontSize: 16 }} />
              </div>
            )}
            <div>
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Tarea</label>
              <input value={edit.titulo ?? ''} onChange={e => setEdit(x => ({ ...x, titulo: e.target.value }))}
                placeholder="Ej: Baños" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:border-[var(--primary)]" style={{ fontSize: 16 }} />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Detalle (opcional)</label>
              <textarea rows={2} value={edit.detalle ?? ''} onChange={e => setEdit(x => ({ ...x, detalle: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:border-[var(--primary)] resize-none" style={{ fontSize: 16 }} />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Horario (opcional)</label>
              <input value={edit.horario ?? ''} onChange={e => setEdit(x => ({ ...x, horario: e.target.value }))}
                placeholder="Ej: 6:30–8:30" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:border-[var(--primary)]" style={{ fontSize: 16 }} />
            </div>
          </div>
        )}
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={borrar} loading={deleting} danger
        title="¿Quitar la tarea?" message={`"${del?.titulo}" dejará de aparecer en el plan.`} confirmLabel="Quitar" />
    </div>
  )
}

// ─── CUMPLIMIENTO: últimos días ───────────────────────────────────────────────
function TabCumplimiento() {
  const [dias, setDias] = useState<{ fecha: string; total: number; hechas: number }[] | null>(null)

  useEffect(() => {
    const hasta = todayAR()
    const desde = addDays(hasta, -13)
    fetch(`/api/limpieza/cumplimiento?desde=${desde}&hasta=${hasta}`)
      .then(r => r.json())
      .then(d => setDias(Array.isArray(d.dias) ? d.dias : []))
      .catch(() => setDias([]))
  }, [])

  if (!dias) return <div className="py-12"><Spinner /></div>

  return (
    <div className="bg-white rounded-2xl border border-[var(--border)] overflow-hidden">
      <div className="px-4 py-2 bg-gray-50 border-b border-[var(--border)]">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Últimos 14 días</p>
      </div>
      <div className="divide-y divide-gray-50">
        {[...dias].reverse().map(d => {
          const pct = d.total ? Math.round(d.hechas / d.total * 100) : 0
          const color = d.total === 0 ? 'bg-gray-200' : pct >= 100 ? 'bg-green-500' : pct >= 60 ? 'bg-amber-400' : 'bg-red-400'
          return (
            <div key={d.fecha} className="flex items-center gap-3 px-4 py-2.5">
              <div className="w-24 flex-shrink-0">
                <p className="text-[12px] font-medium text-[var(--text)]">{DIAS_CORTO[dow(d.fecha)]} {d.fecha.slice(8)}/{d.fecha.slice(5, 7)}</p>
              </div>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
              </div>
              <span className="text-[11px] text-[var(--text-muted)] w-12 text-right flex-shrink-0">{d.hechas}/{d.total}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
