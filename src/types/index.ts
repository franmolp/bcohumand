export interface Usuario {
  id: string
  usuario: string
  reloj: string | null
  nombre: string
  equipo_id: number | null
  email: string
  rol_id: number | null
  estado_cuenta: 'activa' | 'bloqueada' | 'inactiva'
  telefono: string | null
  dni: string | null
  fecha_nacimiento: string | null
  equipo?: Equipo
  rol?: Rol
}

export interface Equipo {
  id: number
  nombre: string
}

export interface Rol {
  id: number
  nombre: string
}

export interface SessionUser {
  id: string
  usuario?: string
  nombre: string
  email: string
  rol: string
  equipo: string
}

export interface AsistenciaProcesada {
  id: number
  usuario_id: string
  fecha: string
  semana: number | null
  dia_semana: string | null
  horario_base_entrada: string | null
  horario_base_salida: string | null
  horas_base: number | null
  fichada_entrada: string | null
  fichada_salida: string | null
  horas_fichadas: number | null
  estado: string | null
  minutos_tarde: number
  minutos_antes: number
  tiene_justificacion: boolean
  nota_justificacion: string | null
  editado_manual: boolean | null
  ultima_actualizacion: string
  tipo_ausencia?: string | null
  motivo?: string | null
  comentario_admin?: string | null
}

export interface HorarioBase {
  id: number
  usuario_id: string
  fecha: string
  inicio_base: string
  fin_base: string
  horas_base: number
  editado: boolean
}

export interface AsistenciaRaw {
  id: number
  usuario_id: string
  fecha: string
  hora: string
  uid: string | null
}

export interface MonotributoRecord {
  id: string
  usuario_id: string
  mes: string
  comprobante_url: string | null
  comprobante_nombre: string | null
  factura_url: string | null
  factura_nombre: string | null
  fecha_carga: string
}

export interface Proveedor {
  id: number
  nombre: string
  contacto?: string | null
  activo: boolean
  created_at: string
}

export interface Compra {
  id: number
  fecha: string
  proveedor_id: number | null
  proveedor_nombre: string | null
  proveedor?: Proveedor
  monto: number
  numero_factura?: string | null
  detalle?: string | null
  foto_url?: string | null
  estado_pago: 'efectivo' | 'transferencia' | 'pendiente'
  usuario_id: string | null
  usuario_email?: string | null
  usuario?: { nombre: string; email: string }
  created_at: string
}

export interface Solicitud {
  id: string
  usuario_id: string
  empleado_nombre: string
  empleado_email: string | null
  tipo: string
  dias: number | null
  fecha_inicio: string
  fecha_fin: string | null
  motivo: string | null
  estado: 'pending' | 'approved' | 'rejected'
  fecha_creacion: string
  moderador: string | null
  comentario_admin: string | null
  certificado_adjunto: string | null
  ediciones: unknown[] | null
  hora_ultima_actividad: string | null
  subtipo_horario: string | null
  horario_anterior: string | null
  horario_nuevo: string | null
  fecha_compensacion: string | null
}

export interface Adelanto {
  id: string
  usuario_id: string
  empleado_nombre: string
  monto: number
  monto_aprobado: number | null
  estado: 'pending' | 'approved' | 'rejected'
  comentario_empleado: string | null
  comentario_admin: string | null
  aprobado_por: string | null
  creado_por_admin: boolean
  created_at: string
  fecha_respuesta: string | null
}
