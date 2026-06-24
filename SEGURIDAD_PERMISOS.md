# SEGURIDAD_PERMISOS

## Resumen

Insumos Pro usa Supabase Auth, perfiles en `public.profiles`, rutas privadas en Next.js, Server Actions con validacion de rol y RLS en Supabase.

## Roles

- `administrador`: acceso completo, incluida configuracion y bitacora.
- `ventas`: dashboard, ventas, clientes, productos/inventario en lectura y reportes permitidos.
- `inventario`: dashboard, productos, inventario, compras, proveedores y reportes operativos.
- `finanzas`: dashboard, finanzas, clientes, ventas/compras en lectura y reportes financieros.

## Rutas privadas

Todas las rutas de negocio estan dentro de `src/app/(private)` y pasan por `requireRoleAccess`.

- Usuarios no autenticados redirigen a `/login`.
- Usuarios inactivos o sin perfil redirigen a `/acceso-restringido`.
- La navegacion se filtra por rol con `filterNavigationByRole`.

## Server Actions

Las acciones principales validan rol antes de mutar:

- Productos e inventario: `administrador`, `inventario`.
- Compras/proveedores: `administrador`, `inventario`.
- Ventas/clientes: `administrador`, `ventas`.
- Finanzas: `administrador`, `finanzas`.

## RLS

`SUPABASE_SCHEMA.sql` habilita RLS en tablas operativas. Las politicas separan lectura y mutacion por rol.

Fase 12A endurece esta regla:

- `profiles` ya no permite update directo del propio usuario para evitar escalamiento de rol.
- `inventory_movements`, `sales`, `purchases`, `payments` y `cash_movements` no aceptan mutaciones directas desde cliente.
- Las mutaciones que afectan stock, caja o saldos deben pasar por RPCs validadas y Server Actions.
- La matriz detallada vive en `MATRIZ_PERMISOS_FASE_12A.md`.

Hallazgos de Fase 10:

- Se agrego `audit_logs` con RLS.
- Se agrego `current_user_role()` para politicas seguras sin recursividad.
- Se agrego politica para que administradores puedan leer perfiles y ver nombres en bitacora.

## Validaciones de negocio

- Stock negativo se bloquea en inventario y ventas.
- Ventas a credito solo para clientes tipo `credito`.
- Limite de credito se valida al confirmar venta.
- Pagos mayores al saldo se bloquean en funciones financieras.
- Compras/ventas confirmadas no se confirman dos veces.

## Recomendaciones

- Mantener credenciales fuera del repositorio.
- Usar usuarios demo separados de usuarios reales.
- Revisar RLS al agregar cualquier tabla nueva.
- Habilitar logs/alertas de Supabase y Vercel para produccion.
- Ejecutar `PLAN_PRUEBAS_STAGING_FASE_12A.md` antes de tocar produccion real.
