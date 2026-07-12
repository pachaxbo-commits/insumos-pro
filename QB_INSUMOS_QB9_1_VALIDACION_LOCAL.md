# QB-9.1 - Validacion local aislada

## Veredicto

Estado: **NO EJECUTADO EN BASE DE DATOS POR SEGURIDAD**.

Motivo: no se encontro un entorno PostgreSQL/Supabase local confirmado. `.env.local` apunta a `https://wfhvuzigmkgojdoofjib.supabase.co`, por lo que queda descartado para QB-9.1. No se aplico SQL, no se conecto a Supabase remoto y no se usaron Staging ni Produccion.

## Entorno detectado

| Elemento | Resultado |
| --- | --- |
| Supabase CLI | No encontrado |
| Docker | No encontrado |
| psql | No encontrado |
| Puerto 5432 | No escuchando |
| Puerto 54321 | No escuchando |
| Puerto 54322 | No escuchando |
| Puerto 8000 | No escuchando |
| Directorio `supabase/` | No encontrado |
| `docker-compose*` / `compose*` | No encontrado |
| `.env.local` | Remoto `*.supabase.co`, no apto para pruebas QB-9.1 |
| `.env.local.qb-test` | Creado como plantilla local aislada |

## Confirmacion local

No hay confirmacion local/aislada suficiente.

Para que QB-9.1 pueda ejecutar SQL, la URL debe apuntar solo a `localhost`, `127.0.0.1` o un contenedor Docker local, y debe existir una base con baseline real del proyecto antes de aplicar las migraciones QB.

## Migraciones canonicas para ejecutar cuando exista base local

No usar `SUPABASE_SCHEMA.sql`.

Orden desde baseline verificado:

1. `SUPABASE_MIGRATION_FASE_12A_SECURITY.sql`
2. `SUPABASE_MIGRATION_FASE_12C_USERS_AUDIT.sql`
3. `SUPABASE_MIGRATION_FASE_12D_SAFE_CANCELLATIONS.sql`, solo si el baseline legacy lo requiere y antes de 14D.1
4. `SUPABASE_MIGRATION_FASE_13_ORDERS.sql`, solo si falta base legacy y nunca despues de 15D
5. `SUPABASE_MIGRATION_FASE_14B_PURCHASE_BATCHES.sql`
6. `SUPABASE_MIGRATION_FASE_14C_CONFIRM_PURCHASE_BATCHES.sql`, solo antes de 14D/14D.1
7. `SUPABASE_MIGRATION_FASE_14D_PURCHASE_CLASSIFICATION.sql`, solo antes de 14D.1
8. `SUPABASE_MIGRATION_FASE_14D_1_PRECISION_INTEGRITY.sql`
9. `SUPABASE_MIGRATION_FASE_15B_PUBLIC_CATALOG.sql`, solo si falta dependencia historica
10. `SUPABASE_MIGRATION_FASE_15C_PUBLIC_CHECKOUT.sql`, solo antes de 15D
11. `SUPABASE_MIGRATION_FASE_15D_SECURE_ORDER_CONFIRMATION.sql`
12. `SUPABASE_MIGRATION_FASE_15E_CUSTOMER_ACCOUNTS.sql`
13. `SUPABASE_MIGRATION_FASE_16_QB2_UNITS_PRESENTATIONS.sql`
14. `SUPABASE_MIGRATION_FASE_17_QB3_PRODUCT_CONFIGURATION.sql`
15. `SUPABASE_MIGRATION_FASE_18_QB4_MERCHANDISE_RECEIPTS.sql`
16. `SUPABASE_MIGRATION_FASE_19_QB5_CUSTOMER_CATALOG_ORDERS.sql`
17. `SUPABASE_MIGRATION_FASE_20_QB6_ORDER_PREPARATION_DELIVERY.sql`
18. `SUPABASE_MIGRATION_FASE_21_QB7_ACCUMULATED_RECEIPTS.sql`

## Migraciones omitidas explicitamente

- `SUPABASE_SCHEMA.sql`: consolidado historico, no canonico.
- `SUPABASE_MIGRATION_FASE_15F_B_FULFILLMENT_FOUNDATION.sql`: fulfillment legacy con ventas/pagos/caja.
- `SUPABASE_MIGRATION_FASE_15F_C_FULFILL_CONFIRMED_ORDER.sql`: contradice flujo QB.
- Migraciones legacy fuera del orden indicado en `QB_INSUMOS_MIGRACIONES_CANONICAS.md`.

## Comandos seguros para preparar el entorno local

Instalar herramientas locales:

```powershell
npm install
npm exec supabase -- --version
```

