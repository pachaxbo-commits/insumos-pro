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
