# BCO HUMAND — Contexto para Claude Code

## Qué es
Sistema de RRHH para salón de belleza argentino. Migración de Google Apps Script + Sheets a Next.js + Supabase.

## Stack
- **Frontend**: Next.js 16 (App Router, TypeScript, Tailwind CSS)
- **Backend/DB**: Supabase (PostgreSQL) - URL: `https://ivwqqfnfvfqpqyehzver.supabase.co`
- **Auth**: JWT propio con bcryptjs (no Supabase Auth), cookie httpOnly `token`
- **Deploy futuro**: Vercel

## Estructura del proyecto
```
src/
├── app/
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Redirect a /login o /dashboard
│   ├── login/page.tsx          # Login page
│   ├── dashboard/
│   │   ├── layout.tsx          # Layout con Navigation + auth check
│   │   ├── page.tsx            # Home dashboard
│   │   └── empleados/page.tsx  # CRUD empleados (funcional)
│   └── api/
│       ├── auth/login/route.ts   # POST login
│       ├── auth/logout/route.ts  # POST logout
│       ├── empleados/route.ts    # GET list, POST create
│       ├── empleados/[id]/route.ts # GET one, PUT update, DELETE
│       ├── equipos/route.ts      # GET equipos
│       └── roles/route.ts        # GET roles
├── components/
│   ├── Navigation.tsx          # Desktop sidebar + mobile bottom nav + drawer
│   └── ui/
│       ├── Icons.tsx           # SVG icons
│       └── index.tsx           # Button, Input, Select, Spinner, Modal, Toast, Confirm
├── lib/
│   ├── supabase.ts             # Supabase client
│   └── auth.ts                 # getSession, requireAuth, requireAdmin (JWT)
├── types/
│   └── index.ts                # TypeScript interfaces
└── middleware.ts               # Protege rutas /dashboard (JWT verify)
```

## Diseño (IMPORTANTE — seguir estrictamente)
- **Paleta**: gradient `linear-gradient(135deg, #667eea, #764ba2)`, primary `#6366f1`
- **Layout desktop**: header gradient fijo arriba + sidebar blanco izq 208px + contenido derecha
- **Layout mobile**: top bar gradient + bottom nav 4 items + botón "Más" con drawer
- **Diseño mobile-first**: TODO se diseña primero para mobile, después se adapta a desktop con `lg:`
- **No overflow horizontal**: nunca scroll lateral, `overflow-x: hidden` en html/body
- **Tablas**: en desktop tabla con header gris neutro. En mobile se convierten en cards
- **Modales**: usar componente `Modal` de `@/components/ui` que usa `createPortal` al body (resuelve bug de backdrop-filter). En mobile se ven como bottom sheet centrado
- **Inputs en mobile**: siempre `font-size: 16px` para evitar zoom iOS
- **Sin emojis**: solo iconos SVG de `@/components/ui/Icons`
- **Badges/estados**: integrados en celdas de tabla como `<span>` con fondo sutil y border-radius, no chips sueltos
- **Formularios en modal**: campos apilados, `grid-cols-2` solo para campos cortos (Tel/DNI, Equipo/Rol)
- **Filtros mobile**: apilados verticalmente, buscador en su propia fila

## Supabase - Tablas existentes
- `usuarios` (id UUID, usuario, reloj, nombre, email, equipo_id, rol_id, password_hash, salt, estado_cuenta, etc.)
- `equipos` (id, nombre)
- `roles` (id, nombre, descripcion, permisos)
- `horarios_base` (usuario_id, fecha, inicio_base, fin_base, horas_base)
- `primer_turno_dia` (usuario_id, fecha, primer_turno, ultimo_turno, cant_citas)
- `asistencia_raw` (usuario_id, fecha, hora, uid)
- `asistencia_procesada` (usuario_id, fecha, semana, dia_semana, estado/chip, horas, etc.)
- `solicitudes` (usuario_id, tipo, dias, fecha_inicio, fecha_fin, motivo, estado, etc.)
- `notificaciones` (usuario_id, titulo, mensaje, tipo, leida)
- `configuracion` (clave, valor JSONB)
- `log_seguridad` (usuario_id, accion, detalle, ip)

RLS está activado con policies permisivas (SELECT/UPDATE/INSERT/DELETE ON usuarios para anon).

## Lógica de negocio crítica

### Chips de asistencia
- Asistió, Llegada tarde, Salida temprana, Tarde justificado, Incompleto
- Sin turnos, Sin fichada, Vacaciones, Feriado/Local cerrado
- Ausencia justificada, Ausencia injustificada, Ausente

### Reglas
- Masajistas/Depiladoras: NO se evalúa salida temprana
- Regla 30 min: "Tarde justificado" si primer turno >30min después del base
- Incompleto: 1 fichada → asignar a entrada o salida por proximidad
- Doble toque: mismas fichadas mismo minuto = 1 fichada

### Módulos pendientes (en este orden)
1. **Solicitudes** — CRUD, aprobación/rechazo por admin, vista empleado
2. **Asistencia** — importación Fresha, fichadas HIK, regenerar procesada, presentismo
3. **Liquidador** — comisiones, recibos PDF
4. **Compras** — registro de compras con fotos
5. **Mural/Social** — posts internos
6. **Notificaciones** — listado y marcar leídas
7. **Configuración** — parámetros del sistema

## Reglas para Claude Code
- **Mobile first**: todo se diseña primero para 375px, después lg: para desktop
- **No revertir código sin consultar**
- **Ediciones quirúrgicas**: no reescribir archivos completos si el cambio es de pocas líneas
- **Usar componentes existentes**: Modal, Button, Input, Select, Toast, Confirm, Spinner, Badge
- **Nuevos iconos**: agregarlos a Icons.tsx siguiendo el mismo patrón (Tabler Icons style)
- **API routes**: en `src/app/api/[modulo]/route.ts`, validar con supabase
- **Español en toda la UI**
- **Formato argentino**: punto como miles, coma como decimal