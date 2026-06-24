# PLAN_PRUEBAS_STAGING_FASE_12A

## Alcance

Estas pruebas se ejecutan en un proyecto Supabase de staging, nunca directamente en produccion.

## Preparacion

1. Crear o seleccionar proyecto Supabase de staging.
2. Configurar `.env.local` o variables de Vercel Preview apuntando a staging.
3. Ejecutar `SUPABASE_SCHEMA.sql` en base limpia o `SUPABASE_MIGRATION_FASE_12A_SECURITY.sql` si staging ya tenia fases previas.
4. Opcional: ejecutar `SUPABASE_SEED_DEMO.sql` solo para datos ficticios.
5. Crear usuarios Auth para `administrador`, `ventas`, `inventario`, `finanzas` y un usuario inactivo.
6. Asignar roles con `admin_update_profile` o SQL controlado inicial.

## Pruebas obligatorias

### Privilegios en profiles

- [ ] Login como `ventas`.
- [ ] Intentar actualizar su propio `profiles.role` a `administrador` desde Supabase client.
- [ ] Resultado esperado: RLS bloquea el update.
- [ ] Login como `administrador`.
- [ ] Ejecutar `admin_update_profile` sobre un usuario de prueba.
- [ ] Resultado esperado: actualiza rol/estado correctamente.

### Usuario inactivo

- [ ] Marcar usuario como `is_active = false`.
- [ ] Intentar login.
- [ ] Resultado esperado: acceso restringido o rechazo claro.
- [ ] Intentar ejecutar una RPC operativa con ese usuario.
- [ ] Resultado esperado: error de permisos.

### Mutaciones directas bloqueadas

- [ ] Como `inventario`, intentar insertar directo en `inventory_movements`.
- [ ] Como `ventas`, intentar insertar directo en `sales` y `sale_items`.
- [ ] Como `finanzas`, intentar insertar directo en `payments` y `cash_movements`.
- [ ] Resultado esperado: RLS bloquea todas las mutaciones directas.

### Compras

- [ ] Crear compra desde UI.
- [ ] Confirmar compra una vez.
- [ ] Validar que stock sube y existe movimiento de inventario.
- [ ] Intentar confirmar la misma compra otra vez.
- [ ] Resultado esperado: error claro, sin segundo movimiento.

### Ventas

- [ ] Crear venta desde UI.
- [ ] Confirmar venta una vez.
- [ ] Validar que stock baja y existe movimiento de inventario.
- [ ] Intentar confirmar la misma venta otra vez.
- [ ] Resultado esperado: error claro, sin segundo movimiento.
- [ ] Intentar venta sin stock suficiente.
- [ ] Resultado esperado: error claro y sin cambios parciales.

### Finanzas y caja

- [ ] Crear venta a credito.
- [ ] Registrar cobro parcial.
- [ ] Validar `accounts_receivable`, `customers.current_balance`, `payments` y `cash_movements`.
- [ ] Intentar cobro mayor al saldo.
- [ ] Resultado esperado: error claro y sin cambios.

### Auditoria

- [ ] Confirmar compra.
- [ ] Confirmar venta.
- [ ] Registrar cobro.
- [ ] Registrar pago proveedor o gasto manual.
- [ ] Verificar en `/configuracion` que existan eventos en bitacora.

## Criterio para pasar a produccion

- Todas las pruebas obligatorias pasan.
- No hay mutaciones directas permitidas en tablas criticas.
- No se aplico `SUPABASE_SEED_DEMO.sql` en produccion.
- Hay backup probado.
- Cliente aprueba la regla temporal de correcciones por movimientos compensatorios auditados.

