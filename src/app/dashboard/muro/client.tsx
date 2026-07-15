'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { SessionUser } from '@/types'
import { Spinner, Toast } from '@/components/ui'
import { IconPlus, IconX, IconCheck, IconAlertCircle, IconHeart, IconHeartFilled, IconMessageCircle, IconWall, IconEdit } from '@/components/ui/Icons'
import { createPortal } from 'react-dom'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MuroPost {
  id: number
  tipo: 'post' | 'encuesta' | 'pregunta'
  contenido: string
  created_at: string
  cerrado: boolean
  resultados_publicados: boolean
  autor: { id: string; nombre: string; foto_perfil?: string | null }
  likes_count: number
  yo_like: boolean
  comentarios_count: number
  opciones?: { id: number; texto: string; votos?: number; votantes?: string[] }[]
  mi_voto?: number | null
  votos_total?: number | null
  mi_respuesta?: string | null
  respuestas_count?: number | null
  respuestas?: { autor: string; contenido: string }[] | null
}

interface Comentario {
  id: number
  parent_id: number | null
  usuario_id: string
  contenido: string
  created_at: string
  autor: { id: string; nombre: string; foto_perfil?: string | null }
  respuestas: Comentario[]
}

interface LikeUser { nombre: string; foto_perfil?: string | null }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'ahora'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  return new Date(dateStr).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function initials(n: string) {
  return n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function Avatar({ nombre, fotoUrl, size = 36 }: { nombre: string; fotoUrl?: string | null; size?: number }) {
  if (fotoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={fotoUrl} alt={nombre} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
  }
  return (
    <div
      className="bg-[image:var(--gradient)] rounded-full flex items-center justify-center shrink-0 shadow-sm"
      style={{ width: size, height: size }}
    >
      <span style={{ fontSize: size * 0.28 }} className="font-bold text-white">{initials(nombre)}</span>
    </div>
  )
}

// ─── Likes Popover ────────────────────────────────────────────────────────────

function LikesPopover({ postId, anchor, onClose }: { postId: number; anchor: HTMLElement; onClose: () => void }) {
  const [names, setNames] = useState<LikeUser[]>([])
  const [loading, setLoading] = useState(true)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/muro/${postId}/likes`)
      .then(r => r.json())
      .then(d => { setNames(Array.isArray(d) ? d : []); setLoading(false) })
  }, [postId])

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [anchor, onClose])

  // Position anchored to trigger button
  const rect = anchor.getBoundingClientRect()
  const popW = 200
  const left = Math.max(8, Math.min(rect.left + rect.width / 2 - popW / 2, window.innerWidth - popW - 8))
  const spaceAbove = rect.top - 8
  const above = spaceAbove > 180

  const style: React.CSSProperties = above
    ? { bottom: window.innerHeight - rect.top + 8, left }
    : { top: rect.bottom + 8, left }

  return createPortal(
    <div ref={popRef} className="fixed z-50 bg-white rounded-2xl shadow-xl border border-gray-100 p-3 w-[200px]" style={style}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[13px] font-bold">Les gustó</p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer"><IconX size={14} /></button>
      </div>
      {loading ? <div className="flex justify-center py-3"><Spinner size={20} /></div> : (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {names.length === 0
            ? <p className="text-[12px] text-gray-400 text-center py-2">Nadie por ahora</p>
            : names.map((u, i) => (
              <div key={i} className="flex items-center gap-2">
                <Avatar nombre={u.nombre} fotoUrl={u.foto_perfil} size={24} />
                <span className="text-[12px] font-medium">{u.nombre}</span>
              </div>
            ))
          }
        </div>
      )}
    </div>,
    document.body
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MuroClient({ session }: { session: SessionUser }) {
  const [posts, setPosts] = useState<MuroPost[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)
  const [toast, setToast] = useState('')
  const [myFoto, setMyFoto] = useState<string | null>(null)
  const isAdmin = session.rol === 'admin' || session.rol === 'Admin'
  const LIMIT = 5

  useEffect(() => {
    setMyFoto(localStorage.getItem(`bco_foto_perfil_${session.id}`))
    const onFoto = (e: Event) => setMyFoto((e as CustomEvent<{ url: string | null }>).detail.url)
    window.addEventListener('bco-foto-updated', onFoto)
    return () => window.removeEventListener('bco-foto-updated', onFoto)
  }, [])

  const fetchPosts = useCallback(async (off = 0, append = false) => {
    if (off === 0) setLoading(true); else setLoadingMore(true)
    const res = await fetch(`/api/muro?offset=${off}`)
    if (res.ok) {
      const data: MuroPost[] = await res.json()
      setPosts(prev => append ? [...prev, ...data] : data)
      setHasMore(data.length === LIMIT)
      setOffset(off + data.length)
    }
    if (off === 0) setLoading(false); else setLoadingMore(false)
  }, [])

  useEffect(() => { fetchPosts(0) }, [fetchPosts])
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t) } }, [toast])

  function updatePost(id: number, patch: Partial<MuroPost>) {
    setPosts(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
  }

  function removePost(id: number) {
    setPosts(prev => prev.filter(p => p.id !== id))
  }

  return (
    <div className="py-4 fade-in">
      <div className="space-y-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-[image:var(--gradient)] flex items-center justify-center flex-shrink-0 shadow-sm">
            <IconWall size={18} className="text-white" />
          </div>
          <h1 className="text-[17px] font-bold text-[var(--text)]">Muro Social</h1>
        </div>

        <PostComposer
          session={session}
          myFoto={myFoto}
          isAdmin={isAdmin}
          onCreated={() => fetchPosts(0)}
          setToast={setToast}
        />

        {loading ? (
          <div className="flex justify-center py-12"><Spinner size={32} /></div>
        ) : posts.length === 0 ? (
          <div className="text-center py-16 text-[13px] text-gray-400">Todavía no hay publicaciones</div>
        ) : (
          <>
            {posts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                session={session}
                myFoto={myFoto}
                isAdmin={isAdmin}
                updatePost={updatePost}
                removePost={removePost}
                setToast={setToast}
              />
            ))}
            {hasMore && (
              <div className="flex justify-center pt-2 pb-4">
                <button
                  onClick={() => fetchPosts(offset, true)}
                  disabled={loadingMore}
                  className="px-5 py-2.5 border border-gray-200 rounded-xl text-[13px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 cursor-pointer transition-colors"
                >
                  {loadingMore ? 'Cargando...' : 'Ver más'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <Toast message={toast} visible={!!toast} />
    </div>
  )
}

// ─── Post Composer ────────────────────────────────────────────────────────────

function PostComposer({
  session, myFoto, isAdmin, onCreated, setToast,
}: {
  session: SessionUser
  myFoto: string | null
  isAdmin: boolean
  onCreated: () => void
  setToast: (m: string) => void
}) {
  const [tipo, setTipo] = useState<'post' | 'encuesta' | 'pregunta'>('post')
  const [texto, setTexto] = useState('')
  const [opciones, setOpciones] = useState(['', ''])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setError('')
    if (!texto.trim()) { setError('Escribí algo primero'); return }
    if (tipo === 'encuesta' && opciones.filter(o => o.trim()).length < 2) { setError('Necesitás al menos 2 opciones'); return }

    setSaving(true)
    const res = await fetch('/api/muro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, contenido: texto, opciones: tipo === 'encuesta' ? opciones : undefined }),
    })
    setSaving(false)
    if (res.ok) {
      setTexto(''); setOpciones(['', '']); setTipo('post'); setError('')
      onCreated()
      setToast('Publicado')
    } else {
      const d = await res.json(); setError(d.error || 'Error')
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      {isAdmin && (
        <div className="flex bg-gray-100 rounded-xl p-0.5 mb-3 gap-0.5">
          {(['post', 'encuesta', 'pregunta'] as const).map(t => (
            <button key={t} onClick={() => { setTipo(t); setError('') }}
              className={`flex-1 py-1.5 text-[12px] font-medium rounded-[10px] transition-all cursor-pointer ${tipo === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
              {t === 'post' ? 'Publicar' : t === 'encuesta' ? 'Encuesta' : 'Pregunta abierta'}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <Avatar nombre={session.nombre} fotoUrl={myFoto} size={34} />
        <div className="flex-1 min-w-0">
          <textarea
            value={texto}
            onChange={e => setTexto(e.target.value)}
            placeholder={tipo === 'post' ? '¿Qué querés compartir?' : tipo === 'encuesta' ? 'Pregunta de la encuesta...' : 'Pregunta abierta...'}
            rows={tipo === 'post' ? 2 : 3}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-[14px] outline-none focus:border-[var(--primary)] resize-none"
          />

          {tipo === 'encuesta' && (
            <div className="mt-2 space-y-2">
              {opciones.map((op, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
                  <input value={op} onChange={e => { const o = [...opciones]; o[i] = e.target.value; setOpciones(o) }}
                    placeholder={`Opción ${i + 1}`}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-[13px] outline-none focus:border-[var(--primary)]" />
                  {opciones.length > 2 && (
                    <button onClick={() => setOpciones(opciones.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-400 cursor-pointer"><IconX size={14} /></button>
                  )}
                </div>
              ))}
              {opciones.length < 6 && (
                <button onClick={() => setOpciones([...opciones, ''])}
                  className="text-[12px] text-[var(--primary)] font-medium flex items-center gap-1 hover:opacity-70 cursor-pointer">
                  <IconPlus size={13} /> Agregar opción
                </button>
              )}
            </div>
          )}

          {error && <p className="mt-2 text-[12px] text-red-500 flex items-center gap-1"><IconAlertCircle size={13} /> {error}</p>}

          <div className="flex justify-end mt-2">
            <button onClick={submit} disabled={saving || !texto.trim()}
              className="px-4 py-2 bg-[var(--primary)] text-white text-[13px] font-semibold rounded-xl disabled:opacity-40 hover:opacity-90 transition-opacity cursor-pointer">
              {saving ? 'Publicando...' : 'Publicar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Post Card ────────────────────────────────────────────────────────────────

function PostCard({
  post, session, myFoto, isAdmin, updatePost, removePost, setToast,
}: {
  post: MuroPost
  session: SessionUser
  myFoto: string | null
  isAdmin: boolean
  updatePost: (id: number, patch: Partial<MuroPost>) => void
  removePost: (id: number) => void
  setToast: (m: string) => void
}) {
  const [showComments, setShowComments] = useState(false)
  const [comentarios, setComentarios] = useState<Comentario[]>([])
  const [loadingComments, setLoadingComments] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [replyTo, setReplyTo] = useState<{ id: number; nombre: string } | null>(null)
  const [submittingComment, setSubmittingComment] = useState(false)
  const [likesAnchor, setLikesAnchor] = useState<HTMLElement | null>(null)
  const commentInputRef = useRef<HTMLTextAreaElement>(null)
  const likesCountRef = useRef<HTMLButtonElement>(null)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(post.contenido ?? '')
  const [savingEdit, setSavingEdit] = useState(false)

  async function toggleComments() {
    if (!showComments && comentarios.length === 0) {
      setLoadingComments(true)
      const res = await fetch(`/api/muro/${post.id}/comentarios`)
      if (res.ok) setComentarios(await res.json())
      setLoadingComments(false)
    }
    setShowComments(v => !v)
  }

  async function toggleLike() {
    const newLiked = !post.yo_like
    updatePost(post.id, { yo_like: newLiked, likes_count: post.likes_count + (newLiked ? 1 : -1) })
    await fetch(`/api/muro/${post.id}/like`, { method: 'POST' })
  }

  async function submitComment() {
    if (!commentText.trim()) return
    setSubmittingComment(true)
    const res = await fetch(`/api/muro/${post.id}/comentarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contenido: commentText, parent_id: replyTo?.id ?? null }),
    })
    setSubmittingComment(false)
    if (res.ok) {
      const nuevo: Comentario = await res.json()
      if (replyTo) {
        setComentarios(prev => prev.map(c => c.id === replyTo.id ? { ...c, respuestas: [...c.respuestas, nuevo] } : c))
      } else {
        setComentarios(prev => [...prev, { ...nuevo, respuestas: [] }])
      }
      updatePost(post.id, { comentarios_count: post.comentarios_count + 1 })
      setCommentText(''); setReplyTo(null)
    }
  }

  async function deletePost() {
    if (!confirm('¿Eliminar esta publicación?')) return
    const res = await fetch(`/api/muro/${post.id}`, { method: 'DELETE' })
    if (res.ok) { removePost(post.id); setToast('Publicación eliminada') }
  }

  async function saveEdit() {
    if (!editText.trim()) return
    setSavingEdit(true)
    const res = await fetch(`/api/muro/${post.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contenido: editText }),
    })
    if (res.ok) { updatePost(post.id, { contenido: editText }); setEditing(false); setToast('Publicación editada') }
    setSavingEdit(false)
  }

  const canEdit = isAdmin || post.autor.id === session.id

  async function toggleCerrado() {
    const cerrado = !post.cerrado
    const res = await fetch(`/api/muro/${post.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cerrado }) })
    if (res.ok) { updatePost(post.id, { cerrado }); setToast(cerrado ? 'Cerrado' : 'Reabierto') }
  }

  async function publicarResultados() {
    const res = await fetch(`/api/muro/${post.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resultados_publicados: true }) })
    if (res.ok) { updatePost(post.id, { resultados_publicados: true }); setToast('Resultados publicados') }
  }

  const canDelete = isAdmin || post.autor.id === session.id
  const tipoBadge = post.tipo === 'encuesta'
    ? { label: 'Encuesta', bg: 'bg-violet-50', text: 'text-violet-600' }
    : post.tipo === 'pregunta'
    ? { label: 'Pregunta abierta', bg: 'bg-amber-50', text: 'text-amber-600' }
    : null

  return (
    <>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-start gap-3 px-4 pt-4 pb-3">
          <Avatar nombre={post.autor.nombre} fotoUrl={post.autor.foto_perfil} size={36} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-semibold">{post.autor.nombre}</span>
              {tipoBadge && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tipoBadge.bg} ${tipoBadge.text}`}>{tipoBadge.label}</span>}
              {post.cerrado && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Cerrado</span>}
            </div>
            <span className="text-[11px] text-gray-400">{timeAgo(post.created_at)}</span>
          </div>
          {/* Admin controls */}
          <div className="flex gap-1 items-center">
            {isAdmin && (post.tipo === 'encuesta' || post.tipo === 'pregunta') && (
              <>
                <button onClick={toggleCerrado}
                  className={`text-[11px] px-2 py-1 rounded-lg font-medium cursor-pointer transition-colors ${post.cerrado ? 'text-emerald-600 hover:bg-emerald-50' : 'text-gray-500 hover:bg-gray-100'}`}>
                  {post.cerrado ? 'Reabrir' : 'Cerrar'}
                </button>
                {!post.resultados_publicados && (
                  <button onClick={publicarResultados}
                    className="text-[11px] px-2 py-1 rounded-lg font-medium text-violet-600 hover:bg-violet-50 cursor-pointer transition-colors">
                    Publicar resultados
                  </button>
                )}
              </>
            )}
            {canEdit && (
              <button onClick={() => { setEditText(post.contenido ?? ''); setEditing(true) }} className="text-gray-300 hover:text-blue-400 cursor-pointer p-1 rounded-lg hover:bg-blue-50 transition-colors" title="Editar">
                <IconEdit size={14} />
              </button>
            )}
            {canDelete && (
              <button onClick={deletePost} className="text-gray-300 hover:text-red-400 cursor-pointer p-1 rounded-lg hover:bg-red-50 transition-colors" title="Eliminar">
                <IconX size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="px-4 pb-3">
          {editing ? (
            <div className="space-y-2">
              <textarea
                className="w-full border border-[var(--primary)] rounded-xl px-3 py-2 text-[14px] outline-none resize-none leading-relaxed"
                style={{ fontSize: 16 }}
                rows={4}
                value={editText}
                onChange={e => setEditText(e.target.value)}
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] text-gray-600 cursor-pointer">Cancelar</button>
                <button onClick={saveEdit} disabled={savingEdit || !editText.trim()} className="px-3 py-1.5 rounded-lg bg-[var(--primary)] text-white text-[13px] font-medium disabled:opacity-50 cursor-pointer">
                  {savingEdit ? <Spinner size={14} inline /> : 'Guardar'}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-[14px] text-[var(--text)] leading-relaxed whitespace-pre-wrap">{post.contenido}</p>
          )}
        </div>

        {/* Poll */}
        {post.tipo === 'encuesta' && post.opciones && (
          <PollView post={post} isAdmin={isAdmin} updatePost={updatePost} />
        )}

        {/* Open question */}
        {post.tipo === 'pregunta' && (
          <QuestionView post={post} session={session} isAdmin={isAdmin} updatePost={updatePost} />
        )}

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-gray-50">
          {/* Like group: icon + count side by side */}
          <div className="flex items-center gap-1.5">
            <button onClick={toggleLike}
              className={`transition-colors cursor-pointer leading-none ${post.yo_like ? 'text-red-500' : 'text-gray-400 hover:text-red-400'}`}>
              {post.yo_like ? <IconHeartFilled size={16} /> : <IconHeart size={16} />}
            </button>
            <button ref={likesCountRef}
              onClick={() => setLikesAnchor(likesAnchor ? null : likesCountRef.current)}
              className={`text-[13px] font-medium leading-none transition-colors ${post.likes_count > 0 ? 'text-gray-500 hover:text-[var(--primary)] cursor-pointer' : 'text-gray-300 pointer-events-none select-none'}`}>
              {post.likes_count > 0 ? post.likes_count : '0'}
            </button>
          </div>
          {/* Comment group — only for posts */}
          {post.tipo === 'post' && (
            <button onClick={toggleComments}
              className="flex items-center gap-1.5 text-[13px] font-medium text-gray-400 hover:text-[var(--primary)] transition-colors cursor-pointer leading-none">
              <IconMessageCircle size={16} />
              {post.comentarios_count > 0 && <span>{post.comentarios_count}</span>}
              <span>{showComments ? 'Ocultar' : 'Comentar'}</span>
            </button>
          )}
        </div>

        {/* Comments section — only for posts */}
        {post.tipo === 'post' && showComments && (
          <div className="border-t border-gray-50 px-4 py-3 space-y-3">
            {loadingComments ? (
              <div className="flex justify-center py-4"><Spinner size={24} /></div>
            ) : (
              <>
                {comentarios.map(c => (
                  <CommentItem
                    key={c.id}
                    comment={c}
                    postId={post.id}
                    session={session}
                    isAdmin={isAdmin}
                    onReply={() => { setReplyTo({ id: c.id, nombre: c.autor.nombre }); setTimeout(() => commentInputRef.current?.focus(), 50) }}
                    onDelete={(cid, parentId) => {
                      if (parentId) {
                        setComentarios(prev => prev.map(p => p.id === parentId ? { ...p, respuestas: p.respuestas.filter(r => r.id !== cid) } : p))
                      } else {
                        setComentarios(prev => prev.filter(p => p.id !== cid))
                      }
                      updatePost(post.id, { comentarios_count: Math.max(0, post.comentarios_count - 1) })
                    }}
                  />
                ))}
                <div className="flex gap-2 items-start pt-1">
                  <Avatar nombre={session.nombre} fotoUrl={myFoto} size={28} />
                  <div className="flex-1">
                    {replyTo && (
                      <div className="flex items-center gap-1 mb-1 text-[11px] text-[var(--primary)] bg-[var(--primary-light)] rounded-lg px-2 py-1">
                        <span>Respondiendo a {replyTo.nombre}</span>
                        <button onClick={() => setReplyTo(null)} className="ml-auto cursor-pointer"><IconX size={11} /></button>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <textarea ref={commentInputRef} value={commentText} onChange={e => setCommentText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment() } }}
                        placeholder="Escribí un comentario..." rows={1}
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-[13px] outline-none focus:border-[var(--primary)] resize-none" />
                      <button onClick={submitComment} disabled={submittingComment || !commentText.trim()}
                        className="w-8 h-8 mt-0.5 bg-[var(--primary)] text-white rounded-xl flex items-center justify-center disabled:opacity-40 cursor-pointer hover:opacity-90 shrink-0">
                        <IconCheck size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {likesAnchor && <LikesPopover postId={post.id} anchor={likesAnchor} onClose={() => setLikesAnchor(null)} />}
    </>
  )
}

// ─── Comment Item ─────────────────────────────────────────────────────────────

function CommentItem({
  comment, postId, session, isAdmin, onReply, onDelete,
}: {
  comment: Comentario
  postId: number
  session: SessionUser
  isAdmin: boolean
  onReply: () => void
  onDelete: (cid: number, parentId?: number) => void
}) {
  async function deleteComment(cid: number, parentId?: number) {
    const res = await fetch(`/api/muro/${postId}/comentarios/${cid}`, { method: 'DELETE' })
    if (res.ok) onDelete(cid, parentId)
  }

  const canDelete = (cid: number, authorId: string) => isAdmin || authorId === session.id

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-start group">
        <Avatar nombre={comment.autor.nombre} fotoUrl={comment.autor.foto_perfil} size={26} />
        <div className="flex-1 bg-gray-50 rounded-xl px-3 py-2">
          <div className="flex items-baseline gap-2">
            <span className="text-[12px] font-semibold">{comment.autor.nombre}</span>
            <span className="text-[10px] text-gray-400">{timeAgo(comment.created_at)}</span>
            {canDelete(comment.id, comment.autor.id) && (
              <button
                onClick={() => deleteComment(comment.id)}
                className="ml-auto opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 cursor-pointer transition-all"
                title="Eliminar comentario"
              >
                <IconX size={12} />
              </button>
            )}
          </div>
          <p className="text-[13px] text-[var(--text)] mt-0.5 whitespace-pre-wrap">{comment.contenido}</p>
        </div>
      </div>
      <div className="ml-9">
        <button onClick={onReply} className="text-[11px] text-gray-400 hover:text-[var(--primary)] cursor-pointer font-medium">Responder</button>
      </div>
      {comment.respuestas?.length > 0 && (
        <div className="ml-9 space-y-2">
          {comment.respuestas.map(r => (
            <div key={r.id} className="flex gap-2 items-start group">
              <Avatar nombre={r.autor.nombre} fotoUrl={r.autor.foto_perfil} size={22} />
              <div className="flex-1 bg-gray-50 rounded-xl px-3 py-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-[12px] font-semibold">{r.autor.nombre}</span>
                  <span className="text-[10px] text-gray-400">{timeAgo(r.created_at)}</span>
                  {canDelete(r.id, r.autor.id) && (
                    <button
                      onClick={() => deleteComment(r.id, comment.id)}
                      className="ml-auto opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 cursor-pointer transition-all"
                      title="Eliminar respuesta"
                    >
                      <IconX size={12} />
                    </button>
                  )}
                </div>
                <p className="text-[13px] text-[var(--text)] mt-0.5 whitespace-pre-wrap">{r.contenido}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Poll View ────────────────────────────────────────────────────────────────

function PollView({
  post, isAdmin, updatePost,
}: {
  post: MuroPost
  isAdmin: boolean
  updatePost: (id: number, patch: Partial<MuroPost>) => void
}) {
  const [voting, setVoting] = useState(false)
  const [showVotantes, setShowVotantes] = useState(false)
  const voted = post.mi_voto != null
  // Results visible only to admin or when explicitly published
  const canSeeResults = isAdmin || post.resultados_publicados
  const total = post.votos_total ?? 0

  async function vote(opcionId: number) {
    if (voted || post.cerrado) return
    setVoting(true)
    const res = await fetch(`/api/muro/${post.id}/votar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opcion_id: opcionId }),
    })
    setVoting(false)
    if (res.ok) {
      const allRes = await fetch('/api/muro?offset=0')
      if (allRes.ok) {
        const all: MuroPost[] = await allRes.json()
        const updated = all.find(p => p.id === post.id)
        if (updated) updatePost(post.id, updated)
      }
    }
  }

  return (
    <div className="px-4 pb-4 space-y-2">
      {post.opciones?.map(op => {
        const pct = canSeeResults && total > 0 ? Math.round(((op.votos ?? 0) / total) * 100) : 0
        const isSelected = post.mi_voto === op.id
        return (
          <div key={op.id}>
            <button
              onClick={() => vote(op.id)}
              disabled={voted || post.cerrado || voting}
              className={`w-full text-left relative rounded-xl border overflow-hidden transition-all cursor-pointer disabled:cursor-default ${
                isSelected ? 'border-[var(--primary)] bg-[var(--primary-light)]/50' : 'border-gray-200 hover:border-[var(--primary)]/50'
              }`}
            >
              {canSeeResults && (
                <div className="absolute inset-y-0 left-0 bg-[var(--primary)]/10 transition-all" style={{ width: `${pct}%` }} />
              )}
              <div className="relative flex items-center justify-between px-3 py-2.5 gap-2">
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${isSelected ? 'border-[var(--primary)] bg-[var(--primary)]' : 'border-gray-300'}`}>
                    {isSelected && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                  </div>
                  <span className="text-[13px] font-medium">{op.texto}</span>
                </div>
                {canSeeResults && <span className="text-[12px] text-gray-500 shrink-0">{pct}% · {op.votos ?? 0}</span>}
              </div>
            </button>
            {/* Admin: voter names (colapsable) */}
            {isAdmin && op.votantes && op.votantes.length > 0 && showVotantes && (
              <p className="text-[11px] text-gray-400 mt-0.5 ml-2">{op.votantes.join(', ')}</p>
            )}
          </div>
        )
      })}
      {canSeeResults && total > 0 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-[11px] text-gray-400">{total} voto{total !== 1 ? 's' : ''} en total</p>
          {isAdmin && (
            <button onClick={() => setShowVotantes(v => !v)}
              className="text-[11px] text-[var(--primary)] font-medium cursor-pointer hover:opacity-70 transition-opacity">
              {showVotantes ? 'Ocultar votantes' : 'Ver quién votó'}
            </button>
          )}
        </div>
      )}
      {voted && !canSeeResults && (
        <p className="text-[12px] text-[var(--primary)] font-medium">✓ Voto registrado. Los resultados se publicarán al cerrar la encuesta.</p>
      )}
      {!voted && !post.cerrado && !canSeeResults && (
        <p className="text-[11px] text-gray-400">Los resultados no se muestran hasta que el admin los publique</p>
      )}
    </div>
  )
}

// ─── Question View ────────────────────────────────────────────────────────────

function QuestionView({
  post, session, isAdmin, updatePost,
}: {
  post: MuroPost
  session: SessionUser
  isAdmin: boolean
  updatePost: (id: number, patch: Partial<MuroPost>) => void
}) {
  const [respuesta, setRespuesta] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [showRespuestas, setShowRespuestas] = useState(false)
  const answered = !!post.mi_respuesta

  async function submit() {
    if (!respuesta.trim()) return
    setSending(true); setError('')
    const res = await fetch(`/api/muro/${post.id}/responder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contenido: respuesta }),
    })
    setSending(false)
    if (res.ok) {
      updatePost(post.id, { mi_respuesta: respuesta, respuestas_count: (post.respuestas_count ?? 0) + 1 })
      setRespuesta('')
    } else {
      const d = await res.json(); setError(d.error || 'Error')
    }
  }

  return (
    <div className="px-4 pb-4 space-y-3">
      {!isAdmin && (
        answered ? (
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[11px] text-gray-400 mb-1">Tu respuesta</p>
            <p className="text-[13px] text-[var(--text)]">{post.mi_respuesta}</p>
          </div>
        ) : post.cerrado ? (
          <p className="text-[12px] text-gray-400">Esta pregunta ya está cerrada.</p>
        ) : (
          <div className="space-y-2">
            <textarea value={respuesta} onChange={e => setRespuesta(e.target.value)}
              placeholder="Escribí tu respuesta..." rows={3}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-[13px] outline-none focus:border-[var(--primary)] resize-none" />
            {error && <p className="text-[12px] text-red-500">{error}</p>}
            <div className="flex justify-end">
              <button onClick={submit} disabled={sending || !respuesta.trim()}
                className="px-4 py-2 bg-[var(--primary)] text-white text-[13px] font-semibold rounded-xl disabled:opacity-40 hover:opacity-90 cursor-pointer">
                {sending ? 'Enviando...' : 'Enviar respuesta'}
              </button>
            </div>
          </div>
        )
      )}

      {/* Admin: always sees all responses */}
      {isAdmin && (
        <div className="space-y-2">
          {(post.respuestas_count ?? 0) > 0 ? (
            <>
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  {post.respuestas_count} respuesta{post.respuestas_count !== 1 ? 's' : ''}{!post.resultados_publicados ? ' · solo vos las ves' : ''}
                </p>
                <button onClick={() => setShowRespuestas(v => !v)}
                  className="text-[11px] text-[var(--primary)] font-medium cursor-pointer hover:opacity-70 transition-opacity">
                  {showRespuestas ? 'Ocultar' : 'Ver respuestas'}
                </button>
              </div>
              {showRespuestas && post.respuestas?.map((r, i) => (
                <div key={i} className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[11px] text-gray-400 mb-0.5">{r.autor}</p>
                  <p className="text-[13px] text-[var(--text)]">{r.contenido}</p>
                </div>
              ))}
            </>
          ) : (
            <p className="text-[12px] text-gray-400">Todavía no hay respuestas</p>
          )}
        </div>
      )}

      {/* Published results visible to employees too */}
      {!isAdmin && post.resultados_publicados && post.respuestas && post.respuestas.length > 0 && (
        <div className="space-y-2 mt-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              {post.respuestas.length} respuesta{post.respuestas.length !== 1 ? 's' : ''} de todos
            </p>
            <button onClick={() => setShowRespuestas(v => !v)}
              className="text-[11px] text-[var(--primary)] font-medium cursor-pointer hover:opacity-70 transition-opacity">
              {showRespuestas ? 'Ocultar' : 'Ver todas'}
            </button>
          </div>
          {showRespuestas && post.respuestas.map((r, i) => (
            <div key={i} className="bg-gray-50 rounded-xl p-3">
              <p className="text-[13px] text-[var(--text)]">{r.contenido}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
