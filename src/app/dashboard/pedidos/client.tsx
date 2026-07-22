'use client'

import { useState, useEffect, useCallback } from 'react'
import type { SessionUser } from '@/types'
import { Button, Spinner, Modal, Toast, Confirm, Select } from '@/components/ui'
import {
  IconBottle, IconShoppingBag, IconX, IconCheck, IconEdit, IconPlus, IconChevronRight, IconTrash, IconAlertCircle, IconClock,
} from '@/components/ui/Icons'

// ─── Tipos ───────────────────────────────────────────────────────────────────

type CatKey = 'cocina' | 'limpieza' | 'manicuria' | 'masajes' | 'cejas_pestanas' | 'depilacion' | 'peluqueria'

interface CatDef { key: CatKey; label: string }

const CATEGORIAS: CatDef[] = [
  { key: 'cocina',         label: 'Cocina' },
  { key: 'limpieza',       label: 'Limpieza' },
  { key: 'manicuria',      label: 'Manicuría' },
  { key: 'masajes',        label: 'Masajes' },
  { key: 'cejas_pestanas', label: 'Cejas y Pestañas' },
  { key: 'depilacion',     label: 'Depilación' },
  { key: 'peluqueria',     label: 'Peluquería' },
]

const UNIDADES = ['unidad', 'kg', 'litro', 'caja', 'pack', 'rollo', 'frasco', 'tubo', 'bidón']
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

function normalizar(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function catDef(key: string): CatDef | undefined { return CATEGORIAS.find(c => c.key === key) }
function catLabel(key: string) { return catDef(key)?.label ?? key }

function fmtCantidad(cantidad: number, unidad: string): string {
  const abbr: Record<string, string> = { unidad: 'u', litro: 'L', kg: 'kg', frasco: 'fr', tubo: 'tu' }
  const a = abbr[unidad]
  return a ? `${cantidad}${a}.` : `${cantidad} ${unidad}.`
}

interface Proveedor { id: number; nombre: string }

interface Producto {
  id: string; nombre: string; marca: string; categoria: CatKey; unidad: string
  activo: boolean; proveedor_id: number | null; proveedor: Proveedor | null
  stock_actual: number | null; stock_minimo: number | null; variantes_count: number
}

interface Variante {
  id: string; producto_id: string; nombre: string
  stock_actual: number | null; stock_minimo: number | null; activo: boolean
}

interface StockHistorial { fecha: string; stock: number }
interface StockAuditEntry { id: string; usuario_nombre: string; stock_anterior: number | null; stock_nuevo: number; created_at: string }

interface AuditoriaEntry {
  id: string; accion: string; detalle: string | null
  created_at: string; usuario_nombre: string
}

interface Ciclo {
  id: string; nombre: string; fecha_apertura: string; fecha_cierre: string
  estado: 'abierto' | 'cerrado' | 'enviado'
  cerrado_por: string | null; cerrado_en: string | null; created_at: string
}

interface Item {
  id: string; ciclo_id: string; producto_id: string | null; variante_id: string | null
  nombre_libre: string | null; cantidad: number; unidad: string; notas: string | null
  urgente: boolean; estado: 'pendiente' | 'ordenado' | 'recibido'; usuario_id: string
  usuario: { nombre: string; foto_perfil: string | null }
  producto: {
    id: string; nombre: string; marca: string; categoria: CatKey; unidad: string
    proveedor_id: number | null; proveedor: { id: number; nombre: string } | null
  } | null
  variante: { id: string; nombre: string } | null
  created_at: string
  archivado: boolean; archivado_por: string | null; archivado_en: string | null
}

interface ExportGroup {
  proveedor_id: number | null
  nombre_proveedor: string
  items: { id: string; nombre: string; marca: string | null; cantidad: number; unidad: string; notas: string | null; urgente: boolean; estado: string; usuario: string; nombre_libre: string | null; categoria: string | null }[]
}

interface Usuario { id: string; nombre: string; foto_perfil: string | null }
interface Permiso { usuario_id: string; categoria: string }

// ─── Utils ───────────────────────────────────────────────────────────────────

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

function formatCerradoEn(iso: string) {
  const d = new Date(iso)
  const dia = d.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'numeric' })
  const hora = d.toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false })
  return `${dia} a las ${hora}`
}

function formatRelativo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 60) return `hace ${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h}h`
  const d = Math.floor(h / 24)
  if (d === 1) return 'ayer'
  if (d < 7) return `hace ${d} días`
  return `hace ${Math.floor(d / 7)} sem`
}

function EstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, string> = {
    abierto: 'bg-green-50 text-green-700 border-green-200',
    cerrado: 'bg-amber-50 text-amber-600 border-amber-200',
    enviado: 'bg-blue-50 text-blue-600 border-blue-200',
  }
  const label: Record<string, string> = { abierto: 'Abierto', cerrado: 'Cerrado', enviado: 'Enviado' }
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${map[estado] ?? 'bg-gray-100 border-gray-200 text-gray-500'}`}>{label[estado] ?? estado}</span>
}

// ─── Tab: Lista ──────────────────────────────────────────────────────────────

type AddStep = 'search' | 'new' | 'config'

function TabLista({ cicloActivo, productos, proveedores, onCiclosChange, onRefreshProductos, isAdmin, myCats, myId }: {
  cicloActivo: Ciclo | null
  productos: Producto[]
  proveedores: Proveedor[]
  onCiclosChange: () => void
  onRefreshProductos: () => void
  isAdmin: boolean
  myCats: string[]
  myId: string
}) {
  const [items, setItems] = useState<Item[]>([])
  const [archivados, setArchivados] = useState<Item[]>([])
  const [showArchivados, setShowArchivados] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState<Item | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Item | null>(null)
  const [confirmRestore, setConfirmRestore] = useState<Item | null>(null)
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [editItem, setEditItem] = useState<Item | null>(null)

  // Add modal state machine
  const [addStep, setAddStep] = useState<AddStep>('search')
  const [busqueda, setBusqueda] = useState('')
  const [productoSel, setProductoSel] = useState<Producto | null>(null)
  // New product form
  const [newNombre, setNewNombre] = useState('')
  const [newMarca, setNewMarca] = useState('')
  const [newCategoria, setNewCategoria] = useState<CatKey>('cocina')
  const [newProveedorId, setNewProveedorId] = useState('')
  // Config (new + existing)
  const [provConfig, setProvConfig] = useState('')
  const [configMarca, setConfigMarca] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [unidad, setUnidad] = useState('unidad')
  const [notas, setNotas] = useState('')
  const [urgente, setUrgente] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [guardandoError, setGuardandoError] = useState('')

  // Edit modal
  const [editCantidad, setEditCantidad] = useState('1')
  const [editUnidad, setEditUnidad] = useState('unidad')
  const [editNotas, setEditNotas] = useState('')
  const [editUrgente, setEditUrgente] = useState(false)
  const [editGuardando, setEditGuardando] = useState(false)

  const cargar = useCallback(() => {
    if (!cicloActivo) return
    setLoading(true)
    fetch(`/api/pedidos/ciclos/${cicloActivo.id}/items`)
      .then(r => r.json())
      .then(d => {
        setItems(Array.isArray(d.items) ? d.items : [])
        setArchivados(Array.isArray(d.archivados) ? d.archivados : [])
      })
      .catch(() => { setItems([]); setArchivados([]) })
      .finally(() => setLoading(false))
  }, [cicloActivo])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    if (!cicloActivo) return
    const interval = setInterval(() => { cargar() }, 15000)
    return () => clearInterval(interval)
  }, [cicloActivo, cargar])

  function openAdd() {
    setShowAdd(true); setAddStep('search'); setBusqueda(''); setProductoSel(null)
    setNewNombre(''); setNewMarca(''); setNewCategoria(isAdmin ? 'cocina' : (myCats[0] as CatKey ?? 'cocina')); setNewProveedorId('')
    setProvConfig(''); setConfigMarca(''); setCantidad('1'); setUnidad('unidad'); setNotas(''); setUrgente(false)
    setGuardandoError('')
  }

  function selectProducto(p: Producto) {
    setProductoSel(p)
    setUnidad(p.unidad)
    setProvConfig(p.proveedor_id?.toString() ?? '')
    setConfigMarca(p.marca && p.marca !== 'Sin marca' ? p.marca : '')
    setAddStep('config')
  }

  function goToNew() {
    setNewNombre(busqueda.trim())
    setNewMarca('')
    setNewCategoria('cocina')
    setNewProveedorId('')
    setCantidad('1'); setUnidad('unidad'); setNotas(''); setUrgente(false)
    setAddStep('new')
  }

  const prodsFiltrados = productos
    .filter(p => p.activo
      && (isAdmin || myCats.includes(p.categoria))
      && (busqueda.length < 2 || normalizar(p.nombre).includes(normalizar(busqueda))))
    .slice(0, 10)

  const duplicado = productoSel ? items.find(i => i.producto_id === productoSel.id) : null

  async function agregarExistente() {
    if (!cicloActivo || !productoSel) return
    const needsProv = !productoSel.proveedor_id && !provConfig
    if (needsProv) { setGuardandoError('Elegí un proveedor antes de agregar.'); return }
    setGuardando(true); setGuardandoError('')

    // Siempre pisar proveedor, marca y unidad en el catálogo
    const patchBody: Record<string, unknown> = { unidad }
    if (provConfig) patchBody.proveedor_id = Number(provConfig)
    if (configMarca.trim()) patchBody.marca = configMarca.trim()
    fetch(`/api/pedidos/productos/${productoSel.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patchBody),
    }).then(() => onRefreshProductos())

    const res = await fetch(`/api/pedidos/ciclos/${cicloActivo.id}/items`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ producto_id: productoSel.id, cantidad: Number(cantidad), unidad, notas: notas || null, urgente }),
    })
    setGuardando(false)
    if (res.ok) { setShowAdd(false); cargar() }
    else setGuardandoError('Error al agregar. Intentá de nuevo.')
  }

  async function agregarNuevo() {
    if (!cicloActivo || !newNombre.trim() || !newProveedorId) return
    setGuardando(true); setGuardandoError('')

    const prodRes = await fetch('/api/pedidos/productos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: newNombre.trim(), marca: newMarca.trim() || 'Sin marca', categoria: newCategoria, proveedor_id: Number(newProveedorId), unidad }),
    })
    if (!prodRes.ok) { setGuardando(false); setGuardandoError('Error al crear el producto.'); return }
    const newProd = await prodRes.json()

    const itemRes = await fetch(`/api/pedidos/ciclos/${cicloActivo.id}/items`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ producto_id: newProd.id, cantidad: Number(cantidad), unidad, notas: notas || null, urgente }),
    })
    setGuardando(false)
    if (itemRes.ok) { setShowAdd(false); cargar(); onRefreshProductos() }
    else setGuardandoError('Error al agregar el ítem.')
  }

  async function guardarEdicion() {
    if (!editItem || !cicloActivo) return
    setEditGuardando(true)
    await fetch(`/api/pedidos/ciclos/${cicloActivo.id}/items/${editItem.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cantidad: Number(editCantidad), unidad: editUnidad, notas: editNotas || null, urgente: editUrgente }),
    })
    // Pisar la unidad en el catálogo si cambió
    if (editItem.producto_id && editUnidad !== editItem.unidad) {
      fetch(`/api/pedidos/productos/${editItem.producto_id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unidad: editUnidad }),
      }).then(() => onRefreshProductos())
    }
    setEditGuardando(false); setEditItem(null); cargar()
  }

  async function archivarItem(id: string) {
    if (!cicloActivo) return
    await fetch(`/api/pedidos/ciclos/${cicloActivo.id}/items/${id}`, { method: 'DELETE' })
    setConfirmArchive(null)
    cargar()
  }

  async function eliminarDefinitivo(id: string) {
    if (!cicloActivo) return
    await fetch(`/api/pedidos/ciclos/${cicloActivo.id}/items/${id}?permanente=true`, { method: 'DELETE' })
    setConfirmDelete(null)
    cargar()
  }

  async function restaurarItem(item: Item) {
    await fetch(`/api/pedidos/ciclos/${item.ciclo_id}/items/${item.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archivado: false }),
    })
    setConfirmRestore(null)
    cargar()
  }

  // Agrupar: proveedor → categoría → items
  const grouped: { prov: string; cats: { cat: string; items: Item[] }[] }[] = []
  const mapProv: Record<string, Record<string, Item[]>> = {}
  for (const item of items) {
    const prov = item.producto?.proveedor?.nombre ?? 'Sin proveedor'
    const cat = item.producto?.categoria ?? 'sin_categoria'
    if (!mapProv[prov]) mapProv[prov] = {}
    if (!mapProv[prov][cat]) mapProv[prov][cat] = []
    mapProv[prov][cat].push(item)
  }
  const provKeys = Object.keys(mapProv).sort((a, b) => {
    if (a === 'Sin proveedor') return 1
    if (b === 'Sin proveedor') return -1
    return a.localeCompare(b)
  })
  for (const prov of provKeys) {
    const cats = Object.entries(mapProv[prov])
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cat, catItems]) => ({ cat, items: catItems }))
    grouped.push({ prov, cats })
  }

  if (!cicloActivo) return <p className="text-center text-[13px] text-gray-400 py-12">No hay lista activa</p>

  return (
    <div>
      {cicloActivo.estado !== 'abierto' && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 mb-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] text-amber-700 font-semibold">Lista cerrada</p>
            {isAdmin && (
              <Button size="sm" variant="secondary" onClick={async () => {
                await fetch(`/api/pedidos/ciclos/${cicloActivo.id}`, {
                  method: 'PUT', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ estado: 'abierto' }),
                })
                onCiclosChange()
              }}>Reabrir</Button>
            )}
          </div>
          {cicloActivo.cerrado_por && cicloActivo.cerrado_en && (
            <p className="text-[11px] text-amber-600 mt-1">
              Cerrado por <span className="font-medium">{cicloActivo.cerrado_por}</span> el {formatCerradoEn(cicloActivo.cerrado_en)}
            </p>
          )}
        </div>
      )}

      {cicloActivo.estado === 'abierto' && (
        <button onClick={openAdd}
          className="w-full flex items-center justify-center gap-2 py-3 mb-4 border-2 border-dashed border-[var(--primary)]/40 text-[var(--primary)] rounded-xl text-[13px] font-semibold cursor-pointer hover:bg-[var(--primary)]/5 transition-colors">
          <IconPlus size={16} /> Agregar producto
        </button>
      )}

      {loading && <Spinner />}

      {!loading && !items.length && (
        <p className="text-center text-[13px] text-gray-400 py-10">La lista está vacía</p>
      )}

      {!loading && grouped.length > 0 && (
        <div className="space-y-5">
          {grouped.map(({ prov, cats }) => (
            <div key={prov}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <IconShoppingBag size={13} className="text-[var(--primary)] flex-shrink-0" />
                <p className="text-[12px] font-bold text-[var(--text)] uppercase tracking-wide">{prov}</p>
                <span className="text-[10px] text-[var(--text-muted)]">({cats.reduce((n, c) => n + c.items.length, 0)})</span>
              </div>
              <div className="pl-4 border-l-2 border-gray-100 space-y-3">
                {cats.map(({ cat, items: catItems }) => (
                  <div key={cat}>
                    <div className="flex items-center gap-1.5 mb-1 text-[var(--text-muted)]">
                      <p className="text-[10px] font-bold uppercase tracking-wider">{catLabel(cat)}</p>
                    </div>
                    <div>
                      {catItems.map(item => (
                        <ItemRow
                          key={item.id}
                          item={item}
                          cicloAbierto={cicloActivo.estado === 'abierto'}
                          isAdmin={isAdmin}
                          myId={myId}
                          onEdit={() => {
                            setEditItem(item)
                            setEditCantidad(String(item.cantidad))
                            setEditUnidad(item.unidad)
                            setEditNotas(item.notas ?? '')
                            setEditUrgente(item.urgente)
                          }}
                          onArchive={() => setConfirmArchive(item)}
                          onDelete={() => setConfirmDelete(item)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {archivados.length > 0 && (
        <div className="mt-6">
          <button onClick={() => setShowArchivados(v => !v)}
            className="flex items-center gap-2 py-1.5 text-[12px] text-[var(--text-muted)] font-medium hover:text-[var(--text)] cursor-pointer transition-colors">
            <IconChevronRight size={12} className={`transition-transform duration-200 ${showArchivados ? 'rotate-90' : ''}`} />
            Archivados ({archivados.length})
          </button>
          {showArchivados && (
            <div className="mt-2 space-y-0.5 pl-4 border-l-2 border-gray-100">
              {archivados.map(item => (
                <div key={item.id} className="px-2 py-2 rounded-lg flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-200 flex-shrink-0 mt-0.5" />
                      <span className="text-[12px] text-[var(--text-muted)] line-through">
                        {item.producto?.nombre ?? item.nombre_libre ?? 'Ítem'}
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)]">{fmtCantidad(item.cantidad, item.unidad)}</span>
                    </div>
                    <p className="pl-3.5 mt-0.5 text-[10px] text-[var(--text-muted)]">
                      Cargado por <span className="font-medium">{item.usuario.nombre}</span>
                      {item.archivado_por && <> · Archivado por <span className="font-medium">{item.archivado_por}</span></>}
                      {item.archivado_en && <> el {formatCerradoEn(item.archivado_en)}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => setConfirmRestore(item)}
                      className={`px-2 py-1 rounded-lg text-[11px] font-medium cursor-pointer transition-colors ${item.estado === 'ordenado' ? 'bg-orange-50 text-orange-700 hover:bg-orange-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {item.estado === 'ordenado' ? 'No llegó' : 'Restaurar'}
                    </button>
                    {isAdmin && (
                      <button onClick={() => setConfirmDelete(item)} title="Eliminar definitivo"
                        className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 cursor-pointer transition-colors">
                        <IconTrash size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal agregar */}
      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title={addStep === 'new' ? 'Nuevo producto' : 'Agregar a la lista'}
        footer={
          addStep === 'config' ? (
            <>
              <Button variant="secondary" onClick={() => setAddStep('search')}>Volver</Button>
              <Button className="flex-1" onClick={agregarExistente} loading={guardando}
                disabled={!cantidad || Number(cantidad) <= 0 || (!productoSel?.proveedor_id && !provConfig)}>
                Agregar
              </Button>
            </>
          ) : addStep === 'new' ? (
            <>
              <Button variant="secondary" onClick={() => setAddStep('search')}>Volver</Button>
              <Button className="flex-1" onClick={agregarNuevo} loading={guardando}
                disabled={!newNombre.trim() || !newProveedorId || !cantidad || Number(cantidad) <= 0 || !newMarca.trim()}>
                Crear y agregar
              </Button>
            </>
          ) : undefined
        }
      >
        {/* Step: search */}
        {addStep === 'search' && (
          <div>
            <p className="text-[12px] font-medium text-[var(--text-sub)] mb-2">Buscar en catálogo</p>
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Ej: algodón, lavandina…"
              autoFocus
              className="w-full border border-[var(--border)] rounded-xl px-3 py-2.5 text-[13px] focus:outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)]"
            />
            {busqueda.length >= 2 && (
              <div className="mt-2 space-y-0.5 max-h-52 overflow-y-auto">
                {prodsFiltrados.map(p => (
                  <button key={p.id} onClick={() => selectProducto(p)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-gray-50 cursor-pointer transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium truncate">{p.nombre} <span className="font-normal text-[var(--text-muted)]">· {p.marca}</span></p>
                      <p className="text-[11px] text-[var(--text-muted)]">{catLabel(p.categoria)} · {p.proveedor?.nombre ?? <span className="text-amber-500">Sin proveedor</span>}</p>
                    </div>
                  </button>
                ))}
                <button onClick={goToNew}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-[13px] text-[var(--primary)] font-medium hover:bg-[var(--primary)]/5 cursor-pointer transition-colors">
                  <IconPlus size={14} /> {prodsFiltrados.length ? `No es ninguno — agregar "${busqueda}" como nuevo` : `Agregar "${busqueda}" como nuevo producto`}
                </button>
              </div>
            )}
            {busqueda.length < 2 && (
              <p className="text-[12px] text-[var(--text-muted)] mt-3">Escribí al menos 2 letras para buscar</p>
            )}
          </div>
        )}

        {/* Step: new product */}
        {addStep === 'new' && (
          <>
            <div>
              <p className="text-[12px] font-medium text-[var(--text-sub)] mb-2">Nombre *</p>
              <input value={newNombre} onChange={e => setNewNombre(e.target.value)} placeholder="Ej: Algodón"
                className="w-full border border-[var(--border)] rounded-xl px-3 py-2.5 text-[13px] focus:outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)]" />
            </div>
            <MarcaInput value={newMarca} onChange={setNewMarca} productos={productos} />
            <Select label="Categoría" value={newCategoria} onChange={v => setNewCategoria(v as CatKey)}>
              {(isAdmin ? CATEGORIAS : CATEGORIAS.filter(c => myCats.includes(c.key))).map(c => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </Select>
            <Select label="Proveedor *" value={newProveedorId} onChange={setNewProveedorId}>
              <option value="">— Elegí un proveedor —</option>
              {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </Select>
            <div className="flex gap-3">
              <Select label="Unidad" value={unidad} onChange={setUnidad} className="flex-1">
                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
              </Select>
              <div className="flex-1">
                <p className="text-[12px] font-medium text-[var(--text-sub)] mb-1.5">Cantidad</p>
                <input type="number" min="0.1" step="0.5" value={cantidad} onChange={e => setCantidad(e.target.value)}
                  className="w-full border border-[var(--border)] rounded-xl px-3 h-11 text-[13px] text-center font-semibold focus:outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)]" />
              </div>
            </div>
            <div>
              <p className="text-[12px] font-medium text-[var(--text-sub)] mb-1.5">Notas (opcional)</p>
              <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Ej: marca específica, color, etc."
                className="w-full border border-[var(--border)] rounded-xl px-3 py-2.5 text-[13px] focus:outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)]" />
            </div>
            <UrgenteToggle value={urgente} onChange={setUrgente} />
            {guardandoError && <p className="text-[12px] text-red-500">{guardandoError}</p>}
          </>
        )}

        {/* Step: configure existing */}
        {addStep === 'config' && productoSel && (
          <>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-[var(--border)]">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold truncate">{productoSel.nombre}</p>
                <p className="text-[11px] text-[var(--text-muted)]">{catLabel(productoSel.categoria)}</p>
              </div>
              <button onClick={() => setAddStep('search')} className="p-1 text-gray-400 hover:text-gray-700 cursor-pointer rounded-lg">
                <IconX size={14} />
              </button>
            </div>

            {!productoSel.proveedor_id && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-[12px] font-semibold text-amber-700 mb-2">Este producto no tiene proveedor asignado. ¿A cuál se lo pedimos?</p>
                <Select value={provConfig} onChange={setProvConfig}>
                  <option value="">— Elegí un proveedor —</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </Select>
                {provConfig && <p className="text-[11px] text-amber-600 mt-1.5">Se guardará en el catálogo para la próxima vez.</p>}
              </div>
            )}

            {(!productoSel.marca || productoSel.marca === 'Sin marca') && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-[12px] font-semibold text-amber-700 mb-2">¿Qué marca es?</p>
                <MarcaInput value={configMarca} onChange={setConfigMarca} productos={productos} label="" />
                {configMarca && configMarca !== 'Sin marca' && (
                  <p className="text-[11px] text-amber-600 mt-1.5">Se guardará en el catálogo para la próxima vez.</p>
                )}
              </div>
            )}

            {duplicado && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-[12px] text-amber-700">
                  Ya fue pedido por <span className="font-semibold">{duplicado.usuario.nombre}</span>. Podés agregar igual o editar el ítem existente.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <div className="flex-1">
                <p className="text-[12px] font-medium text-[var(--text-sub)] mb-1.5">Cantidad</p>
                <input type="number" min="0.1" step="0.5" value={cantidad} onChange={e => setCantidad(e.target.value)}
                  className="w-full border border-[var(--border)] rounded-xl px-3 h-11 text-[13px] text-center font-semibold focus:outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)]" />
              </div>
              <Select label="Unidad" value={unidad} onChange={setUnidad} className="flex-1">
                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
              </Select>
            </div>

            <div>
              <p className="text-[12px] font-medium text-[var(--text-sub)] mb-1.5">Notas (opcional)</p>
              <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Ej: si no hay marca X, pedir marca Y"
                className="w-full border border-[var(--border)] rounded-xl px-3 py-2.5 text-[13px] focus:outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)]" />
            </div>

            <UrgenteToggle value={urgente} onChange={setUrgente} />
            {guardandoError && <p className="text-[12px] text-red-500">{guardandoError}</p>}
          </>
        )}
      </Modal>

      <Confirm
        open={!!confirmArchive}
        title="¿Archivás este ítem?"
        message={`"${confirmArchive?.producto?.nombre ?? confirmArchive?.nombre_libre ?? 'Ítem'}" pasará a la lista de archivados. Quedará registrado quién lo cargó y quién lo archivó.`}
        confirmLabel="Archivar"
        onConfirm={() => confirmArchive && archivarItem(confirmArchive.id)}
        onClose={() => setConfirmArchive(null)}
      />
      <Confirm
        open={!!confirmDelete}
        title="¿Eliminás definitivamente?"
        message={`"${confirmDelete?.producto?.nombre ?? confirmDelete?.nombre_libre ?? 'Ítem'}" se borrará para siempre. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        danger
        onConfirm={() => confirmDelete && eliminarDefinitivo(confirmDelete.id)}
        onClose={() => setConfirmDelete(null)}
      />
      <Confirm
        open={!!confirmRestore}
        title={confirmRestore?.estado === 'ordenado' ? '¿Marcás como faltante?' : '¿Restaurás este ítem?'}
        message={`"${confirmRestore?.producto?.nombre ?? confirmRestore?.nombre_libre ?? 'Ítem'}" volverá a la lista activa como pendiente.`}
        confirmLabel={confirmRestore?.estado === 'ordenado' ? 'Sí, no llegó' : 'Restaurar'}
        onConfirm={() => confirmRestore && restaurarItem(confirmRestore)}
        onClose={() => setConfirmRestore(null)}
      />

      {/* Modal editar */}
      <Modal
        open={!!editItem}
        onClose={() => setEditItem(null)}
        title="Editar ítem"
        footer={
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setEditItem(null)}>Cancelar</Button>
            <Button className="flex-1" onClick={guardarEdicion} loading={editGuardando}>Guardar</Button>
          </>
        }
      >
        <p className="text-[14px] font-semibold text-[var(--text)]">{editItem?.producto?.nombre ?? editItem?.nombre_libre}</p>
        <div className="flex gap-3">
          <div className="flex-1">
            <p className="text-[12px] font-medium text-[var(--text-sub)] mb-1.5">Cantidad</p>
            <input type="number" min="0.1" step="0.5" value={editCantidad} onChange={e => setEditCantidad(e.target.value)}
              className="w-full border border-[var(--border)] rounded-xl px-3 h-11 text-[13px] text-center font-semibold focus:outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)]" />
          </div>
          <Select label="Unidad" value={editUnidad} onChange={setEditUnidad} className="flex-1">
            {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
          </Select>
        </div>
        <div>
          <p className="text-[12px] font-medium text-[var(--text-sub)] mb-1.5">Notas</p>
          <input value={editNotas} onChange={e => setEditNotas(e.target.value)}
            className="w-full border border-[var(--border)] rounded-xl px-3 py-2.5 text-[13px] focus:outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)]" />
        </div>
        <UrgenteToggle value={editUrgente} onChange={setEditUrgente} />
      </Modal>
    </div>
  )
}

function MarcaInput({ value, onChange, productos, label = 'Marca' }: {
  value: string; onChange: (v: string) => void; productos: Producto[]; label?: string
}) {
  const [showSugs, setShowSugs] = useState(false)
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState('')
  const marcas = [...new Set(productos.map(p => p.marca).filter(m => m && m !== 'Sin marca'))].sort() as string[]
  const filtradas = draft.length >= 1
    ? marcas.filter(m => normalizar(m).includes(normalizar(draft)))
    : marcas
  const esNueva = draft.trim() && !marcas.map(normalizar).includes(normalizar(draft.trim()))
  const isSinMarca = !value || value === 'Sin marca'

  function handleFocus() {
    setFocused(true)
    setDraft(isSinMarca ? '' : value)
    setShowSugs(true)
  }

  function handleBlur() {
    setTimeout(() => {
      setFocused(false)
      setShowSugs(false)
      if (!draft.trim()) onChange('Sin marca')
    }, 150)
  }

  function select(m: string) {
    onChange(m)
    setDraft(m === 'Sin marca' ? '' : m)
    setShowSugs(false)
  }

  const displayValue = focused ? draft : (isSinMarca ? '' : value)

  return (
    <div className="relative">
      <p className="text-[12px] font-medium text-[var(--text-sub)] mb-1.5">{label}</p>
      <input
        value={displayValue}
        onChange={e => { setDraft(e.target.value); onChange(e.target.value.trim() || 'Sin marca'); setShowSugs(true) }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder="Sin marca"
        className={`w-full border border-[var(--border)] rounded-xl px-3 py-2.5 text-[13px] focus:outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)] ${!focused && isSinMarca ? 'text-[var(--text-muted)] placeholder:not-italic' : ''}`}
      />
      {showSugs && (filtradas.length > 0 || esNueva) && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-[var(--border)] rounded-xl shadow-lg overflow-hidden max-h-44 overflow-y-auto">
          {filtradas.map(m => (
            <button key={m} onMouseDown={() => select(m)}
              className="w-full px-3 py-2 text-left text-[13px] hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0">
              {m}
            </button>
          ))}
          {esNueva && (
            <button onMouseDown={() => select(draft.trim())}
              className="w-full px-3 py-2 text-left text-[13px] text-[var(--primary)] font-medium hover:bg-[var(--primary)]/5 cursor-pointer border-t border-gray-100">
              Agregar "{draft.trim()}"
            </button>
          )}
          <button onMouseDown={() => select('Sin marca')}
            className="w-full px-3 py-2 text-left text-[12px] text-[var(--text-muted)] italic hover:bg-gray-50 cursor-pointer border-t border-gray-100">
            Sin marca
          </button>
        </div>
      )}
      {showSugs && filtradas.length === 0 && !esNueva && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-[var(--border)] rounded-xl shadow-lg overflow-hidden">
          <button onMouseDown={() => select('Sin marca')}
            className="w-full px-3 py-2 text-left text-[12px] text-[var(--text-muted)] italic hover:bg-gray-50 cursor-pointer">
            Sin marca
          </button>
        </div>
      )}
    </div>
  )
}

function Sparkline({ data, width = 56, height = 22 }: { data: number[]; width?: number; height?: number }) {
  if (!data || data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max === min ? 1 : max - min
  const pad = 2
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2)
    const y = pad + (1 - (v - min) / range) * (height - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const last = pts[pts.length - 1].split(',')
  return (
    <svg width={width} height={height} className="flex-shrink-0">
      <polyline points={pts.join(' ')} fill="none" stroke="var(--primary)" strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round" opacity="0.7" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill="var(--primary)" />
    </svg>
  )
}

function StockInput({ id, value, onChange, onSave, unidad, minimo, guardando, historial }: {
  id: string; value: string; onChange: (v: string) => void; onSave: (v: string) => void
  unidad: string; minimo: number | null | undefined; guardando: boolean
  historial: StockHistorial[] | undefined; onLoadHistorial: () => void
}) {
  const isLow = minimo != null && value !== '' && !isNaN(Number(value)) && Number(value) <= minimo

  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      {historial && historial.length >= 2 && (
        <Sparkline data={historial.map(h => h.stock)} />
      )}
      {isLow && <IconAlertCircle size={13} className="text-amber-500 flex-shrink-0" />}
      <input
        type="number" min="0" step="1" value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={e => { if (e.target.value !== '') onSave(e.target.value) }}
        onKeyDown={e => { if (e.key === 'Enter') { onSave(value); (e.target as HTMLInputElement).blur() } }}
        placeholder="—" disabled={guardando}
        className={`w-14 text-center text-[13px] font-semibold border rounded-lg h-8 focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary-light)] transition-colors disabled:opacity-50 ${isLow ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-[var(--border)] bg-white'}`}
      />
      <span className="text-[11px] text-[var(--text-muted)]">{unidad.slice(0, 3)}</span>
    </div>
  )
}

function UrgenteToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      className={`w-full flex items-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold border cursor-pointer transition-all ${value ? 'bg-red-50 border-red-300 text-red-600' : 'border-[var(--border)] text-[var(--text-sub)] hover:bg-gray-50'}`}>
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${value ? 'bg-red-500' : 'bg-gray-300'}`} />
      {value ? 'Urgente activado' : 'Marcar como urgente'}
    </button>
  )
}

function ItemRow({ item, cicloAbierto, isAdmin, myId, onEdit, onArchive, onDelete }: {
  item: Item; cicloAbierto: boolean; isAdmin: boolean; myId: string
  onEdit: () => void; onArchive: () => void; onDelete: () => void
}) {
  const canEdit = isAdmin || item.usuario_id === myId
  const [showLog, setShowLog] = useState(false)
  const [log, setLog] = useState<AuditoriaEntry[] | null>(null)

  async function toggleLog() {
    if (!log) {
      const data = await fetch(`/api/pedidos/auditoria?item_id=${item.id}`).then(r => r.json()).catch(() => [])
      setLog(Array.isArray(data) ? data : [])
    }
    setShowLog(v => !v)
  }

  const nombreProducto = item.producto?.nombre ?? item.nombre_libre ?? 'Ítem'
  const subNombre = item.variante
    ? item.variante.nombre
    : item.producto?.marca && item.producto.marca !== 'Sin marca'
      ? item.producto.marca
      : null

  return (
    <div className={`rounded-lg ${item.urgente ? 'bg-red-50' : 'hover:bg-gray-50'} transition-colors`}>
      <div className="flex items-center gap-2 px-2 py-1.5">
        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.urgente ? 'bg-red-500' : 'bg-gray-200'}`} />
        <div className="flex-1 min-w-0">
          <span className={`text-[13px] ${item.urgente ? 'font-semibold text-red-700' : 'text-[var(--text)]'}`}>
            {nombreProducto}
            {subNombre && (
              <span className={`text-[11px] font-normal ml-1 ${item.urgente ? 'text-red-500/70' : 'text-[var(--text-muted)]'}`}>· {subNombre}</span>
            )}
          </span>
          <span className="text-[11px] text-[var(--text-muted)] ml-2">{fmtCantidad(item.cantidad, item.unidad)}</span>
          {item.urgente && <span className="ml-2 text-[9px] font-bold text-red-500 uppercase tracking-wide">urgente</span>}
          {item.notas && <span className="text-[11px] text-[var(--text-muted)] ml-2 italic">· {item.notas}</span>}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-[var(--text-muted)]">{item.usuario.nombre.split(' ')[0]}</span>
          {isAdmin && (
            <button onClick={toggleLog} title="Ver historial" className={`p-1 rounded cursor-pointer transition-colors text-[10px] font-mono ${showLog ? 'text-[var(--primary)]' : 'text-gray-300 hover:text-gray-500'}`}>···</button>
          )}
          {cicloAbierto && canEdit && (
            <div className="flex gap-0.5 ml-0.5">
              <button onClick={onEdit} title="Editar" className="p-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer transition-colors"><IconEdit size={12} /></button>
              <button onClick={onArchive} title="Archivar" className="p-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 cursor-pointer transition-colors"><IconX size={12} /></button>
              {isAdmin && <button onClick={onDelete} title="Eliminar definitivo" className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 cursor-pointer transition-colors"><IconTrash size={12} /></button>}
            </div>
          )}
        </div>
      </div>
      {showLog && (
        <div className="px-5 pb-2 space-y-0.5">
          {!log && <p className="text-[10px] text-[var(--text-muted)]">Cargando…</p>}
          {log?.map(e => (
            <p key={e.id} className="text-[10px] text-[var(--text-muted)]">
              <span className="font-semibold">{e.usuario_nombre}</span> {e.accion}
              {e.detalle ? <span> · {e.detalle}</span> : null}
              <span className="opacity-60"> · {formatRelativo(e.created_at)}</span>
            </p>
          ))}
          {log?.length === 0 && <p className="text-[10px] text-[var(--text-muted)] italic">Sin actividad registrada</p>}
        </div>
      )}
    </div>
  )
}

// ─── Tab: Enviados ───────────────────────────────────────────────────────────

type EnvioItem = {
  id: string; ciclo_id: string; nombre: string; marca: string | null
  cantidad: number; unidad: string; estado: string; notas: string | null
  urgente: boolean; usuario: string; producto_id: string | null
}
type EnvioGroup = { fecha: string; proveedor_id: number | null; proveedor_nombre: string; items: EnvioItem[] }

function TabEnviados({ cicloActivo, isAdmin }: { cicloActivo: Ciclo | null; isAdmin: boolean }) {
  const [grupos, setGrupos] = useState<EnvioGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [procesando, setProcesando] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000)
  }

  const cargar = useCallback(() => {
    setLoading(true)
    fetch('/api/pedidos/enviados')
      .then(r => r.json())
      .then(d => setGrupos(Array.isArray(d) ? d : []))
      .catch(() => setGrupos([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { cargar() }, [cargar])

  async function marcarFaltante(item: EnvioItem) {
    setProcesando(item.id)
    // 1. Mark the sent item as 'faltante'
    await fetch(`/api/pedidos/ciclos/${item.ciclo_id}/items/${item.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: 'faltante' }),
    })
    // 2. Re-add to active cycle if one exists
    if (cicloActivo) {
      await fetch(`/api/pedidos/ciclos/${cicloActivo.id}/items`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          producto_id: item.producto_id ?? undefined,
          nombre_libre: item.producto_id ? undefined : item.nombre,
          cantidad: item.cantidad,
          unidad: item.unidad,
          notas: item.notas,
          urgente: item.urgente,
        }),
      })
    }
    setProcesando(null)
    showToast('Ítem vuelto a la lista activa')
    cargar()
  }

  function formatFechaEnvio(iso: string) {
    if (iso === 'sin_fecha') return 'Fecha desconocida'
    const [y, m, d] = iso.split('-')
    return `${parseInt(d)}/${parseInt(m)}/${y}`
  }

  if (loading) return <Spinner />

  return (
    <div>
      <Toast message={toast?.msg ?? ''} visible={!!toast} type={toast?.type} />
      {!grupos.length && <p className="text-center text-[13px] text-gray-400 py-12">No hay pedidos enviados</p>}
      <div className="space-y-5">
        {grupos.map(g => {
          const key = `${g.fecha}__${g.proveedor_id ?? 'null'}`
          return (
            <div key={key} className="bg-white border border-[var(--border)] rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
                <IconShoppingBag size={13} className="text-[var(--primary)] flex-shrink-0" />
                <p className="text-[13px] font-bold text-[var(--text)] flex-1">{g.proveedor_nombre}</p>
                <span className="text-[11px] text-[var(--text-muted)]">{formatFechaEnvio(g.fecha)}</span>
              </div>
              <div className="divide-y divide-gray-50 px-4">
                {g.items.map(item => (
                  <div key={item.id} className={`py-2.5 flex items-center gap-2 ${item.estado === 'faltante' ? 'opacity-60' : ''}`}>
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.urgente ? 'bg-red-500' : 'bg-gray-300'}`} />
                    <div className="flex-1 min-w-0">
                      <span className={`text-[13px] font-medium ${item.estado === 'faltante' ? 'line-through text-orange-600' : ''}`}>
                        {item.nombre}
                        {item.marca && item.marca !== 'Sin marca' && (
                          <span className="text-[11px] font-normal text-[var(--text-muted)] ml-1">· {item.marca}</span>
                        )}
                      </span>
                      <span className="text-[12px] text-[var(--text-muted)] ml-2">{fmtCantidad(item.cantidad, item.unidad)}</span>
                      {item.estado === 'faltante' && (
                        <span className="ml-2 text-[10px] font-bold text-orange-500 uppercase">no llegó</span>
                      )}
                    </div>
                    <span className="text-[11px] text-[var(--text-muted)]">{item.usuario}</span>
                    {item.estado === 'ordenado' && (
                      <button
                        onClick={() => marcarFaltante(item)}
                        disabled={procesando === item.id}
                        className="flex-shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200 cursor-pointer transition-colors disabled:opacity-50">
                        {procesando === item.id ? '...' : 'No llegó'}
                      </button>
                    )}
                    {item.estado === 'faltante' && isAdmin && (
                      <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-600">Faltante</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Tab: Exportar ───────────────────────────────────────────────────────────

function TabExportar({ cicloActivo, onCiclosChange }: {
  cicloActivo: Ciclo | null; onCiclosChange: () => void
}) {
  const [grupos, setGrupos] = useState<ExportGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [copiado, setCopiado] = useState<string | null>(null)
  const [confirmEnviar, setConfirmEnviar] = useState<ExportGroup | null>(null)
  const [enviando, setEnviando] = useState<string | null>(null)

  const cargar = useCallback(() => {
    if (!cicloActivo) return
    setLoading(true)
    fetch(`/api/pedidos/ciclos/${cicloActivo.id}/exportar`)
      .then(r => r.json())
      .then(d => setGrupos(Array.isArray(d) ? d : []))
      .catch(() => setGrupos([]))
      .finally(() => setLoading(false))
  }, [cicloActivo])

  useEffect(() => { cargar() }, [cargar])

  function copiarProveedor(g: ExportGroup) {
    const urgentes = g.items.filter(i => i.urgente)
    const normales = g.items.filter(i => !i.urgente)
    const fmt = (i: ExportGroup['items'][number]) => {
      const marca = i.marca && i.marca !== 'Sin marca' ? ` (${i.marca})` : ''
      return `- ${fmtCantidad(i.cantidad, i.unidad)} ${i.nombre}${marca}`
    }
    const lineas = [...urgentes.map(fmt), ...normales.map(fmt)]
    navigator.clipboard.writeText(lineas.join('\n'))
    setCopiado(g.nombre_proveedor)
    setTimeout(() => setCopiado(null), 2000)
  }

  async function enviarProveedor(g: ExportGroup) {
    if (!cicloActivo) return
    setEnviando(g.nombre_proveedor)
    await fetch(`/api/pedidos/ciclos/${cicloActivo.id}/cerrar-proveedor`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proveedor_id: g.proveedor_id }),
    })
    setEnviando(null); setConfirmEnviar(null)
    cargar(); onCiclosChange()
  }

  if (!cicloActivo) return <p className="text-center text-[13px] text-gray-400 py-12">No hay lista activa</p>

  return (
    <div>
      <p className="text-[12px] text-[var(--text-muted)] mb-4">
        Copiá la lista de cada proveedor y pegala en WhatsApp. Al enviar, esos ítems desaparecen de la lista activa.
      </p>

      {loading && <Spinner />}
      {!loading && !grupos.length && <p className="text-center text-[13px] text-gray-400 py-12">No hay ítems pendientes</p>}

      <div className="space-y-4">
        {grupos.map(g => (
          <div key={g.nombre_proveedor} className="bg-white border border-[var(--border)] rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <IconShoppingBag size={14} className="text-[var(--primary)]" />
                <p className="text-[13px] font-bold text-[var(--text)]">{g.nombre_proveedor}</p>
                <span className="text-[11px] text-[var(--text-muted)]">({g.items.length})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => copiarProveedor(g)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold cursor-pointer transition-all ${copiado === g.nombre_proveedor ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {copiado === g.nombre_proveedor ? <><IconCheck size={12} /> Copiado</> : 'Copiar'}
                </button>
                {cicloActivo.estado === 'abierto' && (
                  <button onClick={() => setConfirmEnviar(g)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold bg-[var(--primary)] text-white cursor-pointer hover:opacity-90 transition-opacity">
                    Enviar
                  </button>
                )}
              </div>
            </div>
            <div className="divide-y divide-gray-50 px-4">
              {g.items.map(item => (
                <div key={item.id} className={`py-2.5 flex items-center gap-2 ${item.urgente ? 'text-red-700' : ''}`}>
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.urgente ? 'bg-red-500' : 'bg-gray-300'}`} />
                  <span className="text-[13px] font-medium flex-1">{item.nombre}
                    {item.marca && item.marca !== 'Sin marca' && (
                      <span className="text-[11px] font-normal text-[var(--text-muted)] ml-1">· {item.marca}</span>
                    )}
                  </span>
                  <span className="text-[12px] text-[var(--text-muted)]">{fmtCantidad(item.cantidad, item.unidad)}</span>
                  {item.urgente && <span className="text-[9px] font-bold text-red-500 uppercase">URG</span>}
                  <span className="text-[11px] text-[var(--text-muted)]">— {item.usuario}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Confirm
        open={!!confirmEnviar}
        onClose={() => setConfirmEnviar(null)}
        onConfirm={() => confirmEnviar && enviarProveedor(confirmEnviar)}
        title={`¿Enviaste el pedido a ${confirmEnviar?.nombre_proveedor}?`}
        message={`${confirmEnviar?.items.length} ítem${(confirmEnviar?.items.length ?? 0) > 1 ? 's' : ''} desaparecerán de la lista activa. Si algo no llegó, podés recuperarlo desde la sección Archivados en la Lista.`}
        confirmLabel="Sí, envié el pedido"
        loading={!!enviando}
      />
    </div>
  )
}

// ─── Tab: Catálogo ───────────────────────────────────────────────────────────

function TabCatalogo({ productos, proveedores, onRefresh, isAdmin, myCats }: {
  productos: Producto[]; proveedores: Proveedor[]; onRefresh: () => void; isAdmin: boolean; myCats: string[] | null
}) {
  const [busqueda, setBusqueda] = useState('')
  const [catFiltro, setCatFiltro] = useState<CatKey | 'todas'>('todas')
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState<Producto | null>(null)
  const [nombre, setNombre] = useState('')
  const [marca, setMarca] = useState('')
  const [categoria, setCategoria] = useState<CatKey>('cocina')
  const [proveedorId, setProveedorId] = useState('')
  const [unidad, setUnidad] = useState('unidad')
  const [guardando, setGuardando] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const prodsFiltrados = productos.filter(p => {
    if (!p.activo) return false
    if (myCats && !myCats.includes(p.categoria)) return false
    if (catFiltro !== 'todas' && p.categoria !== catFiltro) return false
    if (busqueda.length >= 2 && !p.nombre.toLowerCase().includes(busqueda.toLowerCase())) return false
    return true
  })

  function abrirNuevo() {
    const defaultCat = myCats && myCats.length > 0 ? (myCats[0] as CatKey) : 'cocina'
    setEditando(null); setNombre(''); setMarca(''); setCategoria(defaultCat); setProveedorId(''); setUnidad('unidad')
    setShowForm(true)
  }
  function abrirEditar(p: Producto) {
    setEditando(p); setNombre(p.nombre); setMarca(p.marca ?? ''); setCategoria(p.categoria)
    setProveedorId(p.proveedor_id?.toString() ?? ''); setUnidad(p.unidad)
    setShowForm(true)
  }

  async function guardar() {
    setGuardando(true)
    const body = { nombre, marca: marca.trim() || 'Sin marca', categoria, proveedor_id: proveedorId ? Number(proveedorId) : null, unidad }
    const res = editando
      ? await fetch(`/api/pedidos/productos/${editando.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch('/api/pedidos/productos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setGuardando(false)
    if (res.ok) {
      setShowForm(false); onRefresh()
      setToast({ msg: editando ? 'Producto actualizado' : 'Producto creado', type: 'success' })
      setTimeout(() => setToast(null), 3000)
    }
  }

  return (
    <div>
      <Toast message={toast?.msg ?? ''} visible={!!toast} type={toast?.type} />

      <div className="flex gap-2 mb-4">
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar producto…"
          className="flex-1 border border-[var(--border)] rounded-xl px-3 py-2.5 text-[13px] focus:outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)]" />
        <Button size="sm" onClick={abrirNuevo} icon={<IconPlus size={14} />}>Nuevo</Button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4">
        <button onClick={() => setCatFiltro('todas')}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium cursor-pointer transition-colors ${catFiltro === 'todas' ? 'bg-[image:var(--gradient)] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
          Todas
        </button>
        {(myCats ? CATEGORIAS.filter(c => myCats.includes(c.key)) : CATEGORIAS).map(c => (
          <button key={c.key} onClick={() => setCatFiltro(c.key)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium cursor-pointer transition-colors ${catFiltro === c.key ? 'bg-[image:var(--gradient)] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            {c.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {prodsFiltrados.map(p => (
          <div key={p.id} className="bg-white border rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm border-[var(--border)]">
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold truncate">{p.nombre} <span className="font-normal text-[var(--text-muted)]">{p.marca !== 'Sin marca' ? `· ${p.marca}` : ''}</span></p>
              <p className="text-[11px] text-[var(--text-muted)]">{catLabel(p.categoria)} · {p.unidad} · {p.proveedor?.nombre ?? <span className="text-amber-500">Sin proveedor</span>}</p>
            </div>
            <button onClick={() => abrirEditar(p)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer transition-colors">
              <IconEdit size={14} />
            </button>
          </div>
        ))}
        {!prodsFiltrados.length && <p className="text-center text-[13px] text-gray-400 py-10">Sin productos</p>}
      </div>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editando ? 'Editar producto' : 'Nuevo producto'}
        footer={
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button className="flex-1" onClick={guardar} loading={guardando} disabled={!nombre.trim()}>Guardar</Button>
          </>
        }
      >
        <div>
          <p className="text-[12px] font-medium text-[var(--text-sub)] mb-1.5">Nombre *</p>
          <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Algodón"
            className="w-full border border-[var(--border)] rounded-xl px-3 py-2.5 text-[13px] focus:outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)]" />
        </div>
        <MarcaInput value={marca} onChange={setMarca} productos={productos} label="Marca" />
        <Select label="Categoría" value={categoria} onChange={v => setCategoria(v as CatKey)}>
          {(myCats ? CATEGORIAS.filter(c => myCats.includes(c.key)) : CATEGORIAS).map(c => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </Select>
        <div className="flex gap-3">
          <Select label="Proveedor" value={proveedorId} onChange={setProveedorId} className="flex-1">
            <option value="">Sin proveedor</option>
            {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </Select>
          <Select label="Unidad" value={unidad} onChange={setUnidad} className="w-28">
            {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
          </Select>
        </div>
      </Modal>
    </div>
  )
}

// ─── Tab: Inventario ─────────────────────────────────────────────────────────

function TabInventario({ productos, proveedores, cicloActivo, isAdmin, myCats, onRefresh }: {
  productos: Producto[]; proveedores: Proveedor[]; cicloActivo: Ciclo | null
  isAdmin: boolean; myCats: string[] | null; onRefresh: () => void
}) {
  const [busqueda, setBusqueda] = useState('')
  const [catFiltro, setCatFiltro] = useState<CatKey | 'todas'>('todas')
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState<Producto | null>(null)
  const [nombre, setNombre] = useState('')
  const [marca, setMarca] = useState('')
  const [categoria, setCategoria] = useState<CatKey>('cocina')
  const [proveedorId, setProveedorId] = useState('')
  const [unidad, setUnidad] = useState('unidad')
  const [stockMinProd, setStockMinProd] = useState('')
  const [stockActualProd, setStockActualProd] = useState('')
  const [guardando, setGuardando] = useState(false)

  const [stockDraft, setStockDraft] = useState<Record<string, string>>({})
  const [stockGuardando, setStockGuardando] = useState<Set<string>>(new Set())

  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [variantesMap, setVariantesMap] = useState<Record<string, Variante[]>>({})
  const [loadingVars, setLoadingVars] = useState<Set<string>>(new Set())

  const [historialMap, setHistorialMap] = useState<Record<string, StockHistorial[]>>({})
  const [stockLogMap, setStockLogMap] = useState<Record<string, StockAuditEntry[]>>({})
  const [stockLogOpen, setStockLogOpen] = useState<Set<string>>(new Set())

  const [varianteForm, setVarianteForm] = useState<{ prod: Producto; variante?: Variante } | null>(null)
  const [varianteNombre, setVarianteNombre] = useState('')
  const [varianteMinimo, setVarianteMinimo] = useState('')
  const [varianteGuardando, setVarianteGuardando] = useState(false)

  const [pedirItems, setPedirItems] = useState<Item[]>([])
  useEffect(() => {
    if (!cicloActivo) return
    fetch(`/api/pedidos/ciclos/${cicloActivo.id}/items`).then(r => r.json()).then(d => {
      setPedirItems(d.items ?? [])
    }).catch(() => {})
  }, [cicloActivo])

  const [pedirTarget, setPedirTarget] = useState<{ prod: Producto; variante?: Variante } | null>(null)
  const [pedirCantidad, setPedirCantidad] = useState('1')
  const [pedirUnidad, setPedirUnidad] = useState('unidad')
  const [pedirNotas, setPedirNotas] = useState('')
  const [pedirUrgente, setPedirUrgente] = useState(false)
  const [pedirMarca, setPedirMarca] = useState('')
  const [pedirProveedorId, setPedirProveedorId] = useState('')
  const [pedirGuardando, setPedirGuardando] = useState(false)

  const pedirDuplicado = pedirTarget
    ? pedirItems.find(i =>
        i.producto_id === pedirTarget.prod.id &&
        (!pedirTarget.variante || i.variante_id === pedirTarget.variante.id)
      ) ?? null
    : null

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000)
  }

  const prodsFiltrados = productos.filter(p => {
    if (myCats && !myCats.includes(p.categoria)) return false
    if (!p.activo) return false
    if (catFiltro !== 'todas' && p.categoria !== catFiltro) return false
    if (busqueda.length >= 2 && !normalizar(`${p.nombre} ${p.marca}`).includes(normalizar(busqueda))) return false
    return true
  })

  const grouped: { cat: CatDef; prods: Producto[] }[] = CATEGORIAS
    .map(cat => ({ cat, prods: prodsFiltrados.filter(p => p.categoria === cat.key) }))
    .filter(g => g.prods.length > 0)

  function abrirNuevo() {
    const def = myCats && myCats.length > 0 ? (myCats[0] as CatKey) : 'cocina'
    setEditando(null); setNombre(''); setMarca(''); setCategoria(def); setProveedorId(''); setUnidad('unidad')
    setStockMinProd(''); setStockActualProd('')
    setShowForm(true)
  }
  function abrirEditar(p: Producto) {
    setEditando(p); setNombre(p.nombre); setMarca(p.marca ?? ''); setCategoria(p.categoria)
    setProveedorId(p.proveedor_id?.toString() ?? ''); setUnidad(p.unidad)
    setStockMinProd(p.stock_minimo?.toString() ?? ''); setStockActualProd(p.stock_actual?.toString() ?? '')
    setShowForm(true)
  }

  async function guardar(thenAddVariante = false) {
    setGuardando(true)
    const sinVariantes = !editando || editando.variantes_count === 0
    const body: Record<string, unknown> = {
      nombre, marca: marca.trim() || 'Sin marca', categoria,
      proveedor_id: proveedorId ? Number(proveedorId) : null, unidad,
    }
    if (sinVariantes && !thenAddVariante) {
      body.stock_minimo = stockMinProd !== '' ? Number(stockMinProd) : null
      body.stock_actual = stockActualProd !== '' ? Number(stockActualProd) : null
    }
    const res = editando
      ? await fetch(`/api/pedidos/productos/${editando.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch('/api/pedidos/productos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setGuardando(false)
    if (res.ok) {
      setShowForm(false); onRefresh(); showToast(editando ? 'Producto actualizado' : 'Producto creado')
      if (thenAddVariante) {
        const prod = editando ?? await res.json()
        setVarianteForm({ prod }); setVarianteNombre(''); setVarianteMinimo('')
      }
    }
  }

  async function loadHistorial(id: string, isVariante: boolean) {
    const param = isVariante ? 'variante_id' : 'producto_id'
    const data = await fetch(`/api/pedidos/stock-historial?${param}=${id}`).then(r => r.json()).catch(() => [])
    setHistorialMap(m => ({ ...m, [id]: Array.isArray(data) ? data : [] }))
  }

  async function guardarStock(id: string, isVariante: boolean, val: string) {
    const n = parseFloat(val)
    if (isNaN(n) || n < 0) return

    // Capture previous value for audit
    const stockAnterior = isVariante
      ? (Object.values(variantesMap).flat().find(v => v.id === id)?.stock_actual ?? null)
      : (productos.find(p => p.id === id)?.stock_actual ?? null)

    setStockGuardando(s => new Set([...s, id]))

    if (isVariante) {
      await fetch(`/api/pedidos/variantes/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock_actual: n }),
      })
      setVariantesMap(m => {
        const next = { ...m }
        for (const pid in next) next[pid] = next[pid].map(v => v.id === id ? { ...v, stock_actual: n } : v)
        return next
      })
    } else {
      await fetch(`/api/pedidos/productos/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock_actual: n }),
      })
      onRefresh()
    }

    await Promise.all([
      fetch('/api/pedidos/stock-historial', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isVariante ? { variante_id: id, stock: n } : { producto_id: id, stock: n }),
      }),
      fetch('/api/pedidos/stock-auditoria', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isVariante
          ? { variante_id: id, stock_anterior: stockAnterior, stock_nuevo: n }
          : { producto_id: id, stock_anterior: stockAnterior, stock_nuevo: n }
        ),
      }),
    ])

    // Reset caches to force reload
    setHistorialMap(m => { const next = { ...m }; delete next[id]; return next })
    setStockLogMap(m => { const next = { ...m }; delete next[id]; return next })

    setStockGuardando(s => { const n2 = new Set(s); n2.delete(id); return n2 })
  }

  async function toggleStockLog(id: string, isVariante: boolean) {
    const next = new Set(stockLogOpen)
    if (next.has(id)) { next.delete(id); setStockLogOpen(next); return }
    next.add(id); setStockLogOpen(next)
    if (!(id in stockLogMap)) {
      const param = isVariante ? 'variante_id' : 'producto_id'
      const data = await fetch(`/api/pedidos/stock-auditoria?${param}=${id}`).then(r => r.json()).catch(() => [])
      setStockLogMap(m => ({ ...m, [id]: Array.isArray(data) ? data : [] }))
    }
  }

  async function guardarVariante() {
    if (!varianteForm || !varianteNombre.trim()) return
    setVarianteGuardando(true)
    const { prod, variante } = varianteForm
    const body: Record<string, unknown> = {
      nombre: varianteNombre.trim(),
      stock_minimo: varianteMinimo !== '' ? Number(varianteMinimo) : null,
    }
    if (variante) {
      await fetch(`/api/pedidos/variantes/${variante.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setVariantesMap(m => ({
        ...m,
        [prod.id]: (m[prod.id] ?? []).map(v =>
          v.id === variante.id ? { ...v, nombre: varianteNombre.trim(), stock_minimo: body.stock_minimo as number | null } : v
        ),
      }))
    } else {
      body.producto_id = prod.id
      const data = await fetch('/api/pedidos/variantes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => r.json()).catch(() => null)
      if (data?.id) {
        setVariantesMap(m => ({ ...m, [prod.id]: [...(m[prod.id] ?? []), data] }))
        onRefresh()
      }
    }
    setVarianteGuardando(false)
    setVarianteForm(null)
    showToast(variante ? 'Variante actualizada' : 'Variante creada')
  }

  async function toggleExpand(prod: Producto) {
    const next = new Set(expandidos)
    if (next.has(prod.id)) {
      next.delete(prod.id)
    } else {
      next.add(prod.id)
      if (!variantesMap[prod.id]) {
        setLoadingVars(s => new Set([...s, prod.id]))
        const data = await fetch(`/api/pedidos/variantes?producto_id=${prod.id}`).then(r => r.json()).catch(() => [])
        setVariantesMap(m => ({ ...m, [prod.id]: Array.isArray(data) ? data : [] }))
        setLoadingVars(s => { const n = new Set(s); n.delete(prod.id); return n })
      }
    }
    setExpandidos(next)
  }

  async function pedirAhora() {
    if (!cicloActivo || !pedirTarget) return
    setPedirGuardando(true)
    const prod = pedirTarget.prod
    const marcaNueva = pedirMarca.trim()
    const provNuevo = pedirProveedorId

    // Update product if marca/proveedor were filled in and product lacked them
    const needsUpdate = (marcaNueva && marcaNueva !== 'Sin marca' && (!prod.marca || prod.marca === 'Sin marca')) ||
      (provNuevo && !prod.proveedor_id)
    if (needsUpdate) {
      const upd: Record<string, unknown> = {}
      if (marcaNueva && marcaNueva !== 'Sin marca' && (!prod.marca || prod.marca === 'Sin marca')) upd.marca = marcaNueva
      if (provNuevo && !prod.proveedor_id) upd.proveedor_id = Number(provNuevo)
      await fetch(`/api/pedidos/productos/${prod.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(upd),
      })
      onRefresh()
    }

    const res = await fetch(`/api/pedidos/ciclos/${cicloActivo.id}/items`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        producto_id: prod.id,
        variante_id: pedirTarget.variante?.id ?? null,
        cantidad: Number(pedirCantidad),
        unidad: pedirUnidad,
        notas: pedirNotas || null,
        urgente: pedirUrgente,
      }),
    })
    setPedirGuardando(false)
    if (res.ok) { setPedirTarget(null); showToast('Agregado a la lista') }
    else showToast('Error al agregar', 'error')
  }

  return (
    <div>
      <Toast message={toast?.msg ?? ''} visible={!!toast} type={toast?.type} />

      <div className="flex gap-2 mb-4">
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar producto…"
          className="flex-1 border border-[var(--border)] rounded-xl px-3 py-2.5 text-[13px] focus:outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)]" />
        {isAdmin && <Button size="sm" onClick={abrirNuevo} icon={<IconPlus size={14} />}>Nuevo</Button>}
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4">
        <button onClick={() => setCatFiltro('todas')}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium cursor-pointer transition-colors ${catFiltro === 'todas' ? 'bg-[image:var(--gradient)] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
          Todas
        </button>
        {(myCats ? CATEGORIAS.filter(c => myCats.includes(c.key)) : CATEGORIAS).map(c => (
          <button key={c.key} onClick={() => setCatFiltro(c.key)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium cursor-pointer transition-colors ${catFiltro === c.key ? 'bg-[image:var(--gradient)] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            {c.label}
          </button>
        ))}
      </div>

      <div className="space-y-5">
        {grouped.map(({ cat, prods }) => (
          <div key={cat.key}>
            {catFiltro === 'todas' && (
              <p className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 px-1">{cat.label}</p>
            )}
            <div className="space-y-2">
              {prods.map(p => (
                <div key={p.id} className="bg-white border rounded-2xl shadow-sm border-[var(--border)] overflow-hidden">
                  <div className="px-3 py-2.5 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold truncate">
                        {p.nombre}
                        {p.marca && p.marca !== 'Sin marca' && <span className="font-normal text-[var(--text-muted)]"> · {p.marca}</span>}
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)] truncate">{p.proveedor?.nombre ?? <span className="text-amber-500">Sin proveedor</span>}</p>
                    </div>

                    {p.variantes_count === 0 && (
                      <StockInput
                        id={p.id}
                        value={stockDraft[p.id] ?? (p.stock_actual?.toString() ?? '')}
                        onChange={v => setStockDraft(d => ({ ...d, [p.id]: v }))}
                        onSave={v => guardarStock(p.id, false, v)}
                        unidad={p.unidad}
                        minimo={p.stock_minimo}
                        guardando={stockGuardando.has(p.id)}
                        historial={historialMap[p.id]}
                        onLoadHistorial={() => loadHistorial(p.id, false)}
                      />
                    )}

                    <div className="flex items-center gap-1 flex-shrink-0">
                      {isAdmin && p.variantes_count === 0 && (
                        <button
                          onClick={() => toggleStockLog(p.id, false)}
                          className={`p-1.5 rounded-lg cursor-pointer transition-colors ${stockLogOpen.has(p.id) ? 'text-[var(--primary)] bg-[var(--primary)]/10' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'}`}>
                          <IconClock size={13} />
                        </button>
                      )}
                      {cicloActivo?.estado === 'abierto' && p.variantes_count === 0 && p.activo && (
                        <button
                          onClick={() => { setPedirTarget({ prod: p }); setPedirCantidad('1'); setPedirUnidad(p.unidad); setPedirNotas(''); setPedirUrgente(false); setPedirMarca(''); setPedirProveedorId('') }}
                          className="px-2.5 py-1.5 rounded-xl text-[12px] font-semibold bg-[var(--primary)]/10 text-[var(--primary)] hover:bg-[var(--primary)]/20 cursor-pointer transition-colors">
                          Pedir
                        </button>
                      )}
                      {p.variantes_count > 0 && (
                        <button onClick={() => toggleExpand(p)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[12px] font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer transition-colors">
                          <IconChevronRight size={12} className={`transition-transform duration-200 ${expandidos.has(p.id) ? 'rotate-90' : ''}`} />
                          {p.variantes_count}
                        </button>
                      )}
                      {isAdmin && (
                        <button onClick={() => abrirEditar(p)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer transition-colors">
                          <IconEdit size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {isAdmin && stockLogOpen.has(p.id) && p.variantes_count === 0 && (
                    <div className="border-t border-[var(--border)] px-4 py-2.5 space-y-1 bg-gray-50">
                      {!(p.id in stockLogMap) && <p className="text-[11px] text-[var(--text-muted)]">Cargando…</p>}
                      {stockLogMap[p.id]?.length === 0 && <p className="text-[11px] text-[var(--text-muted)] italic">Sin cambios registrados</p>}
                      {stockLogMap[p.id]?.map(e => (
                        <p key={e.id} className="text-[11px] text-[var(--text-muted)]">
                          <span className="font-semibold text-[var(--text)]">{e.usuario_nombre}</span>
                          {e.stock_anterior !== null
                            ? <span> · {e.stock_anterior} → <span className="font-semibold">{e.stock_nuevo}</span> {p.unidad}</span>
                            : <span> · registró <span className="font-semibold">{e.stock_nuevo}</span> {p.unidad}</span>
                          }
                          <span className="opacity-60"> · {formatRelativo(e.created_at)}</span>
                        </p>
                      ))}
                    </div>
                  )}

                  {expandidos.has(p.id) && (
                    <div className="border-t border-[var(--border)]">
                      {loadingVars.has(p.id) && <div className="px-4 py-3"><Spinner /></div>}
                      {!loadingVars.has(p.id) && (variantesMap[p.id] ?? []).length === 0 && (
                        <p className="px-4 py-3 text-[12px] text-[var(--text-muted)] italic">Sin variantes</p>
                      )}
                      {!loadingVars.has(p.id) && (variantesMap[p.id] ?? []).map((v, vi) => (
                        <div key={v.id} className={`border-[var(--border)] ${vi > 0 ? 'border-t' : ''}`}>
                          <div className="flex items-center gap-2 px-3 py-2">
                            <p className="flex-1 text-[12px] text-[var(--text)] min-w-0 truncate">{v.nombre}</p>
                            <StockInput
                              id={v.id}
                              value={stockDraft[v.id] ?? (v.stock_actual?.toString() ?? '')}
                              onChange={val => setStockDraft(d => ({ ...d, [v.id]: val }))}
                              onSave={val => guardarStock(v.id, true, val)}
                              unidad={p.unidad}
                              minimo={v.stock_minimo}
                              guardando={stockGuardando.has(v.id)}
                              historial={historialMap[v.id]}
                              onLoadHistorial={() => loadHistorial(v.id, true)}
                            />
                            {isAdmin && (
                              <>
                                <button
                                  onClick={() => toggleStockLog(v.id, true)}
                                  className={`p-1.5 rounded-lg cursor-pointer transition-colors flex-shrink-0 ${stockLogOpen.has(v.id) ? 'text-[var(--primary)] bg-[var(--primary)]/10' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'}`}>
                                  <IconClock size={13} />
                                </button>
                                <button
                                  onClick={() => { setVarianteForm({ prod: p, variante: v }); setVarianteNombre(v.nombre); setVarianteMinimo(v.stock_minimo?.toString() ?? '') }}
                                  className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 cursor-pointer transition-colors flex-shrink-0">
                                  <IconEdit size={13} />
                                </button>
                              </>
                            )}
                            {cicloActivo?.estado === 'abierto' && v.activo && (
                              <button
                                onClick={() => { setPedirTarget({ prod: p, variante: v }); setPedirCantidad('1'); setPedirUnidad(p.unidad); setPedirNotas(''); setPedirUrgente(false); setPedirMarca(''); setPedirProveedorId('') }}
                                className="px-2.5 py-1.5 rounded-xl text-[11px] font-semibold bg-[var(--primary)]/10 text-[var(--primary)] hover:bg-[var(--primary)]/20 cursor-pointer transition-colors flex-shrink-0">
                                Pedir
                              </button>
                            )}
                          </div>
                          {isAdmin && stockLogOpen.has(v.id) && (
                            <div className="px-4 pb-2.5 pt-1 space-y-1 bg-gray-50 border-t border-gray-100">
                              {!(v.id in stockLogMap) && <p className="text-[11px] text-[var(--text-muted)]">Cargando…</p>}
                              {stockLogMap[v.id]?.length === 0 && <p className="text-[11px] text-[var(--text-muted)] italic">Sin cambios registrados</p>}
                              {stockLogMap[v.id]?.map(e => (
                                <p key={e.id} className="text-[11px] text-[var(--text-muted)]">
                                  <span className="font-semibold text-[var(--text)]">{e.usuario_nombre}</span>
                                  {e.stock_anterior !== null
                                    ? <span> · {e.stock_anterior} → <span className="font-semibold">{e.stock_nuevo}</span> {p.unidad}</span>
                                    : <span> · registró <span className="font-semibold">{e.stock_nuevo}</span> {p.unidad}</span>
                                  }
                                  <span className="opacity-60"> · {formatRelativo(e.created_at)}</span>
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                      {!loadingVars.has(p.id) && isAdmin && (
                        <div className="border-t border-gray-100">
                          <button
                            onClick={() => { setVarianteForm({ prod: p }); setVarianteNombre(''); setVarianteMinimo('') }}
                            className="w-full flex items-center gap-2 px-4 py-2.5 text-[12px] text-[var(--primary)] hover:bg-[var(--primary)]/5 cursor-pointer transition-colors">
                            <IconPlus size={12} />
                            Nueva variante
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {!prodsFiltrados.length && <p className="text-center text-[13px] text-gray-400 py-10">Sin productos</p>}
      </div>

      {/* Formulario producto */}
      <Modal
        open={showForm} onClose={() => setShowForm(false)}
        title={editando ? 'Editar producto' : 'Nuevo producto'}
        footer={
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button className="flex-1" onClick={guardar} loading={guardando} disabled={!nombre.trim()}>Guardar</Button>
          </>
        }
      >
        <div>
          <p className="text-[12px] font-medium text-[var(--text-sub)] mb-1.5">Nombre *</p>
          <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Algodón"
            className="w-full border border-[var(--border)] rounded-xl px-3 py-2.5 text-[13px] focus:outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)]" />
        </div>
        <MarcaInput value={marca} onChange={setMarca} productos={productos} label="Marca" />
        <Select label="Categoría" value={categoria} onChange={v => setCategoria(v as CatKey)}>
          {(myCats ? CATEGORIAS.filter(c => myCats.includes(c.key)) : CATEGORIAS).map(c => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </Select>
        <div className="flex gap-3">
          <Select label="Proveedor" value={proveedorId} onChange={setProveedorId} className="flex-1">
            <option value="">Sin proveedor</option>
            {proveedores.map(pv => <option key={pv.id} value={pv.id}>{pv.nombre}</option>)}
          </Select>
          <Select label="Unidad" value={unidad} onChange={setUnidad} className="w-28">
            {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
          </Select>
        </div>
        {(!editando || editando.variantes_count === 0) && (
          <div className="flex gap-3">
            <div className="flex-1">
              <p className="text-[12px] font-medium text-[var(--text-sub)] mb-1.5">Stock actual</p>
              <input
                type="number" min="0" step="1" value={stockActualProd} onChange={e => setStockActualProd(e.target.value)}
                placeholder="—"
                className="w-full border border-[var(--border)] rounded-xl px-3 py-2.5 text-[13px] focus:outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)]"
              />
            </div>
            <div className="flex-1">
              <p className="text-[12px] font-medium text-[var(--text-sub)] mb-1.5">Stock mínimo</p>
              <input
                type="number" min="0" step="1" value={stockMinProd} onChange={e => setStockMinProd(e.target.value)}
                placeholder="—"
                className="w-full border border-[var(--border)] rounded-xl px-3 py-2.5 text-[13px] focus:outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)]"
              />
            </div>
          </div>
        )}
        <button
          disabled={!nombre.trim() || guardando}
          onClick={() => {
            if (editando) {
              setShowForm(false); setVarianteForm({ prod: editando }); setVarianteNombre(''); setVarianteMinimo('')
            } else {
              guardar(true)
            }
          }}
          className="flex items-center gap-1.5 text-[12px] text-[var(--primary)] hover:underline cursor-pointer pt-1 disabled:opacity-40 disabled:cursor-not-allowed">
          <IconPlus size={12} />
          {editando ? 'Agregar variante a este producto' : 'Guardar y agregar variante'}
        </button>
      </Modal>

      {/* Variante: nueva / editar */}
      <Modal
        open={!!varianteForm} onClose={() => setVarianteForm(null)}
        title={varianteForm?.variante ? 'Editar variante' : 'Nueva variante'}
        footer={
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setVarianteForm(null)}>Cancelar</Button>
            <Button className="flex-1" onClick={guardarVariante} loading={varianteGuardando} disabled={!varianteNombre.trim()}>Guardar</Button>
          </>
        }
      >
        <div className="p-3 bg-gray-50 rounded-xl border border-[var(--border)] text-[12px] text-[var(--text-muted)]">
          <span className="font-semibold text-[var(--text)]">{varianteForm?.prod.nombre}</span>
          {varianteForm?.prod.marca && varianteForm.prod.marca !== 'Sin marca' && ` · ${varianteForm.prod.marca}`}
        </div>
        <div>
          <p className="text-[12px] font-medium text-[var(--text-sub)] mb-1.5">Nombre de la variante *</p>
          <input
            value={varianteNombre} onChange={e => setVarianteNombre(e.target.value)}
            placeholder="Ej: Tono 7 Rubio Medio"
            className="w-full border border-[var(--border)] rounded-xl px-3 py-2.5 text-[13px] focus:outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)]"
          />
        </div>
        <div>
          <p className="text-[12px] font-medium text-[var(--text-sub)] mb-1.5">Stock mínimo (opcional)</p>
          <input
            type="number" min="0" step="1" value={varianteMinimo} onChange={e => setVarianteMinimo(e.target.value)}
            placeholder="Ej: 2"
            className="w-full border border-[var(--border)] rounded-xl px-3 py-2.5 text-[13px] focus:outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)]"
          />
          <p className="text-[11px] text-[var(--text-muted)] mt-1">Si el stock baja de este número, aparece el aviso de stock bajo.</p>
        </div>
      </Modal>

      {/* Quick pedir */}
      <Modal
        open={!!pedirTarget} onClose={() => setPedirTarget(null)}
        title="Agregar a la lista"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPedirTarget(null)}>Volver</Button>
            <Button className="flex-1" onClick={pedirAhora} loading={pedirGuardando}
              disabled={!pedirCantidad || Number(pedirCantidad) <= 0 || !cicloActivo || (!pedirTarget?.prod.proveedor_id && !pedirProveedorId)}>
              Agregar
            </Button>
          </>
        }
      >
        {pedirTarget && (
          <>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-[var(--border)]">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold truncate">{pedirTarget.prod.nombre}</p>
                {pedirTarget.variante && <p className="text-[11px] text-[var(--text-muted)]">{pedirTarget.variante.nombre}</p>}
                <p className="text-[11px] text-[var(--text-muted)]">{catLabel(pedirTarget.prod.categoria)}</p>
              </div>
              <button onClick={() => setPedirTarget(null)} className="p-1 text-gray-400 hover:text-gray-700 cursor-pointer rounded-lg">
                <IconX size={14} />
              </button>
            </div>

            {!cicloActivo && (
              <p className="text-[12px] text-amber-600 bg-amber-50 border border-amber-200 rounded-xl p-3">No hay lista abierta. Creá una desde Ajustes.</p>
            )}

            {!pedirTarget.prod.proveedor_id && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-[12px] font-semibold text-amber-700 mb-2">Este producto no tiene proveedor asignado. ¿A cuál se lo pedimos?</p>
                <Select value={pedirProveedorId} onChange={setPedirProveedorId}>
                  <option value="">— Elegí un proveedor —</option>
                  {proveedores.map(pv => <option key={pv.id} value={pv.id}>{pv.nombre}</option>)}
                </Select>
                {pedirProveedorId && <p className="text-[11px] text-amber-600 mt-1.5">Se guardará en el catálogo para la próxima vez.</p>}
              </div>
            )}

            {(!pedirTarget.prod.marca || pedirTarget.prod.marca === 'Sin marca') && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-[12px] font-semibold text-amber-700 mb-2">¿Qué marca es?</p>
                <MarcaInput value={pedirMarca} onChange={setPedirMarca} productos={productos} label="" />
                {pedirMarca && pedirMarca !== 'Sin marca' && (
                  <p className="text-[11px] text-amber-600 mt-1.5">Se guardará en el catálogo para la próxima vez.</p>
                )}
              </div>
            )}

            {pedirDuplicado && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-[12px] text-amber-700">
                  Ya fue pedido por <span className="font-semibold">{pedirDuplicado.usuario.nombre}</span>. Podés agregar igual o editar el ítem existente.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <div className="flex-1">
                <p className="text-[12px] font-medium text-[var(--text-sub)] mb-1.5">Cantidad</p>
                <input type="number" min="0.1" step="0.5" value={pedirCantidad} onChange={e => setPedirCantidad(e.target.value)}
                  className="w-full border border-[var(--border)] rounded-xl px-3 h-11 text-[13px] text-center font-semibold focus:outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)]" />
              </div>
              <Select label="Unidad" value={pedirUnidad} onChange={setPedirUnidad} className="flex-1">
                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
              </Select>
            </div>

            <div>
              <p className="text-[12px] font-medium text-[var(--text-sub)] mb-1.5">Notas (opcional)</p>
              <input value={pedirNotas} onChange={e => setPedirNotas(e.target.value)} placeholder="Ej: si no hay marca X, pedir marca Y"
                className="w-full border border-[var(--border)] rounded-xl px-3 py-2.5 text-[13px] focus:outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)]" />
            </div>
            <UrgenteToggle value={pedirUrgente} onChange={setPedirUrgente} />
          </>
        )}
      </Modal>
    </div>
  )
}

// ─── Tab: Ajustes ────────────────────────────────────────────────────────────

type CatConfig = { notif: boolean; dia_cierre: number }

function TabAjustes({ ciclos, onRefreshCiclos }: { ciclos: Ciclo[]; onRefreshCiclos: () => void }) {
  const [permisos, setPermisos] = useState<Permiso[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [exportadores, setExportadores] = useState<string[]>([])
  const [config, setConfig] = useState<{ dias_aviso: number; hora_aviso: string; dia_cierre: number; categorias_config: Partial<Record<CatKey, CatConfig>> } | null>(null)
  const [loading, setLoading] = useState(true)
  const [guardandoPerm, setGuardandoPerm] = useState<string | null>(null)
  const [guardandoExp, setGuardandoExp] = useState<string | null>(null)
  const [guardandoConf, setGuardandoConf] = useState(false)
  const [catAbierta, setCatAbierta] = useState<CatKey | null>(null)
  const [cicloCerrando, setCicloCerrando] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    Promise.all([
      fetch('/api/pedidos/permisos').then(r => r.json()),
      fetch('/api/pedidos/config').then(r => r.json()),
      fetch('/api/pedidos/exportadores').then(r => r.json()),
    ]).then(([p, c, e]) => {
      setPermisos(p.permisos ?? [])
      setUsuarios(p.usuarios ?? [])
      setConfig(c.error ? null : c)
      setExportadores(e.exportadores ?? [])
    }).finally(() => setLoading(false))
  }, [])

  function tienePerm(userId: string, cat: string) {
    return permisos.some(p => p.usuario_id === userId && p.categoria === cat)
  }

  async function togglePerm(userId: string, cat: string) {
    const key = `${userId}-${cat}`
    setGuardandoPerm(key)
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

  async function toggleExportador(userId: string) {
    const tiene = exportadores.includes(userId)
    setGuardandoExp(userId)
    const res = await fetch('/api/pedidos/exportadores', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario_id: userId, puede: !tiene }),
    })
    const json = await res.json().catch(() => ({}))
    if (res.ok) {
      setExportadores(prev => tiene ? prev.filter(id => id !== userId) : [...prev, userId])
    } else {
      showToast(json.error ?? 'Error al guardar', 'error')
    }
    setGuardandoExp(null)
  }

  function updateCatConfig(key: CatKey, val: CatConfig) {
    setConfig(c => c ? { ...c, categorias_config: { ...(c.categorias_config ?? {}), [key]: val } } : c)
  }

  async function guardarConfig() {
    if (!config) return
    setGuardandoConf(true)
    const res = await fetch('/api/pedidos/config', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    setGuardandoConf(false)
    if (res.ok) showToast('Configuración guardada')
    else showToast('Error al guardar', 'error')
  }

  async function reabrirCiclo(id: string) {
    setCicloCerrando(id)
    await fetch(`/api/pedidos/ciclos/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: 'abierto' }),
    })
    setCicloCerrando(null); onRefreshCiclos()
  }

  if (loading) return <Spinner />

  const ciclosCerrados = ciclos.filter(c => c.estado !== 'abierto')

  return (
    <div className="space-y-6">
      <Toast message={toast?.msg ?? ''} visible={!!toast} type={toast?.type} />

      <div>
        <p className="text-[14px] font-bold text-[var(--text)] mb-1">Permisos por categoría</p>
        <p className="text-[12px] text-[var(--text-muted)] mb-3">Elegí quién puede pedir en cada categoría cuando habilites el acceso general.</p>
        <div className="space-y-2">
          {CATEGORIAS.map(cat => {
            const abierta = catAbierta === cat.key
            const conAcceso = usuarios.filter(u => tienePerm(u.id, cat.key))
            return (
              <div key={cat.key} className="bg-white border border-[var(--border)] rounded-2xl shadow-sm overflow-hidden">
                <button onClick={() => setCatAbierta(abierta ? null : cat.key)}
                  className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors">
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-[13px] font-semibold text-[var(--text)]">{cat.label}</p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {conAcceso.length ? conAcceso.map(u => u.nombre.split(' ')[0]).join(', ') : 'Sin accesos'}
                    </p>
                  </div>
                  <div className={`transition-transform duration-200 ${abierta ? 'rotate-90' : ''}`}>
                    <IconChevronRight size={16} className="text-gray-400" />
                  </div>
                </button>
                {abierta && (
                  <div className="border-t border-[var(--border)] px-4 py-3 space-y-2">
                    {usuarios.map(u => {
                      const tiene = tienePerm(u.id, cat.key)
                      const cargando = guardandoPerm === `${u.id}-${cat.key}`
                      return (
                        <label key={u.id} className="flex items-center gap-3 cursor-pointer select-none">
                          <div onClick={() => !cargando && togglePerm(u.id, cat.key)}
                            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all cursor-pointer ${tiene ? 'bg-[image:var(--gradient)] border-transparent' : 'border-gray-300 hover:border-[var(--primary)]'} ${cargando ? 'opacity-50' : ''}`}>
                            {tiene && <IconCheck size={12} className="text-white" />}
                          </div>
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <Avatar nombre={u.nombre} foto={u.foto_perfil} size={24} />
                            <span className="text-[13px] text-[var(--text)] truncate">{u.nombre}</span>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <p className="text-[14px] font-bold text-[var(--text)] mb-1">Puede exportar listas</p>
        <p className="text-[12px] text-[var(--text-muted)] mb-3">Estas personas pueden exportar y enviar pedidos a proveedores.</p>
        <div className="bg-white border border-[var(--border)] rounded-2xl shadow-sm overflow-hidden">
          {usuarios.map((u, i) => {
            const tiene = exportadores.includes(u.id)
            const cargando = guardandoExp === u.id
            return (
              <div key={u.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-[var(--border)]' : ''}`}>
                <div onClick={() => !cargando && toggleExportador(u.id)}
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all cursor-pointer ${tiene ? 'bg-[image:var(--gradient)] border-transparent' : 'border-gray-300 hover:border-[var(--primary)]'} ${cargando ? 'opacity-50' : ''}`}>
                  {tiene && <IconCheck size={12} className="text-white" />}
                </div>
                <Avatar nombre={u.nombre} foto={u.foto_perfil} size={24} />
                <span className="text-[13px] text-[var(--text)] flex-1">{u.nombre}</span>
                {tiene && <span className="text-[10px] font-bold text-[var(--primary)] uppercase">Exporta</span>}
              </div>
            )
          })}
        </div>
      </div>

      {config && (
        <div>
          <p className="text-[14px] font-bold text-[var(--text)] mb-1">Recordatorio automático</p>
          <p className="text-[12px] text-[var(--text-muted)] mb-3">La notificación se envía 1 día antes del cierre. Activá por categoría y elegí el día de cierre de cada una.</p>
          <div className="bg-white border border-[var(--border)] rounded-2xl shadow-sm overflow-hidden">
            {CATEGORIAS.map((cat, i) => {
              const cc: CatConfig = config.categorias_config?.[cat.key] ?? { notif: false, dia_cierre: 4 }
              return (
                <div key={cat.key} className={`flex items-center gap-2 px-4 py-3 ${i > 0 ? 'border-t border-[var(--border)]' : ''}`}>
                  <p className="text-[13px] font-semibold text-[var(--text)] flex-1 min-w-0">{cat.label}</p>
                  {cc.notif && (
                    <Select value={String(cc.dia_cierre)} onChange={v => updateCatConfig(cat.key, { ...cc, dia_cierre: Number(v) })} className="w-32">
                      {DIAS.map((d, idx) => <option key={idx} value={idx}>{d}</option>)}
                    </Select>
                  )}
                  <button
                    onClick={() => updateCatConfig(cat.key, { ...cc, notif: !cc.notif })}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-medium border cursor-pointer transition-colors ${cc.notif ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-[var(--border)] text-[var(--text-muted)]'}`}
                  >
                    {cc.notif ? 'Activo' : 'Inactivo'}
                  </button>
                </div>
              )
            })}
          </div>
          <Button className="w-full mt-3" onClick={guardarConfig} loading={guardandoConf}>Guardar configuración</Button>
        </div>
      )}

      {ciclosCerrados.length > 0 && (
        <div>
          <p className="text-[14px] font-bold text-[var(--text)] mb-3">Listas anteriores</p>
          <div className="space-y-2">
            {ciclosCerrados.slice(0, 8).map(c => (
              <div key={c.id} className="bg-white border border-[var(--border)] rounded-2xl px-4 py-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold truncate">{c.nombre}</p>
                    <p className="text-[11px] text-[var(--text-muted)]">{formatFecha(c.fecha_apertura)}</p>
                  </div>
                  <EstadoBadge estado={c.estado} />
                  <Button size="sm" variant="secondary" onClick={() => reabrirCiclo(c.id)} disabled={cicloCerrando === c.id}>Reabrir</Button>
                </div>
                {c.cerrado_por && c.cerrado_en && (
                  <p className="text-[11px] text-[var(--text-muted)] mt-1">
                    Cerrado por <span className="font-medium">{c.cerrado_por}</span> el {formatCerradoEn(c.cerrado_en)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function PedidosClient({ session, myCats, puedeExportar }: {
  session: SessionUser; myCats: string[]; puedeExportar: boolean
}) {
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'

  type Tab = 'inventario' | 'lista' | 'enviados' | 'exportar' | 'ajustes'
  const [tab, setTab] = useState<Tab>('inventario')
  const [ciclos, setCiclos] = useState<Ciclo[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loadingBase, setLoadingBase] = useState(true)

  const cargarCiclos = useCallback(() => {
    fetch('/api/pedidos/ciclos').then(r => r.json()).then(d => setCiclos(Array.isArray(d) ? d : [])).catch(() => setCiclos([]))
  }, [])

  const cargarProductos = useCallback(() => {
    fetch('/api/pedidos/productos').then(r => r.json()).then(d => setProductos(Array.isArray(d) ? d : [])).catch(() => setProductos([]))
  }, [])

  useEffect(() => {
    Promise.all([
      fetch('/api/pedidos/ciclos').then(r => r.json()).catch(() => []),
      fetch('/api/pedidos/productos').then(r => r.json()).catch(() => []),
      fetch('/api/proveedores').then(r => r.json()).catch(() => []),
    ]).then(([c, p, pr]) => {
      setCiclos(Array.isArray(c) ? c : [])
      setProductos(Array.isArray(p) ? p : [])
      setProveedores(Array.isArray(pr) ? pr : [])
    }).finally(() => setLoadingBase(false))
  }, [])

  const cicloActivo = ciclos.find(c => c.estado === 'abierto') ?? null

  const tabs: { key: Tab; label: string }[] = [
    { key: 'inventario', label: 'Inventario' },
    { key: 'lista',      label: 'A pedir' },
    { key: 'enviados',   label: 'Ya pedido' },
    ...(puedeExportar ? [{ key: 'exportar' as Tab, label: 'Exportar' }] : []),
    ...(isAdmin ? [{ key: 'ajustes' as Tab, label: 'Ajustes' }] : []),
  ]

  return (
    <div className="py-4 fade-in">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-[image:var(--gradient)] flex items-center justify-center flex-shrink-0 shadow-sm">
          <IconBottle size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[17px] font-bold text-[var(--text)]">Inventario y pedidos</h1>
          <p className="text-[12px] text-[var(--text-muted)] mt-0.5">Controlá el stock y coordiná pedidos a proveedores</p>
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

          {tab === 'inventario' && (
            <TabInventario
              productos={productos}
              proveedores={proveedores}
              cicloActivo={cicloActivo}
              isAdmin={isAdmin}
              myCats={isAdmin ? null : myCats}
              onRefresh={cargarProductos}
            />
          )}
          {tab === 'lista' && (
            <TabLista
              cicloActivo={cicloActivo}
              productos={productos}
              proveedores={proveedores}
              onCiclosChange={cargarCiclos}
              onRefreshProductos={cargarProductos}
              isAdmin={isAdmin}
              myCats={myCats}
              myId={session.id}
            />
          )}
          {tab === 'enviados' && <TabEnviados cicloActivo={cicloActivo} isAdmin={isAdmin} />}
          {tab === 'exportar' && puedeExportar && <TabExportar cicloActivo={cicloActivo} onCiclosChange={cargarCiclos} />}
{tab === 'ajustes' && isAdmin && <TabAjustes ciclos={ciclos} onRefreshCiclos={cargarCiclos} />}
        </>
      )}
    </div>
  )
}
