# QB-9.4 - Baseline canonico y acceso seguro a productos

Fecha: 2026-07-12

## Veredicto

**APROBADO PARA PREPARAR STAGING**.

La aprobacion cubre la preparacion controlada del entorno, no autoriza aplicar migraciones ni datos en Staging. Toda la validacion de esta fase se ejecuto contra Supabase local.

## Causa raiz

El baseline aislado QB-9.1 reconstruyo manualmente una parte del esquema base porque el repositorio no conserva la migracion original de creacion de `products`. Esa reconstruccion uso `stock_minimum` y omitio campos que las migraciones historicas y la aplicacion activa ya daban por existentes.

La politica inicial de `products` tambien permitia `SELECT USING (true)` a todo `authenticated`. Como clientes externos e internos comparten ese rol PostgreSQL, RLS no separaba sus identidades y exponia `purchase_price` y `sale_price`.

## Matriz de baseline

| Objeto/campo | Uso activo/evidencia | Antes | Evidencia historica verificada | Canonico | Accion |
|---|---|---:|---|---:|---|
| products.id | todos los modulos QB | si | Fases QB-2 a QB-7 | si | conservar |
| products.name | productos, ingresos, pedidos, reportes | si | Fases QB-2 a QB-7 | si | conservar |
| products.sku | productos, filtros, reportes | no | SUPABASE_SEED_DEMO usa INSERT y ON CONFLICT(sku) | si | agregar text + indice unique |
| products.description | productos | si | contrato base activo | si | conservar |
| products.category_id | productos/catalogo/reportes | si | Fases QB-5/QB-8 | si | conservar |
| products.stock_current | QB-4/QB-6/reportes | si | migraciones de inventario QB | si | conservar |
| products.stock_min | productos/reportes | no | Fases 14D y 14D.1 alteran stock_min | si | agregar numeric(14,3) |
| products.stock_minimum | solo baseline aislado | si | sin evidencia historica canonica | no activo | conservar por compatibilidad, sin usarlo |
| products.supplier_name | formulario base de productos | no | SUPABASE_SEED_DEMO | si | agregar text nullable |
| products.is_active | todos los modulos | si | fases QB | si | conservar |
| products.is_sellable | catalogo QB | si | Fase QB-5 | si | conservar |
| products.is_catalog_visible | catalogo legacy | no | Fase 15B legacy excluida | no para QB | no agregar; quitar referencias activas |
| products.catalog_availability | catalogo legacy | no | Fase 15B legacy excluida | no para QB | no agregar; quitar referencias activas |
| products.purchase_price | gestion interna legacy/base | si | contrato base | interno | ocultar por RLS a clientes |
| products.sale_price | gestion interna legacy/base | si | contrato base | interno | ocultar por RLS a clientes |
| products.created_at/updated_at | trazabilidad | si | contrato base | si | conservar |
| product_categories.id/name/is_active | productos/catalogo/reportes | si | fases QB | si | conservar |
| product_categories.is_catalog_visible | catalogo legacy | no | Fase 15B legacy excluida | no para QB | no agregar; quitar referencias activas |
| product_categories.created_at/updated_at | gestion base | si | contrato base | si | conservar |
| inventory_movements | QB-4, QB-6 y reportes | si | Fases QB-4/QB-6 | si | SELECT interno por RLS; mutacion critica por RPC |
| customer_accounts | cuenta cliente/reportes | si | Fase 15E | si | sin cambio de columnas |
| profiles | requireRoleAccess/RLS | si | Fases 12A/12C | si | sin cambio de columnas/roles |
| audit_logs.ip_address | configuracion y escritura de auditoria | no | Fase 12C + contrato TypeScript activo | si | agregar text nullable |
| audit_logs.user_agent | escritura de auditoria | no | Fase 12C + contrato TypeScript activo | si | agregar text nullable |

No se incorporaron `products.is_catalog_visible`, `product_categories.is_catalog_visible` ni `catalog_availability`.

## Fuente de verdad de visibilidad

- Visibilidad catalogo QB: `qb_product_unit_settings.is_visible_in_qb_catalog`.
- Producto habilitado para QB: `qb_product_unit_settings.is_qb_active`.
- Producto general activo: `products.is_active`.
- Producto vendible: `products.is_sellable`.
- Categoria activa: `product_categories.is_active`.

La RPC `get_qb_public_catalog()` combina esas reglas y no retorna costos, precios ni stock interno.

## Modelo de acceso a products

### Antes

- `authenticated` tenia `SELECT`.
- La politica RLS usaba `USING (true)`.
- Un cliente externo podia obtener filas completas, incluidas `purchase_price` y `sale_price`.

### Despues

