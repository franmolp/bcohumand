'use client'

// Selector de hora en formato 24hs con dropdowns (hora 08–21 y minutos). Se usa
// en vez de <input type="time"> porque en el iPhone ese input muestra 1–12 con
// AM/PM según el idioma del celular, y las empleadas confunden la mañana con la
// noche (ponen 9 PM en vez de 9 AM). Con 24hs no hay ambigüedad.
// value / onChange en formato "HH:MM" (acepta "HH:MM:SS" y lo recorta).
export default function Hora24({
  value,
  onChange,
  minuteStep = 5,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  minuteStep?: number
  className?: string
}) {
  const parts = (value || '').split(':')
  const hh = parts[0] ?? ''
  const mm = parts[1] ?? ''

  // Rango 08–21hs: nunca se elige nada fuera de ese horario laboral.
  const horas = Array.from({ length: 14 }, (_, i) => String(i + 8).padStart(2, '0'))
  // Si la hora guardada queda fuera del rango (ej. un valor viejo), se agrega igual.
  if (hh && !horas.includes(hh)) { horas.push(hh); horas.sort() }
  const minutos: string[] = []
  for (let m = 0; m < 60; m += minuteStep) minutos.push(String(m).padStart(2, '0'))
  // Si el minuto guardado no cae en el paso (ej. un valor viejo), se agrega igual.
  if (mm && !minutos.includes(mm)) { minutos.push(mm); minutos.sort() }

  const setH = (h: string) => onChange(h === '' ? '' : `${h}:${mm || '00'}`)
  const setM = (m: string) => onChange(`${hh || '00'}:${m}`)

  const selCls =
    'h-11 px-2 bg-white border border-[var(--border)] rounded-xl text-[var(--text)] outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)] lg:text-sm'

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <select value={hh} onChange={e => setH(e.target.value)} style={{ fontSize: 16 }}
        className={`${selCls} flex-1 min-w-0 text-center`} aria-label="Hora">
        <option value="">--</option>
        {horas.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <span className="text-[var(--text-muted)] font-bold">:</span>
      <select value={mm} onChange={e => setM(e.target.value)} style={{ fontSize: 16 }}
        className={`${selCls} flex-1 min-w-0 text-center`} aria-label="Minutos">
        <option value="">--</option>
        {minutos.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <span className="text-[11px] text-[var(--text-muted)] shrink-0">hs</span>
    </div>
  )
}