Iniciar Supabase local cuando exista configuracion local:

```powershell
npm exec supabase -- init
npm exec supabase -- start
npm exec supabase -- status
```

Actualizar `.env.local.qb-test` con URL y llaves locales mostradas por `supabase status`. No copiar llaves de Staging ni Produccion.

Aplicar migraciones manualmente solo contra base local confirmada:

```powershell
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f ".\SUPABASE_MIGRATION_FASE_16_QB2_UNITS_PRESENTATIONS.sql"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f ".\SUPABASE_MIGRATION_FASE_17_QB3_PRODUCT_CONFIGURATION.sql"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f ".\SUPABASE_MIGRATION_FASE_18_QB4_MERCHANDISE_RECEIPTS.sql"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f ".\SUPABASE_MIGRATION_FASE_19_QB5_CUSTOMER_CATALOG_ORDERS.sql"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f ".\SUPABASE_MIGRATION_FASE_20_QB6_ORDER_PREPARATION_DELIVERY.sql"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f ".\SUPABASE_MIGRATION_FASE_21_QB7_ACCUMULATED_RECEIPTS.sql"
```

Estos comandos asumen que el baseline ya existe. Si faltan `profiles`, `products`, `inventory_movements`, `customer_accounts`, `current_user_role()` o `set_current_timestamp_updated_at()`, detener la prueba y restaurar el baseline local correcto.

## Pruebas de humo pendientes

No ejecutadas porque no hay base local confirmada.

Cuando exista base local:

- Validar tablas QB-2 a QB-7.
- Validar RLS con usuario administrador, inventario y cliente.
- Validar ingreso clasificado 60/20/20 sin duplicar stock base.
- Validar catalogo y pedido sin precios.
- Validar preparacion sin movimiento de stock.
- Validar entrega con un solo descuento.
- Validar recibo sin stock, cobro, caja, CxC ni CxP.
- Validar reportes de solo lectura.

## Confirmaciones de seguridad

- No se ejecuto SQL local ni remoto.
- No se uso Supabase Staging.
- No se uso Supabase Produccion.
- No se uso `.env.local` para pruebas SQL.
- No se hizo deploy.
- No se hizo commit.
- No se modificaron datos historicos.
- No se reactivaron ventas, pagos, caja, finanzas, CxC, CxP, compras legacy, fulfillment ni recibos fiscales.

## Continuacion con Supabase local

Estado: **PARCIALMENTE VALIDADO CON BLOQUEO FUNCIONAL EN QB-5**.

Docker Desktop quedo disponible y se inicializo una pila Supabase local aislada con `supabase init` y `supabase start`. No se ejecuto `supabase login`, `supabase link` ni `supabase db push`.

### Herramientas verificadas

| Comando | Resultado |
| --- | --- |
| `node -v` | `v24.13.0` |
| `npm -v` | `11.6.2` |
| `docker --version` | Docker `29.6.1` |
| `docker info` | Servidor Docker Desktop local operativo |
| `docker context show` | `desktop-linux` |
| `npx supabase --version` | `2.109.1` |

### Supabase local

| Elemento | Resultado |
| --- | --- |
| API local | `http://127.0.0.1:54321` |
| DB local | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Studio local | `http://127.0.0.1:54323` |
| Project ref remoto | No existe `supabase/.temp/project-ref` |
| Referencias remotas en `supabase/` | No encontradas |
| `.env.local` | Sigue remoto, no usado para SQL |

### Archivos locales agregados

- `supabase/config.toml`
- `supabase/.gitignore`
- `supabase/seed.sql`
- `supabase/migrations/20260712090100_qb_local_empty_baseline.sql`
- `supabase/migrations/20260712090200_fase_12a_security.sql`
- `supabase/migrations/20260712090300_fase_12c_users_audit.sql`
- `supabase/migrations/20260712090400_fase_15e_customer_accounts.sql`
- `supabase/migrations/20260712090500_qb2_units_presentations.sql`
- `supabase/migrations/20260712090600_qb3_product_configuration.sql`
- `supabase/migrations/20260712090700_qb4_merchandise_receipts.sql`
- `supabase/migrations/20260712090800_qb5_customer_catalog_orders.sql`
- `supabase/migrations/20260712090900_qb6_order_preparation_delivery.sql`
- `supabase/migrations/20260712091000_qb7_accumulated_receipts.sql`
- `supabase/tests/qb9_1_e2e_local.sql`

Las migraciones raiz no se modificaron. Las migraciones de `supabase/migrations` son copias locales ordenadas, salvo el baseline minimo local para base vacia.