- `anon`: sin privilegios directos de tabla.
- `authenticated`: `SELECT, INSERT, UPDATE`, pero RLS solo permite filas a roles `admin`, `administrador` e `inventario`.
- Cliente externo: la consulta directa devuelve cero filas; usa exclusivamente `get_qb_public_catalog()`.
- Internos: conservan lectura y gestion de productos segun su perfil.
- `service_role`: no se modifico.
- No existe `DELETE` directo para `authenticated`.

La concesion PostgreSQL compartida a `authenticated` es necesaria para PostgREST interno; RLS hace la separacion por identidad de aplicacion mediante `current_user_role()`.

## Migracion Fase 24

Archivos:

- `SUPABASE_MIGRATION_FASE_24_QB9_4_BASELINE_PRODUCT_ACCESS_FIX.sql`
- `supabase/migrations/20260712091300_qb9_4_baseline_product_access_fix.sql`

Contenido:

- `products.sku text`;
- `products.stock_min numeric(14,3) not null default 0`;
- `products.supplier_name text`;
- indice unique nullable para `sku`;
- constraint `stock_min >= 0`;
- `audit_logs.ip_address text`;
- `audit_logs.user_agent text`;
- grants minimos de productos/categorias/unidades/movimientos;
- politicas RLS internas para lectura y gestion base;
- sin tablas legacy, ventas, pagos, caja, CxC, CxP o fulfillment.

## Correcciones de codigo

- Productos, categorias, ingresos y reportes dejaron de consultar visibilidad legacy.
- Formularios y badges usan la configuracion QB para visibilidad.
- El portal cliente dejo de hacer join directo a `products`; resuelve nombres desde la RPC curada.
- QB-4 usa el nombre real truncado de la FK de resultado clasificado hacia `products`.
- QB-8 deja de consultar `qb_order_delivery_movements.base_unit_symbol`; usa el snapshot `actual_base_unit_symbol` de la linea de preparacion enlazada.
- Se mantienen las correcciones QB-9.3: `customer_location_id`, `output_type` y `label`.

## Validacion local

- Docker: `desktop-linux`, Docker Desktop 29.6.1.
- API: `http://127.0.0.1:54321`.
- DB: `127.0.0.1:54322`.
- `project-ref`: ausente.
- `npx supabase db reset`: OK desde base vacia, 13 migraciones.
- E2E sin grants temporales: OK.

Resultados E2E:

- ingreso clasificado: 10 cargas = 1125 kg, 675/225/225 y merma 0;
- ingreso simple: 10 kg;
- pedido: 2 arrobas = 22.5 kg, idempotencia y actor Auth correctos;
- preparacion: no mueve stock;
- entrega: 1.5 arrobas = 16.875 kg, stock final 668.125 kg y doble entrega bloqueada;
- recibo: 126.225225 matematico, 126.2252 almacenado, 126.23 mostrado, total 2130.05;
- emision/anulacion: sin stock, venta, pago, caja ni CxC;
- cliente A/B y usuario sin cuenta: aislamiento correcto;
- cliente directo a `products`: cero filas, sin precios legacy;
- catalogo curado: operativo.

## Aplicacion y CSV

Cliente:

- `/catalogo`: producto y unidad configurada visibles, sin precio.
- `/catalogo/checkout`: cuenta y ubicacion local visibles.
- `/mi-cuenta`: perfil, ubicaciones y pedidos cargan.

Inventario:

- `/productos`, `/parametrizacion`, `/ingresos`, `/pedidos`, `/reportes`: datos reales, sin alertas.

Administrador:

- `/`, `/productos`, `/parametrizacion`, `/ingresos`, `/pedidos`, `/recibos`, `/recibos/[id]`, `/reportes`, `/clientes`, `/configuracion`: datos reales, sin alertas.

CSV:

- generado desde la UI;
- 4 filas reales de inventario;
- archivo de 730 bytes;
- incluye fuente de verdad QB;
- no incluye precios, caja, pagos, QR, CxC ni CxP.

## Verificaciones de codigo

- `npm run lint`: OK.
- `npx tsc --noEmit`: OK.
- `npm run build`: OK con variables locales inyectadas desde `supabase status`.

## Riesgos pendientes

- El repositorio no conserva la migracion original completa del esquema base; Fase 24 documenta las adiciones verificadas, pero Staging debe comparar su esquema real antes de aplicar.
- `.env.local.qb-test` contiene marcadores y requiere inyeccion en memoria de claves locales.
- El comando administrativo REST con `service_role` no pudo insertar tablas creadas despues del grant global del baseline; no afecta flujos QB normales ni RPCs, pero debe revisarse si Staging usa service role para tareas administrativas.
- Docker Desktop se recupero y permanecio estable durante reset/E2E final.

## Siguiente paso

Preparar Staging mediante inventario de migraciones aplicadas, backup verificable y diff de esquema. No ejecutar aun: primero revisar Fase 24 y el riesgo de privilegios `service_role` en una copia aislada del esquema de Staging.

