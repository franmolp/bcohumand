'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { SessionUser } from '@/types'
import {
  IconShoppingBag, IconX, IconCheck, IconEdit, IconChevronRight,
  IconPlus, IconSettings, IconBarChart,
} from '@/components/ui/Icons'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type CatKey = 'cocina' | 'limpieza' | 'manicuria' | 'masajes' | 'cejas_pestanas' | 'depilacion' | 'peluqueria'

const CATEGORIAS: { key: CatKey; label: string; emoji: string }[] = [
  { key: 'cocina',         label: 'Cocina',           emoji: '🍽️' },
  { key: 'limpieza',       label: 'Limpieza',          emoji: '🧹' },
  { key: 'manicuria',      label: 'Manicuría',         emoji: '💅' },
  { key: 'masajes',        label: 'Masajes',           emoji: '💆' },
  { key: 'cejas_pestanas', label: 'Cejas y Pestañas',  emoji: '✨' },
  { key: 'depilacion',     label: 'Depilación',        emoji: '🪒' },
  { key: 'peluqueria',     label: 'Peluquería',        emoji: '✂️' },
]

const UNIDADES = ['unidad', 'kg', 'litro', 'caja', 'pack', 'rollo', 'frasco', 'tubo']
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

function catLabel(key: string) { return CATEGORIAS.find(c => c.key === key)?.label ?? key }
function catEmoji(key: string) { return CATEGORIAS.find(c => c.key === key)?.emoji ?? '📦' }

interface Proveedor { id: number; nombre: string }

interface Producto {
  id: string
  nombre: string
  categoria: CatKey
  unidad: string
  activo: boolean
  proveedor_id: number | null
  proveedor: Proveedor | null
}

interface Ciclo {
  id: string
  nombre: string
  fecha_apertura: string
  fecha_cierre: string
  estado: 'abierto' | 'cerrado' | 'enviado'
  created_at: string
}

interface Item {
  id: string
  ciclo_id: string
  producto_id: string | null
  nombre_libre: string | null
  cantidad: number
  unidad: string
  notas: string | null
  urgente: boolean
  estado: 'pendiente' | 'ordenado' | 'recibido'
  usuario_id: string
  usuario: { nombre: string; foto_perfil: string | null }
  producto: {
    id: string
    nombre: string
    categoria: CatKey
    unidad: string
    proveedor_id: number | null
    proveedor: { id: number; nombre: string } | null
  } | null
  created_at: string
}

interface ExportGroup {
  nombre_proveedor: string
  items: {
    id: string
    nombre: string
    cantidad: number
    unidad: string
    notas: string | null
    urgente: boolean
    estado: string
    usuario: string
    nombre_libre: string | null
    categoria: string | null
  }[]
}

interface Usuario { id: string; nombre: string; foto_perfil: string | null }
interface Permiso { usuario_id: string; categoria: string }

// ─── Utils ────────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="w-5 h-5 border-2 border-gray-200 border-t-[var(--primary)] rounded-full animate-spin" />
    </div>
  )
}

function Avatar({ nombre, foto, size = 24 }: { nombre: string; foto: string | null; size?: number }) {
  const initials = nombre.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  if (foto) return <img src={foto} alt={nombre} className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size }} />
  return (
    <div className="rounded-full bg-[image:var(--gradient)] flex items-center justify-center flex-shrink-0 text-white font-bold" style={{ width: size, height: size, fontSize: Math.round(size * 0.37) }}>
      {initials}
    </div>
  )
}

function formatFecha(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${parseInt(d)}/${parseInt(m)}/${y}`
}

function diasHasta(fecha: string): number {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const cierre = new Date(fecha + 'T00:00:00')
  return Math.round((cierre.getTime() - hoy.getTime()) / 86400000)
}

function EstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, string> = {
    abierto:  'bg-green-50 text-green-700 border-green-200',
    cerrado:  'bg-amber-50 text-amber-600 border-amber-200',
    enviado:  'bg-blue-50 text-blue-600 border-blue-200',
    pendiente: 'bg-gray-100 text-gray-500 border-gray-200',
    ordenado:  'bg-amber-50 text-amber-600 border-amber-200',
    recibido:  'bg-green-50 text-green-700 border-green-200',
  }
  const label: Record<string, string> = {
    abierto: 'Abierto', cerrado: 'Cerrado', enviado: 'Enviado',
    pendiente: 'Pendiente', ordenado: 'Ordenado', recibido: 'Recibido',
  }
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${map[estado] ?? ''}`}>{label[estado] ?? estado}</span>
}

// ─── Tab: Lista ───────────────────────────────────────────────────────────────

