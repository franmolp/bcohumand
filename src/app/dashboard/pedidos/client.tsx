'use client'

import { useState, useEffect, useCallback } from 'react'
import type { SessionUser } from '@/types'
import { Button, Spinner, Modal, Toast, Confirm, Select } from '@/components/ui'
import {
  IconShoppingBag, IconX, IconCheck, IconEdit, IconPlus, IconChevronRight, IconTrash,
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
}

interface Ciclo {
  id: string; nombre: string; fecha_apertura: string; fecha_cierre: string
  estado: 'abierto' | 'cerrado' | 'enviado'
  cerrado_por: string | null; cerrado_en: string | null; created_at: string
}

interface Item {
  id: string; ciclo_id: string; producto_id: string | null; nombre_libre: string | null
  cantidad: number; unidad: string; notas: string | null; urgente: boolean
  estado: 'pendiente' | 'ordenado' | 'recibido'; usuario_id: string
  usuario: { nombre: string; foto_perfil: string | null }
  producto: {
    id: string; nombre: string; marca: string; categoria: CatKey; unidad: string
    proveedor_id: number | null; proveedor: { id: number; nombre: string } | null
  } | null
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

    // Background: update product if proveedor or marca were missing
    const sinMarca = !productoSel.marca || productoSel.marca === 'Sin marca'
    const patchBody: Record<string, unknown> = {}
    if (!productoSel.proveedor_id && provConfig) patchBody.proveedor_id = Number(provConfig)
    if (sinMarca && configMarca.trim()) patchBody.marca = configMarca.trim()
    if (Object.keys(patchBody).length) {
      fetch(`/api/pedidos/productos/${productoSel.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      }).then(() => onRefreshProductos())
    }

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
  return (
    <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${item.urgente ? 'bg-red-50' : 'hover:bg-gray-50'} transition-colors`}>
      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.urgente ? 'bg-red-500' : 'bg-gray-200'}`} />
      <div className="flex-1 min-w-0">
        <span className={`text-[13px] ${item.urgente ? 'font-semibold text-red-700' : 'text-[var(--text)]'}`}>
          {item.producto?.nombre ?? item.nombre_libre ?? 'Ítem'}
          {item.producto?.marca && item.producto.marca !== 'Sin marca' && (
            <span className={`text-[11px] font-normal ml-1 ${item.urgente ? 'text-red-500/70' : 'text-[var(--text-muted)]'}`}>· {item.producto.marca}</span>
          )}
        </span>
        <span className="text-[11px] text-[var(--text-muted)] ml-2">{fmtCantidad(item.cantidad, item.unidad)}</span>
        {item.urgente && <span className="ml-2 text-[9px] font-bold text-red-500 uppercase tracking-wide">urgente</span>}
        {item.notas && <span className="text-[11px] text-[var(--text-muted)] ml-2 italic">· {item.notas}</span>}
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-[var(--text-muted)]">{item.usuario.nombre.split(' ')[0]}</span>
        {cicloAbierto && canEdit && (
          <div className="flex gap-0.5 ml-1">
            <button onClick={onEdit} title="Editar" className="p-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer transition-colors"><IconEdit size={12} /></button>
            <button onClick={onArchive} title="Archivar" className="p-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 cursor-pointer transition-colors"><IconX size={12} /></button>
            {isAdmin && <button onClick={onDelete} title="Eliminar definitivo" className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 cursor-pointer transition-colors"><IconTrash size={12} /></button>}
          </div>
        )}
      </div>
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

  async function toggleActivo(p: Producto) {
    await fetch(`/api/pedidos/productos/${p.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !p.activo }),
    })
    onRefresh()
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
          <div key={p.id} className={`bg-white border rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm border-[var(--border)] ${!p.activo ? 'opacity-50' : ''}`}>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold truncate">{p.nombre} <span className="font-normal text-[var(--text-muted)]">{p.marca !== 'Sin marca' ? `· ${p.marca}` : ''}</span></p>
              <p className="text-[11px] text-[var(--text-muted)]">{catLabel(p.categoria)} · {p.unidad} · {p.proveedor?.nombre ?? <span className="text-amber-500">Sin proveedor</span>}</p>
            </div>
            <div className="flex items-center gap-1">
              {isAdmin ? (
                <button onClick={() => toggleActivo(p)}
                  className={`text-[10px] font-bold px-2 py-1 rounded-full border cursor-pointer transition-colors ${p.activo ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : 'bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200'}`}>
                  {p.activo ? 'Activo' : 'Inactivo'}
                </button>
              ) : (
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${p.activo ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-400 border-gray-200'}`}>
                  {p.activo ? 'Activo' : 'Inactivo'}
                </span>
              )}
              <button onClick={() => abrirEditar(p)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer transition-colors">
                <IconEdit size={14} />
              </button>
            </div>
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

  type Tab = 'lista' | 'enviados' | 'exportar' | 'catalogo' | 'ajustes'
  const [tab, setTab] = useState<Tab>('lista')
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
    { key: 'lista',    label: 'Lista' },
    { key: 'enviados', label: 'Enviados' },
    ...(puedeExportar ? [{ key: 'exportar' as Tab, label: 'Exportar' }] : []),
    { key: 'catalogo', label: 'Catálogo' },
    ...(isAdmin ? [{ key: 'ajustes' as Tab, label: 'Ajustes' }] : []),
  ]

  return (
    <div className="py-4 fade-in">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-[image:var(--gradient)] flex items-center justify-center flex-shrink-0 shadow-sm">
          <IconShoppingBag size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[17px] font-bold text-[var(--text)]">Pedidos</h1>
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
          {tab === 'catalogo' && <TabCatalogo productos={productos} proveedores={proveedores} onRefresh={cargarProductos} isAdmin={isAdmin} myCats={isAdmin ? null : myCats} />}
          {tab === 'ajustes' && isAdmin && <TabAjustes ciclos={ciclos} onRefreshCiclos={cargarCiclos} />}
        </>
      )}
    </div>
  )
}
