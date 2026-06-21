import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/supabase'
import bcrypt from 'bcryptjs'
import { SignJWT } from 'jose'
import crypto from 'crypto'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'humand-secret-key-change-in-production'
)

function getIP(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'desconocida'
}

async function logSec(
  accion: string,
  detalle: string,
  ip: string,
  userAgent: string,
  usuarioId?: string,
  usuarioTexto?: string
) {
  await supabaseAdmin.from('log_seguridad').insert({
    accion,
    detalle,
    ip,
    user_agent: userAgent,
    usuario_id: usuarioId || null,
    usuario_texto: usuarioTexto || null,
  })
}

export async function POST(request: NextRequest) {
  const ip = getIP(request)
  const userAgent = request.headers.get('user-agent') || ''

  try {
    const { usuario: usuarioInput, password } = await request.json()

    if (!usuarioInput || !password) {
      return NextResponse.json({ error: 'Usuario y contraseña requeridos' }, { status: 400 })
    }

    const usuarioTrimmed = usuarioInput.toLowerCase().trim()

    // Buscar usuario con equipo y rol
    const { data: usuario, error } = await supabase
      .from('usuarios')
      .select('*, equipo:equipos(nombre), rol:roles(nombre)')
      .eq('usuario', usuarioTrimmed)
      .single()

    if (error || !usuario) {
      await logSec('usuario_no_encontrado', `Usuario "${usuarioTrimmed}" no existe`, ip, userAgent, undefined, usuarioTrimmed)
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 })
    }

    if (usuario.estado_cuenta === 'archivado') {
      await logSec('cuenta_inactiva', 'Intento de acceso a cuenta archivada', ip, userAgent, usuario.id, usuarioTrimmed)
      return NextResponse.json({ error: 'Login fallido. Por favor comunicate con el administrador.' }, { status: 403 })
    }

    if (usuario.estado_cuenta === 'bloqueada') {
      await logSec('cuenta_bloqueada', 'Intento de acceso a cuenta bloqueada', ip, userAgent, usuario.id, usuarioTrimmed)
      return NextResponse.json({ error: 'Cuenta bloqueada. Contactá al administrador.' }, { status: 403 })
    }

    if (usuario.estado_cuenta === 'inactiva') {
      await logSec('cuenta_inactiva', 'Intento de acceso a cuenta inactiva', ip, userAgent, usuario.id, usuarioTrimmed)
      return NextResponse.json({ error: 'Login fallido. Por favor comunicate con el administrador.' }, { status: 403 })
    }

    // Verificar contraseña — soporta SHA-256 legacy (64 hex chars) y bcrypt
    let passwordValid = false
    const isLegacyHash = /^[0-9a-f]{64}$/.test(usuario.password_hash)

    if (isLegacyHash && usuario.salt) {
      const sha256 = crypto.createHash('sha256').update(password + usuario.salt).digest('hex')
      passwordValid = sha256 === usuario.password_hash
      if (passwordValid) {
        const newHash = await bcrypt.hash(password, 10)
        await supabaseAdmin.from('usuarios').update({ password_hash: newHash, salt: null }).eq('id', usuario.id)
      }
    } else {
      passwordValid = await bcrypt.compare(password, usuario.password_hash)
    }

    if (!passwordValid) {
      const intentos = (usuario.intentos_fallidos || 0) + 1
      const bloqueada = intentos >= 5
      const updates: Record<string, unknown> = { intentos_fallidos: intentos }
      if (bloqueada) updates.estado_cuenta = 'bloqueada'

      await supabaseAdmin.from('usuarios').update(updates).eq('id', usuario.id)

      if (bloqueada) {
        await logSec('cuenta_bloqueada', `Cuenta bloqueada tras ${intentos} intentos fallidos`, ip, userAgent, usuario.id, usuarioTrimmed)
        return NextResponse.json({ error: 'Tu cuenta fue bloqueada por demasiados intentos fallidos. Contactá al administrador.' }, { status: 403 })
      }

      await logSec('contrasena_incorrecta', `Intento ${intentos} de 5`, ip, userAgent, usuario.id, usuarioTrimmed)
      return NextResponse.json({ error: 'Contraseña incorrecta.', intento: intentos, maxIntentos: 5 }, { status: 401 })
    }

    // Login exitoso: resetear intentos y actualizar último login
    await supabaseAdmin.from('usuarios').update({
      intentos_fallidos: 0,
      ultimo_login: new Date().toISOString()
    }).eq('id', usuario.id)

    await logSec('login_exitoso', 'Ingreso exitoso', ip, userAgent, usuario.id, usuarioTrimmed)

    // Crear JWT
    const token = await new SignJWT({
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol?.nombre || 'empleado',
      equipo: usuario.equipo?.nombre || ''
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('30d')
      .sign(JWT_SECRET)

    const response = NextResponse.json({
      ok: true,
      user: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol?.nombre || 'empleado',
        equipo: usuario.equipo?.nombre || ''
      }
    })

    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/'
    })

    return response
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