function TabLista({ cicloActivo, productos, onRefresh }: {
  cicloActivo: Ciclo | null
  productos: Producto[]
  onRefresh: () => void
}) {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [editItem, setEditItem] = useState<Item | null>(null)

  // Form agregar
  const [busqueda, setBusqueda] = useState('')
  const [productoSel, setProductoSel] = useState<Producto | null>(null)
  const [nombreLibre, setNombreLibre] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [unidad, setUnidad] = useState('unidad')
  const [notas, setNotas] = useState('')
  const [urgente, setUrgente] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(() => {
    if (!cicloActivo) return
    setLoading(true)
    fetch(`/api/pedidos/ciclos/${cicloActivo.id}/items`)
      .then(r => r.json())
      .then(d => setItems(d.items ?? []))
      .finally(() => setLoading(false))
  }, [cicloActivo])

  useEffect(() => { cargar() }, [cargar])

  function resetForm() {
    setBusqueda(''); setProductoSel(null); setNombreLibre('')
    setCantidad('1'); setUnidad('unidad'); setNotas(''); setUrgente(false)
  }

  const prodsFiltrados = productos
    .filter(p => p.activo && (busqueda.length < 2 || p.nombre.toLowerCase().includes(busqueda.toLowerCase())))
    .slice(0, 8)

  // Detecta si el producto ya está en la lista
  const duplicado = productoSel
    ? items.find(i => i.producto_id === productoSel.id)
    : null

  async function agregarItem() {
    if (!cicloActivo) return
    setGuardando(true)
    const res = await fetch(`/api/pedidos/ciclos/${cicloActivo.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        producto_id: productoSel?.id ?? null,
        nombre_libre: !productoSel ? nombreLibre : null,
        cantidad: Number(cantidad),
        unidad: productoSel ? productoSel.unidad : unidad,
        notas: notas || null,
        urgente,
      }),
    })
    setGuardando(false)
    if (res.ok) {
      setShowAdd(false); resetForm(); cargar()
    }
  }

  async function guardarEdicion() {
    if (!editItem) return
    setGuardando(true)
    await fetch(`/api/pedidos/ciclos/${cicloActivo!.id}/items/${editItem.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cantidad: Number(cantidad), notas: notas || null, urgente }),
    })
    setGuardando(false)
    setEditItem(null); cargar()
  }

  async function eliminarItem(id: string) {
    await fetch(`/api/pedidos/ciclos/${cicloActivo!.id}/items/${id}`, { method: 'DELETE' })
    cargar()
  }

  // Agrupar por categoría
  const porCategoria = CATEGORIAS.map(cat => ({
    cat,
    items: items.filter(i => i.producto?.categoria === cat.key),
  })).filter(g => g.items.length)

  const sinCategoria = items.filter(i => !i.producto)

  const dias = cicloActivo ? diasHasta(cicloActivo.fecha_cierre) : null

  if (!cicloActivo) {
    return (
      <div className="text-center py-16">
        <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
          <IconShoppingBag size={24} className="text-gray-400" />
        </div>
        <p className="text-[14px] font-semibold text-[var(--text)] mb-1">No hay ciclo activo</p>
        <p className="text-[13px] text-gray-400">Creá un nuevo ciclo desde la pestaña Ajustes</p>
      </div>
    )
  }

  return (
    <div>
      {/* Banner del ciclo */}
      <div className={`rounded-2xl p-4 mb-4 ${cicloActivo.estado === 'abierto' ? 'bg-green-50 border border-green-200' : 'bg-gray-100 border border-gray-200'}`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[13px] font-bold text-[var(--text)]">{cicloActivo.nombre}</p>
            <p className="text-[12px] text-gray-500 mt-0.5">
              {formatFecha(cicloActivo.fecha_apertura)} → {formatFecha(cicloActivo.fecha_cierre)}
            </p>
          </div>
          <EstadoBadge estado={cicloActivo.estado} />
        </div>
        {cicloActivo.estado === 'abierto' && dias !== null && (
          <p className={`text-[12px] font-semibold mt-2 ${dias <= 1 ? 'text-red-600' : 'text-green-700'}`}>
            {dias === 0 ? '⚠️ Cierra hoy' : dias === 1 ? '⚠️ Cierra mañana' : `✅ Cierra en ${dias} días`}
          </p>
        )}
      </div>

      {/* Botón agregar */}
      {cicloActivo.estado === 'abierto' && (
        <button onClick={() => { setShowAdd(true); resetForm() }}
          className="w-full flex items-center justify-center gap-2 py-3 mb-4 border-2 border-dashed border-[var(--primary)]/40 text-[var(--primary)] rounded-xl text-[13px] font-semibold cursor-pointer hover:bg-[var(--primary)]/5 transition-colors">
          <IconPlus size={16} /> Agregar producto
        </button>
      )}

      {loading && <Spinner />}

      {!loading && !items.length && (
        <p className="text-center text-[13px] text-gray-400 py-10">La lista está vacía</p>
      )}

      {/* Items por categoría */}
      {!loading && (
        <div className="space-y-4">
          {porCategoria.map(({ cat, items: catItems }) => (
            <div key={cat.key}>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">
                {cat.emoji} {cat.label}
              </p>
              <div className="space-y-2">
                {catItems.map(item => (
                  <ItemCard key={item.id} item={item} cicloAbierto={cicloActivo.estado === 'abierto'}
                    onEdit={() => { setEditItem(item); setCantidad(String(item.cantidad)); setNotas(item.notas ?? ''); setUrgente(item.urgente) }}
                    onDelete={() => eliminarItem(item.id)} />
                ))}
              </div>
            </div>
          ))}
          {sinCategoria.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">📝 Libres</p>
              <div className="space-y-2">
                {sinCategoria.map(item => (
                  <ItemCard key={item.id} item={item} cicloAbierto={cicloActivo.estado === 'abierto'}
                    onEdit={() => { setEditItem(item); setCantidad(String(item.cantidad)); setNotas(item.notas ?? ''); setUrgente(item.urgente) }}
                    onDelete={() => eliminarItem(item.id)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal agregar */}
      {showAdd && createPortal(
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[15px] font-bold text-[var(--text)]">Agregar producto</p>
                <button onClick={() => setShowAdd(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer transition-colors">
                  <IconX size={18} />
                </button>
              </div>

              {/* Buscador de catálogo */}
              {!productoSel && (
                <div>
                  <p className="text-[12px] font-medium text-gray-500 mb-2">Buscar en catálogo</p>
                  <input
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    placeholder="Ej: algodón, lavandina..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] focus:outline-none focus:border-[var(--primary)]"
                  />
                  {busqueda.length >= 2 && (
                    <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                      {prodsFiltrados.map(p => (
                        <button key={p.id} onClick={() => { setProductoSel(p); setUnidad(p.unidad) }}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left hover:bg-gray-50 cursor-pointer transition-colors">
                          <span className="text-[14px]">{catEmoji(p.categoria)}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium truncate">{p.nombre}</p>
                            <p className="text-[11px] text-gray-400">{catLabel(p.categoria)} · {p.proveedor?.nombre ?? 'Sin proveedor'}</p>
                          </div>
                        </button>
                      ))}
                      {!prodsFiltrados.length && (
                        <button onClick={() => { setNombreLibre(busqueda); setBusqueda('') }}
                          className="w-full px-3 py-2 rounded-xl text-[13px] text-[var(--primary)] font-medium hover:bg-[var(--primary)]/5 cursor-pointer transition-colors text-left">
                          + Agregar "{busqueda}" como ítem libre
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Producto seleccionado */}
              {productoSel && (
                <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <span className="text-[18px]">{catEmoji(productoSel.categoria)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold truncate">{productoSel.nombre}</p>
                    <p className="text-[11px] text-gray-400">{catLabel(productoSel.categoria)} · {productoSel.proveedor?.nombre ?? 'Sin proveedor'}</p>
                  </div>
                  <button onClick={() => setProductoSel(null)} className="p-1 text-gray-400 hover:text-gray-700 cursor-pointer rounded-lg transition-colors">
                    <IconX size={14} />
                  </button>
                </div>
              )}

              {/* Item libre */}
              {!productoSel && nombreLibre && (
                <div>
                  <p className="text-[12px] font-medium text-gray-500 mb-2">Ítem libre <span className="text-amber-500">(no está en el catálogo)</span></p>
                  <div className="flex gap-2">
                    <input value={nombreLibre} onChange={e => setNombreLibre(e.target.value)}
                      className="flex-1 border border-amber-200 bg-amber-50 rounded-xl px-3 py-2.5 text-[13px] focus:outline-none focus:border-amber-400" />
                    <button onClick={() => setNombreLibre('')} className="p-2.5 text-gray-400 hover:text-gray-700 cursor-pointer rounded-xl border border-gray-200 transition-colors">
                      <IconX size={14} />
                    </button>
                  </div>
                </div>
              )}

              {/* Aviso duplicado */}
              {duplicado && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <span className="text-[14px]">⚠️</span>
                  <p className="text-[12px] text-amber-700">
                    Ya fue pedido por <span className="font-semibold">{duplicado.usuario.nombre}</span>. Podés ajustar la cantidad del ítem existente o agregar uno nuevo si necesitás cantidad adicional.
                  </p>
                </div>
              )}

              {(productoSel || nombreLibre) && (
                <>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <p className="text-[12px] font-medium text-gray-500 mb-2">Cantidad</p>
                      <input type="number" min="0.1" step="0.5" value={cantidad} onChange={e => setCantidad(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-center font-semibold focus:outline-none focus:border-[var(--primary)]" />
                    </div>
                    {!productoSel && (
                      <div className="flex-1">
                        <p className="text-[12px] font-medium text-gray-500 mb-2">Unidad</p>
                        <select value={unidad} onChange={e => setUnidad(e.target.value)}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] focus:outline-none focus:border-[var(--primary)]">
                          {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                    )}
                    {productoSel && (
                      <div className="flex-1">
                        <p className="text-[12px] font-medium text-gray-500 mb-2">Unidad</p>
                        <div className="border border-gray-100 bg-gray-50 rounded-xl px-3 py-2.5 text-[13px] text-gray-500">{productoSel.unidad}</div>
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-[12px] font-medium text-gray-500 mb-2">Notas (opcional)</p>
                    <input value={notas} onChange={e => setNotas(e.target.value)}
                      placeholder="Ej: si no hay marca X, pedir marca Y"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] focus:outline-none focus:border-[var(--primary)]" />
                  </div>

                  <button onClick={() => setUrgente(u => !u)}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold border cursor-pointer transition-all ${urgente ? 'bg-red-50 border-red-300 text-red-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                    🔴 {urgente ? 'Urgente activado' : 'Marcar como urgente'}
                  </button>
                </>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowAdd(false)}
                  className="px-4 py-2.5 border border-gray-200 text-gray-500 rounded-xl text-[13px] font-medium cursor-pointer hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button onClick={agregarItem}
                  disabled={guardando || (!productoSel && !nombreLibre.trim()) || !cantidad || Number(cantidad) <= 0}
                  className="flex-1 py-2.5 bg-[image:var(--gradient)] text-white rounded-xl text-[13px] font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  {guardando ? 'Agregando…' : 'Agregar a la lista'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal editar item */}
      {editItem && createPortal(
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={() => setEditItem(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-bold text-[var(--text)]">Editar ítem</p>
              <button onClick={() => setEditItem(null)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer transition-colors">
                <IconX size={18} />
              </button>
            </div>
            <p className="text-[13px] font-medium text-[var(--text)]">
              {editItem.producto?.nombre ?? editItem.nombre_libre}
            </p>
            <div className="flex gap-3">
              <div className="flex-1">
                <p className="text-[12px] font-medium text-gray-500 mb-2">Cantidad</p>
                <input type="number" min="0.1" step="0.5" value={cantidad} onChange={e => setCantidad(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-center font-semibold focus:outline-none focus:border-[var(--primary)]" />
              </div>
              <div className="flex-1">
                <p className="text-[12px] font-medium text-gray-500 mb-2">Unidad</p>
                <div className="border border-gray-100 bg-gray-50 rounded-xl px-3 py-2.5 text-[13px] text-gray-500">{editItem.unidad}</div>
              </div>
            </div>
            <div>
              <p className="text-[12px] font-medium text-gray-500 mb-2">Notas</p>
              <input value={notas} onChange={e => setNotas(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] focus:outline-none focus:border-[var(--primary)]" />
            </div>
            <button onClick={() => setUrgente(u => !u)}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold border cursor-pointer transition-all ${urgente ? 'bg-red-50 border-red-300 text-red-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
              🔴 {urgente ? 'Urgente activado' : 'Marcar como urgente'}
            </button>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditItem(null)}
                className="px-4 py-2.5 border border-gray-200 text-gray-500 rounded-xl text-[13px] font-medium cursor-pointer hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button onClick={guardarEdicion} disabled={guardando}
                className="flex-1 py-2.5 bg-[image:var(--gradient)] text-white rounded-xl text-[13px] font-semibold cursor-pointer disabled:opacity-40 transition-colors">
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

function ItemCard({ item, cicloAbierto, onEdit, onDelete }: {
  item: Item
  cicloAbierto: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className={`bg-white border rounded-xl p-3 shadow-sm ${item.urgente ? 'border-red-200' : 'border-gray-100'}`}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {item.urgente && <span className="text-[10px] font-bold text-red-500">🔴 URGENTE</span>}
            <span className="text-[13px] font-semibold text-[var(--text)]">
              {item.producto?.nombre ?? item.nombre_libre ?? 'Item'}
            </span>
            {!item.producto && (
              <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded-full">Libre</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[12px] font-bold text-[var(--primary)]">{item.cantidad} {item.unidad}</span>
            {item.producto?.proveedor && (
              <span className="text-[11px] text-gray-400">· {item.producto.proveedor.nombre}</span>
            )}
          </div>
          {item.notas && (
            <p className="text-[11px] text-gray-400 mt-0.5 italic">{item.notas}</p>
          )}
          <div className="flex items-center gap-1.5 mt-1.5">
            <Avatar nombre={item.usuario.nombre} foto={item.usuario.foto_perfil} size={16} />
            <span className="text-[11px] text-gray-400">{item.usuario.nombre}</span>
          </div>
        </div>
        {cicloAbierto && (
          <div className="flex flex-col gap-1">
            <button onClick={onEdit} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer transition-colors">
              <IconEdit size={14} />
            </button>
            <button onClick={onDelete} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 cursor-pointer transition-colors">
              <IconX size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tab: Exportar ────────────────────────────────────────────────────────────

function TabExportar({ cicloActivo }: { cicloActivo: Ciclo | null }) {
  const [grupos, setGrupos] = useState<ExportGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [copiado, setCopiado] = useState<string | null>(null)

  useEffect(() => {
    if (!cicloActivo) return
    setLoading(true)
    fetch(`/api/pedidos/ciclos/${cicloActivo.id}/exportar`)
      .then(r => r.json())
      .then(d => setGrupos(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }, [cicloActivo])

  function copiarProveedor(g: ExportGroup) {
    const urgentes = g.items.filter(i => i.urgente)
    const normales = g.items.filter(i => !i.urgente)
    const lineas = [
      `📦 *${g.nombre_proveedor}*`,
      '',
      ...urgentes.map(i => `🔴 ${i.nombre} x${i.cantidad} ${i.unidad}${i.notas ? ` (${i.notas})` : ''} — pedido por ${i.usuario}`),
      ...normales.map(i => `• ${i.nombre} x${i.cantidad} ${i.unidad}${i.notas ? ` (${i.notas})` : ''} — pedido por ${i.usuario}`),
    ]
    navigator.clipboard.writeText(lineas.join('\n'))
    setCopiado(g.nombre_proveedor)
    setTimeout(() => setCopiado(null), 2000)
  }

  if (!cicloActivo) return <p className="text-center text-[13px] text-gray-400 py-12">No hay ciclo activo</p>

  return (
    <div>
      <p className="text-[12px] text-gray-400 mb-4">
        Lista agrupada por proveedor, lista para copiar y enviar por WhatsApp.
      </p>
      {loading && <Spinner />}
      {!loading && !grupos.length && (
        <p className="text-center text-[13px] text-gray-400 py-12">No hay items en este ciclo</p>
      )}
      <div className="space-y-4">
        {grupos.map(g => (
          <div key={g.nombre_proveedor} className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <p className="text-[13px] font-bold text-[var(--text)]">📦 {g.nombre_proveedor}</p>
              <button onClick={() => copiarProveedor(g)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold cursor-pointer transition-all ${copiado === g.nombre_proveedor ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {copiado === g.nombre_proveedor ? <><IconCheck size={12} /> Copiado</> : 'Copiar'}
              </button>
            </div>
            <div className="divide-y divide-gray-50">
              {g.items.map(item => (
                <div key={item.id} className={`px-4 py-2.5 flex items-start gap-2 ${item.urgente ? 'bg-red-50' : ''}`}>
                  <span className="text-[12px] mt-0.5">{item.urgente ? '🔴' : '•'}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-[13px] font-medium">{item.nombre}</span>
                    <span className="text-[12px] text-gray-500 ml-2">x{item.cantidad} {item.unidad}</span>
                    {item.notas && <span className="text-[11px] text-gray-400 ml-1 italic">({item.notas})</span>}
                    <span className="text-[11px] text-gray-400 ml-2">— {item.usuario}</span>
                  </div>
                  <EstadoBadge estado={item.estado} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Tab: Catálogo ────────────────────────────────────────────────────────────

function TabCatalogo({ productos, proveedores, onRefresh }: {
  productos: Producto[]
  proveedores: Proveedor[]
  onRefresh: () => void
}) {
  const [busqueda, setBusqueda] = useState('')
  const [catFiltro, setCatFiltro] = useState<CatKey | 'todas'>('todas')
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState<Producto | null>(null)
  const [nombre, setNombre] = useState('')
  const [categoria, setCategoria] = useState<CatKey>('cocina')
  const [proveedorId, setProveedorId] = useState<string>('')
  const [unidad, setUnidad] = useState('unidad')
  const [guardando, setGuardando] = useState(false)

  const prodsFiltrados = productos.filter(p => {
    if (catFiltro !== 'todas' && p.categoria !== catFiltro) return false
    if (busqueda.length >= 2 && !p.nombre.toLowerCase().includes(busqueda.toLowerCase())) return false
    return true
  })

  function abrirNuevo() {
    setEditando(null); setNombre(''); setCategoria('cocina'); setProveedorId(''); setUnidad('unidad')
    setShowForm(true)
  }
  function abrirEditar(p: Producto) {
    setEditando(p); setNombre(p.nombre); setCategoria(p.categoria); setProveedorId(p.proveedor_id?.toString() ?? ''); setUnidad(p.unidad)
    setShowForm(true)
  }

  async function guardar() {
    setGuardando(true)
    const body = { nombre, categoria, proveedor_id: proveedorId ? Number(proveedorId) : null, unidad }
    if (editando) {
      await fetch(`/api/pedidos/productos/${editando.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    } else {
      await fetch('/api/pedidos/productos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    }
    setGuardando(false); setShowForm(false); onRefresh()
  }

  async function toggleActivo(p: Producto) {
    await fetch(`/api/pedidos/productos/${p.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !p.activo }),
    })
    onRefresh()
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar producto..."
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] focus:outline-none focus:border-[var(--primary)]" />
        <button onClick={abrirNuevo}
          className="flex items-center gap-1.5 px-3 py-2.5 bg-[image:var(--gradient)] text-white rounded-xl text-[13px] font-semibold cursor-pointer transition-colors">
          <IconPlus size={14} /> Nuevo
        </button>
      </div>

      {/* Filtro categorías */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4 scrollbar-none">
        <button onClick={() => setCatFiltro('todas')}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium cursor-pointer transition-colors ${catFiltro === 'todas' ? 'bg-[image:var(--gradient)] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
          Todas
        </button>
        {CATEGORIAS.map(c => (
          <button key={c.key} onClick={() => setCatFiltro(c.key)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium cursor-pointer transition-colors ${catFiltro === c.key ? 'bg-[image:var(--gradient)] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            {c.emoji} {c.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {prodsFiltrados.map(p => (
          <div key={p.id} className={`bg-white border rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm ${!p.activo ? 'opacity-50' : 'border-gray-100'}`}>
            <span className="text-[18px]">{catEmoji(p.categoria)}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold truncate">{p.nombre}</p>
              <p className="text-[11px] text-gray-400">{catLabel(p.categoria)} · {p.unidad} · {p.proveedor?.nombre ?? 'Sin proveedor'}</p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => toggleActivo(p)}
                className={`text-[10px] font-bold px-2 py-1 rounded-full border cursor-pointer transition-colors ${p.activo ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : 'bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200'}`}>
                {p.activo ? 'Activo' : 'Inactivo'}
              </button>
              <button onClick={() => abrirEditar(p)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer transition-colors">
                <IconEdit size={14} />
              </button>
            </div>
          </div>
        ))}
        {!prodsFiltrados.length && (
          <p className="text-center text-[13px] text-gray-400 py-10">Sin productos{busqueda ? ' con ese nombre' : ''}</p>
        )}
      </div>

      {showForm && createPortal(
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-bold text-[var(--text)]">{editando ? 'Editar producto' : 'Nuevo producto'}</p>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer transition-colors">
                <IconX size={18} />
              </button>
            </div>
            <div>
              <p className="text-[12px] font-medium text-gray-500 mb-2">Nombre</p>
              <input value={nombre} onChange={e => setNombre(e.target.value)}
                placeholder="Ej: Algodón"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] focus:outline-none focus:border-[var(--primary)]" />
            </div>
            <div>
              <p className="text-[12px] font-medium text-gray-500 mb-2">Categoría</p>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIAS.map(c => (
                  <button key={c.key} onClick={() => setCategoria(c.key)}
                    className={`px-2.5 py-1.5 rounded-full text-[12px] font-medium border cursor-pointer transition-all ${categoria === c.key ? 'bg-[image:var(--gradient)] text-white border-transparent' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                    {c.emoji} {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <p className="text-[12px] font-medium text-gray-500 mb-2">Proveedor</p>
                <select value={proveedorId} onChange={e => setProveedorId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] focus:outline-none focus:border-[var(--primary)]">
                  <option value="">Sin proveedor</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
              <div className="w-28">
                <p className="text-[12px] font-medium text-gray-500 mb-2">Unidad</p>
                <select value={unidad} onChange={e => setUnidad(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] focus:outline-none focus:border-[var(--primary)]">
                  {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2.5 border border-gray-200 text-gray-500 rounded-xl text-[13px] font-medium cursor-pointer hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button onClick={guardar} disabled={guardando || !nombre.trim()}
                className="flex-1 py-2.5 bg-[image:var(--gradient)] text-white rounded-xl text-[13px] font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

// ─── Tab: Ajustes ─────────────────────────────────────────────────────────────

function TabAjustes({ ciclos, onRefreshCiclos }: { ciclos: Ciclo[]; onRefreshCiclos: () => void }) {
  const [permisos, setPermisos] = useState<Permiso[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [config, setConfig] = useState<{ dias_aviso: number; hora_aviso: string; dia_cierre: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [guardandoPerm, setGuardandoPerm] = useState<string | null>(null)
  const [guardandoConf, setGuardandoConf] = useState(false)
  const [showNuevoCiclo, setShowNuevoCiclo] = useState(false)
  const [cicloCerrando, setCicloCerrando] = useState<string | null>(null)

  // Form nuevo ciclo
  const [cicloNombre, setCicloNombre] = useState('')
  const [cicloApertura, setCicloApertura] = useState('')
  const [cicloCierre, setCicloCierre] = useState('')
  const [guardandoCiclo, setGuardandoCiclo] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/pedidos/permisos').then(r => r.json()),
      fetch('/api/pedidos/config').then(r => r.json()),
    ]).then(([p, c]) => {
      setPermisos(p.permisos ?? [])
      setUsuarios(p.usuarios ?? [])
      setConfig(c)
    }).finally(() => setLoading(false))
  }, [])

  function tienePerm(userId: string, cat: string) {
    return permisos.some(p => p.usuario_id === userId && p.categoria === cat)
  }

  async function togglePerm(userId: string, cat: string) {
    setGuardandoPerm(userId)
    const actual = permisos.filter(p => p.usuario_id === userId).map(p => p.categoria)
    const nuevo = actual.includes(cat) ? actual.filter(c => c !== cat) : [...actual, cat]
    const res = await fetch('/api/pedidos/permisos', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario_id: userId, categorias: nuevo }),
    })
    if (res.ok) {
      setPermisos(prev => [
        ...prev.filter(p => p.usuario_id !== userId),
        ...nuevo.map(c => ({ usuario_id: userId, categoria: c })),
      ])
    }
    setGuardandoPerm(null)
  }

  async function guardarConfig() {
    if (!config) return
    setGuardandoConf(true)
    await fetch('/api/pedidos/config', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    setGuardandoConf(false)
  }

  async function crearCiclo() {
    setGuardandoCiclo(true)
    const res = await fetch('/api/pedidos/ciclos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: cicloNombre, fecha_apertura: cicloApertura, fecha_cierre: cicloCierre }),
    })
    setGuardandoCiclo(false)
    if (res.ok) { setShowNuevoCiclo(false); setCicloNombre(''); setCicloApertura(''); setCicloCierre(''); onRefreshCiclos() }
  }

  async function cambiarEstadoCiclo(id: string, estado: string) {
    setCicloCerrando(id)
    await fetch(`/api/pedidos/ciclos/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    })
    setCicloCerrando(null); onRefreshCiclos()
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-6">
      {/* Ciclos */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[14px] font-bold text-[var(--text)]">Ciclos de pedido</p>
          <button onClick={() => setShowNuevoCiclo(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[image:var(--gradient)] text-white rounded-xl text-[12px] font-semibold cursor-pointer transition-colors">
            <IconPlus size={12} /> Nuevo ciclo
          </button>
        </div>
        <div className="space-y-2">
          {ciclos.slice(0, 6).map(c => (
            <div key={c.id} className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold truncate">{c.nombre}</p>
                <p className="text-[11px] text-gray-400">{formatFecha(c.fecha_apertura)} → {formatFecha(c.fecha_cierre)}</p>
              </div>
              <div className="flex items-center gap-2">
                <EstadoBadge estado={c.estado} />
                {c.estado === 'abierto' && (
                  <button onClick={() => cambiarEstadoCiclo(c.id, 'cerrado')} disabled={cicloCerrando === c.id}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 cursor-pointer transition-colors disabled:opacity-40">
                    Cerrar
                  </button>
                )}
                {c.estado === 'cerrado' && (
                  <div className="flex gap-1">
                    <button onClick={() => cambiarEstadoCiclo(c.id, 'abierto')} disabled={cicloCerrando === c.id}
                      className="text-[11px] font-semibold px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 cursor-pointer transition-colors disabled:opacity-40">
                      Reabrir
                    </button>
                    <button onClick={() => cambiarEstadoCiclo(c.id, 'enviado')} disabled={cicloCerrando === c.id}
                      className="text-[11px] font-semibold px-2 py-1 rounded-lg border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 cursor-pointer transition-colors disabled:opacity-40">
                      Marcar enviado
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {!ciclos.length && (
            <p className="text-center text-[13px] text-gray-400 py-6">Todavía no hay ciclos creados</p>
          )}
        </div>
      </div>

      {/* Notificaciones */}
      {config && (
        <div>
          <p className="text-[14px] font-bold text-[var(--text)] mb-3">Recordatorio automático</p>
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="text-[12px] font-medium text-gray-500 mb-1">Días antes del cierre</p>
                <input type="number" min="0" max="7" value={config.dias_aviso}
                  onChange={e => setConfig(c => c ? { ...c, dias_aviso: Number(e.target.value) } : c)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-[var(--primary)]" />
              </div>
              <div className="flex-1">
                <p className="text-[12px] font-medium text-gray-500 mb-1">Día de cierre habitual</p>
                <select value={config.dia_cierre}
                  onChange={e => setConfig(c => c ? { ...c, dia_cierre: Number(e.target.value) } : c)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-[var(--primary)]">
                  {DIAS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
            </div>
            <button onClick={guardarConfig} disabled={guardandoConf}
              className="w-full py-2.5 bg-[image:var(--gradient)] text-white rounded-xl text-[13px] font-semibold cursor-pointer disabled:opacity-40 transition-colors">
              {guardandoConf ? 'Guardando…' : 'Guardar configuración'}
            </button>
          </div>
        </div>
      )}

      {/* Permisos por usuario */}
      <div>
        <p className="text-[14px] font-bold text-[var(--text)] mb-1">Permisos por persona</p>
        <p className="text-[12px] text-gray-400 mb-3">Elegí qué categorías puede pedir cada una cuando habilitás el acceso general.</p>
        <div className="space-y-3">
          {usuarios.map(u => (
            <div key={u.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Avatar nombre={u.nombre} foto={u.foto_perfil} size={28} />
                <p className="text-[13px] font-semibold text-[var(--text)]">{u.nombre}</p>
                {guardandoPerm === u.id && <span className="text-[11px] text-gray-400">Guardando…</span>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIAS.map(c => (
                  <button key={c.key} onClick={() => togglePerm(u.id, c.key)} disabled={guardandoPerm === u.id}
                    className={`px-2.5 py-1.5 rounded-full text-[11px] font-medium border cursor-pointer transition-all disabled:opacity-50 ${tienePerm(u.id, c.key) ? 'bg-[image:var(--gradient)] text-white border-transparent' : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}>
                    {c.emoji} {c.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal nuevo ciclo */}
      {showNuevoCiclo && createPortal(
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={() => setShowNuevoCiclo(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-bold text-[var(--text)]">Nuevo ciclo de pedido</p>
              <button onClick={() => setShowNuevoCiclo(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer transition-colors">
                <IconX size={18} />
              </button>
            </div>
            <div>
              <p className="text-[12px] font-medium text-gray-500 mb-2">Nombre</p>
              <input value={cicloNombre} onChange={e => setCicloNombre(e.target.value)}
                placeholder="Ej: Semana 28/07"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] focus:outline-none focus:border-[var(--primary)]" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <p className="text-[12px] font-medium text-gray-500 mb-2">Apertura</p>
                <input type="date" value={cicloApertura} onChange={e => setCicloApertura(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] focus:outline-none focus:border-[var(--primary)]" />
              </div>
              <div className="flex-1">
                <p className="text-[12px] font-medium text-gray-500 mb-2">Cierre</p>
                <input type="date" value={cicloCierre} onChange={e => setCicloCierre(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] focus:outline-none focus:border-[var(--primary)]" />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowNuevoCiclo(false)}
                className="px-4 py-2.5 border border-gray-200 text-gray-500 rounded-xl text-[13px] font-medium cursor-pointer hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button onClick={crearCiclo} disabled={guardandoCiclo || !cicloNombre.trim() || !cicloApertura || !cicloCierre}
                className="flex-1 py-2.5 bg-[image:var(--gradient)] text-white rounded-xl text-[13px] font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {guardandoCiclo ? 'Creando…' : 'Crear ciclo'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function PedidosClient({ session }: { session: SessionUser }) {
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'

  type Tab = 'lista' | 'exportar' | 'catalogo' | 'ajustes'
  const [tab, setTab] = useState<Tab>('lista')
  const [ciclos, setCiclos] = useState<Ciclo[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loadingBase, setLoadingBase] = useState(true)

  const cargarCiclos = useCallback(() => {
    fetch('/api/pedidos/ciclos').then(r => r.json()).then(d => setCiclos(Array.isArray(d) ? d : []))
  }, [])

  const cargarProductos = useCallback(() => {
    fetch('/api/pedidos/productos').then(r => r.json()).then(d => setProductos(Array.isArray(d) ? d : []))
  }, [])

  useEffect(() => {
    Promise.all([
      fetch('/api/pedidos/ciclos').then(r => r.json()),
      fetch('/api/pedidos/productos').then(r => r.json()),
      fetch('/api/proveedores').then(r => r.json()),
    ]).then(([c, p, pr]) => {
      setCiclos(Array.isArray(c) ? c : [])
      setProductos(Array.isArray(p) ? p : [])
      setProveedores(Array.isArray(pr) ? pr : [])
    }).finally(() => setLoadingBase(false))
  }, [])

  const cicloActivo = ciclos.find(c => c.estado === 'abierto') ?? ciclos[0] ?? null

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'lista',    label: 'Lista',    icon: IconShoppingBag },
    { key: 'exportar', label: 'Exportar', icon: IconBarChart },
    ...(isAdmin ? [
      { key: 'catalogo' as Tab, label: 'Catálogo', icon: IconChevronRight },
      { key: 'ajustes'  as Tab, label: 'Ajustes',  icon: IconSettings },
    ] : []),
  ]

  return (
    <div className="py-4 fade-in">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-[image:var(--gradient)] flex items-center justify-center flex-shrink-0 shadow-sm">
          <IconShoppingBag size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-[17px] font-bold text-[var(--text)]">Pedidos</h1>
          <p className="text-xs text-[var(--text-sub)]">Lista colaborativa de insumos</p>
        </div>
      </div>

      {loadingBase ? <Spinner /> : (
        <>
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-5">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex-1 py-2 text-[13px] font-medium rounded-[10px] cursor-pointer transition-all ${tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'lista'    && <TabLista cicloActivo={cicloActivo} productos={productos} onRefresh={cargarCiclos} />}
          {tab === 'exportar' && <TabExportar cicloActivo={cicloActivo} />}
          {tab === 'catalogo' && isAdmin && <TabCatalogo productos={productos} proveedores={proveedores} onRefresh={cargarProductos} />}
          {tab === 'ajustes'  && isAdmin && <TabAjustes ciclos={ciclos} onRefreshCiclos={cargarCiclos} />}
        </>
      )}
    </div>
  )
}