### Migraciones aplicadas localmente

`npx supabase db reset` aplico correctamente 10 migraciones locales:

1. Baseline local vacio QB-9.1.
2. Fase 12A seguridad.
3. Fase 12C usuarios/auditoria.
4. Fase 15E customer accounts.
5. QB-2 unidades/presentaciones.
6. QB-3 configuracion de productos.
7. QB-4 ingresos.
8. QB-5 catalogo/pedidos.
9. QB-6 preparacion/entrega.
10. QB-7 recibos.

No se aplicaron:

- `SUPABASE_SCHEMA.sql`.
- `SUPABASE_MIGRATION_FASE_15F_B_FULFILLMENT_FOUNDATION.sql`.
- `SUPABASE_MIGRATION_FASE_15F_C_FULFILL_CONFIRMED_ORDER.sql`.
- Migraciones legacy no necesarias para el flujo QB local.

### Smoke tecnico local

Resultado de conteos despues de migrar:

| Check | Resultado |
| --- | ---: |
| Migraciones aplicadas | 10 |
| Tablas QB | 21 |
| Rutinas QB | 15 |
| Dimensiones QB | 2 |
| Unidades QB | 5 |
| Unidades obligatorias `kg`, `libra`, `arroba`, `cuartilla` | 4 |
| Tablas placeholder legacy `sales`, `payments`, `cash_movements` | 3 |

### E2E local

Resultado: **fallo esperado y bloqueante en QB-5**.

El flujo avanzo hasta intentar crear un pedido desde cliente externo con `create_qb_catalog_order`. La RPC intenta insertar un snapshot de conversion con:

```text
qb_conversion_snapshots.created_by = auth.uid()
```

pero `qb_conversion_snapshots.created_by` referencia `public.profiles(id)`, y el cliente externo existe en `customer_accounts`/`auth.users`, no en `profiles`.

Error local:

```text
insert or update on table "qb_conversion_snapshots" violates foreign key constraint "qb_conversion_snapshots_created_by_fkey"
Key (created_by)=(cliente local) is not present in table "profiles".
```

Este bloqueo impide validar end-to-end cliente -> pedido -> preparacion -> entrega -> recibo sin introducir un perfil interno falso para el cliente. No se hizo ese bypass porque ocultaria el defecto.

### Riesgo identificado

QB-5, tal como esta migrado, puede fallar para clientes externos reales al crear pedidos si no existe una fila equivalente en `profiles`.

Opciones tecnicas para corregir antes de repetir QB-9.1:

- permitir que snapshots creados por clientes externos usen `created_by = null`;
- separar `created_by_profile_id` de `created_by_auth_user_id`;
- cambiar la FK de snapshots a `auth.users(id)` si ese es el contrato deseado;
- crear un modelo explicito de actor/auditoria que soporte internos y clientes sin convertir clientes en roles internos.

La correccion debe hacerse en una fase de bugfix revisada, no dentro del set local de validacion.

### Verificaciones de aplicacion

Ejecutadas con variables de entorno locales sobreescritas en el proceso:

| Comando | Resultado |
| --- | --- |
| `npm run lint` | OK |
| `npx tsc --noEmit` | OK |
| `npm run build` | OK |

Nota: `next build` sigue reportando `.env.local` porque Next lo detecta automaticamente, pero las variables del proceso apuntaron a `http://127.0.0.1:54321`. No se ejecuto SQL desde el build.

### Estado final local

- Supabase local queda corriendo.
- Studio local: `http://127.0.0.1:54323`.
- API local: `http://127.0.0.1:54321`.
- DB local: `127.0.0.1:54322`.
- Servicios detenidos reportados por Supabase: `supabase_imgproxy_insumos-pro`, `supabase_pooler_insumos-pro`.
- `supabase_vector_insumos-pro` puede aparecer reiniciando, pero DB/API/Auth/Studio estan operativos para la validacion realizada.

## Continuacion QB-9.2 - 2026-07-12

Resultado: **la causa raiz de snapshots queda corregida; la preparacion de Staging sigue bloqueada por hallazgos adicionales**.

Se agrego la migracion aditiva `SUPABASE_MIGRATION_FASE_22_QB9_2_SNAPSHOT_ACTOR_FIX.sql` y su copia local ordenada. `npx supabase db reset` aplico 11 migraciones desde una base vacia sin error.

El E2E local completo paso para:

- unidades `kg`, `libra`, `arroba`, `cuartilla` y carga de papa `112.5 kg`;
- ingreso de 10 cargas: `1125 kg`, clasificados `675/225/225`, base y merma sin stock;
- pedido de cliente externo sin `profiles`, sin precios ni movimientos de stock;
- preparacion de 1.5 arrobas = `16.875 kg`, sin mover stock;
- ingreso simple adicional de `10 kg` con actor interno correctamente trazado;
- entrega unica con stock grande final `668.125 kg` y doble entrega bloqueada;
- recibo con precio compuesto `126.2252`, visual `126.23`, total `2130.05`;
- emision/anulacion sin ventas, pagos, caja ni CxC y pedido restaurado a pendiente de recibo;
- actor interno en QB-4/QB-6 y actor Auth externo en QB-5;
- aislamiento RLS de pedidos y tablas internas, usando grants temporales dentro de una transaccion revertida.

Hallazgos nuevos, no corregidos en QB-9.2 por estar fuera de su alcance:

1. Las tablas QB no tienen grants operativos de `SELECT` para `authenticated`; RLS existe, pero el portal no puede consultar `qb_orders` en la base canonica local.
2. `src/lib/reports/data.ts` usa `location_id`, `result_type` y `output_label`; el esquema canonico define `customer_location_id`, `output_type` y `label`.

Por estos dos hallazgos el veredicto permanece **REQUIERE NUEVA CORRECCION** antes de preparar Staging.

Verificaciones finales de aplicacion: `npm run lint` OK, `npx tsc --noEmit` OK y `npm run build` OK con variables del proceso apuntando a Supabase local.

## Continuacion QB-9.3 - 2026-07-12

Resultado: **grants y referencias QB-8 corregidos; requiere nueva correccion del baseline antes de Staging**.

- Fase 23 aplicada desde cero como migracion numero 12.
- E2E completo OK sin grants temporales.
- RLS permanece habilitado en las 21 tablas QB.
- Cliente A/B, usuario sin cuenta, inventario y administrador pasaron la matriz SQL/REST.
- `customer_location_id`, `output_type` y `label` respondieron correctamente.
- Cliente real local cargo `/catalogo`, `/catalogo/checkout` y `/mi-cuenta` con su ubicacion.
- Inventario real local cargo `/pedidos` con dos pedidos y datos de preparacion/entrega.
- `/ingresos` detecto `product_categories.is_catalog_visible` ausente.
- `/reportes` fallo de forma segura; la consulta REST exacta devolvio `42703` para `products.sku` ausente.
- La comprobacion visual de administrador se interrumpio al cambiar la sesion; por REST local pudo leer configuracion y recibos.
- Lint, TypeScript y build: OK.

No se agregaron las columnas base faltantes porque QB-9.3 autorizaba solo grants y tres referencias de reportes. CSV real y aprobacion para Staging quedan pendientes.

Riesgo adicional: `products` mantiene SELECT amplio para `authenticated` y contiene precios legacy. Debe crearse un contrato de lectura curado para clientes antes de Staging. Docker Desktop dejo de responder en la comprobacion final posterior a todas las pruebas; no se modifico su configuracion.

## Cierre QB-9.4 - 2026-07-12

Resultado: **APROBADO PARA PREPARAR STAGING**.

- Fase 24 completa `products.sku`, `stock_min`, `supplier_name` y el contrato activo de auditoria.
- Las columnas de visibilidad legacy no se incorporaron.
- La visibilidad QB queda exclusivamente en `qb_product_unit_settings.is_visible_in_qb_catalog`.
- Clientes externos reciben cero filas de `products` por RLS y usan `get_qb_public_catalog()`.
- Reset final: 13 migraciones desde cero.
- E2E final sin grants temporales: OK.
- UI cliente/inventario/administrador: todas las rutas requeridas cargaron datos sin alertas.
- Reportes y CSV real: OK.
- Lint, TypeScript y build local: OK.

Detalle: `QB_INSUMOS_QB9_4_BASELINE_PRODUCT_ACCESS_FIX.md`.

## Cierre QB-9.5 - 2026-07-12

Resultado: **LISTO PARA SOLICITAR ACCESO DE SOLO LECTURA A STAGING**.

- Fase 25 define el contrato minimo de `service_role`.
- Grants finales: `profiles SELECT/INSERT`, `audit_logs INSERT`, `customer_accounts INSERT`.
- Sin acceso directo service role a productos, stock, tablas QB o legacy.
- Admin Auth API local, inserciones permitidas y denegaciones esperadas: OK.
- Reset final: 14 migraciones.
- E2E funcional, RLS, reportes y CSV: OK.
- Scripts de inventario, esquema esperado, backup y autorizaciones preparados sin ejecutarse.

El acceso, inventario y backup de Staging requieren autorizaciones futuras separadas.
