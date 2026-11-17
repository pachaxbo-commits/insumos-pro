# QA E2E — Costos reales desde Compras y FIFO en Recibos (`2026-11-16`)

Entorno QA ejecutado localmente contra el stack Docker existente `qb-pr20-e2e-qa` (`http://127.0.0.1:55821` / PostgreSQL `127.0.0.1:55822`) y servidor Next.js local en `http://127.0.0.1:3390` (sin modificar Production `https://qb-insumos.vercel.app` ni `tekfwbhvqtojpfqusosg`).

---

## 1. Fuente canónica del precio de compra

- **Fuente canónica confirmada**: **Hoja de Compras para Almacén** (`/ingresos/compras-almacen`) e **Ingresos de Mercadería** (`/ingresos`), respaldados por `public.qb_merchandise_receipts` (`status = 'confirmado'`) y `public.qb_merchandise_receipt_lines`.
- Al confirmar el ingreso (`confirm_qb_merchandise_receipt` / `confirm_qb_warehouse_purchase_draft`), se crean movimientos en `public.inventory_movements` (`entrada`) y `public.qb_merchandise_receipt_movements`, cuyo trigger `public.create_inventory_lot_from_receipt_movement()` genera lotes reales en `public.inventory_lots` con costo unitario a 8 decimales (`numeric(20, 8)`).
- Al confirmar una entrega en `/matriz-operativa` (`confirm_qb_matrix_delivery`), el trigger `consume_inventory_fifo_after_delivery` (`public.consume_inventory_fifo_for_delivery()`) consume lotes existentes en orden FIFO (`ORDER BY received_at, created_at, id`) y registra el detalle exacto en `public.inventory_lot_consumptions`.
- **Fuentes excluidas**:
  - **Hoja de Provisión** (`/matriz-operativa/mercado`, `qb_order_preparation_items.provision_cost_unit`): solo referencia operativa, no mueve inventario ni fija costos en Recibos.
  - **Compras en borrador** (`qb_merchandise_receipts.status = 'borrador'`): no crean lotes ni afectan Recibos hasta su confirmación.
  - **Último costo manual ingresado en Recibos**: solo se muestra como referencia histórica (`Manual ant.: ...`); nunca rellena automáticamente la tarifa de costo en recibos nuevos sin stock.

---

## 2. Fórmula FIFO implementada

Para una línea de recibo en modo `line_cost_markup`:

1. **Sin entrega de almacén (`warehouse_base_quantity = 0`)**:
   - `cost_base_unit_snapshot = NULL`, `cost_source = NULL` en DB; en la UI inicia siempre en `Bs 0` editable con aviso `Sin stock en almacén · ingresa el costo real`.

2. **Con consumos FIFO conocidos completos** (sin porción externa sin conciliar, sin consumos `historical_unknown`, y con suma consumida coincidente con la entrega de almacén):
   - $\text{CostoTotal}_{\text{FIFO}} = \sum_{i=1}^{n} \operatorname{round}(q_i \times c_i, 8)$ usando `inventory_lot_consumptions.total_cost`
   - $\text{TarifaCosto}_{\text{FIFO}} = \operatorname{round}\!\left(\dfrac{\text{CostoTotal}_{\text{FIFO}}}{\text{delivered\_base\_quantity}}, 8\right)$
   - Ejemplo obligatorio: Lote A `2 KG × Bs 10,00 = Bs 20,00` + Lote B `3 KG × Bs 14,00 = Bs 42,00` $\Rightarrow \text{Total } = \text{Bs } 62,00 \Rightarrow \dfrac{62}{5} = \mathbf{Bs\ 12,40/KG}$.

3. **Sin costo conocido o entrega mixta externa sin conciliar**:
   - Si existe al menos un consumo con `cost_status = 'historical_unknown'` / `unit_cost IS NULL` o una parte externa sin costo conocido (`warehouse_base_quantity > 0` y `unreconciled_external > 0`), no se inventa tarifa ni se asume cero: `cost_base_unit_snapshot = NULL`, la UI muestra `Costo pendiente: ...`, bloquea `Emitir recibo`, y permite resolución manual auditada (`cost_source = 'manual'`) sin alterar `inventory_lots` ni `inventory_lot_consumptions`.

---

## 3. Resolución de las 3 incompatibilidades (Revisión Final PR #21)

### Incompatibilidad 1 (PRIORIDAD ALTA) — Reglas antiguas que podían prevalecer sobre FIFO
- **Diagnóstico**: La función `public.snapshot_fifo_cost_for_new_receipt_line()` contenía el bypass temprano `if new.cost_rule_id is not null then return new; end if;`, y el trigger previo `zzz_snapshot_qb_receipt_cost_rule` asociaba reglas de `qb_product_cost_rules` antes de evaluar FIFO.
- **Corrección**:
  - En la migración `20261116233000`, la función interna `private.snapshot_qb_receipt_cost_rule()` neutraliza explícitamente cualquier asignación de regla cuando el recibo opera en modo `line_cost_markup`: deja `cost_rule_id = null`, `cost_base_unit_snapshot = null`, `cost_source = null`, `cost_calculation_status = 'unconfigured'`.
  - En `public.snapshot_fifo_cost_for_new_receipt_line()`, se removió completamente el bypass `if new.cost_rule_id is not null`. Toda entrega con stock de almacén obtiene su tarifa estricta desde FIFO, ignorando reglas configuradas; y todo producto sin stock de almacén inicia estrictamente en `NULL` / `Bs 0` en UI.
  - Se preservan intactas las configuraciones históricas de `qb_product_cost_rules` y la inmutabilidad de los recibos ya emitidos.

### Incompatibilidad 2 (PRIORIDAD ALTA) — Control de modificaciones manuales de FIFO
- **Diagnóstico**: `set_qb_receipt_line_pricing()` permitía sobreescribir silenciosamente la tarifa FIFO por una manual al enviar el formulario general de la línea.
- **Corrección**:
  - `set_qb_receipt_line_pricing()` fue actualizado para proteger las líneas calculadas con FIFO:
    - Modificar únicamente factores y recargos comerciales (distancia, exigencia, clima, extraordinario) preserva intacto `cost_source = 'fifo'` y su `cost_base_unit_snapshot`.
    - Intentar modificar directamente la tarifa unitaria en una línea `fifo` arroja la excepción controlada `QB_FIFO_COST_OVERRIDE_REQUIRES_EXPLICIT_ACTION: La tarifa calculada por FIFO no puede modificarse directamente en la tabla. Usa la acción de corrección excepcional con motivo de auditoría.` (SQLSTATE `42500`).
  - Para ajustes excepcionales autorizados, se implementó la función y Server Action `public.override_qb_receipt_fifo_cost(receipt_id, line_id, new_cost, reason)`:
    - Requiere rol administrativo activo.
    - Exige un motivo de auditoría no vacío.
    - Valida estrictamente que la línea posea una tarifa FIFO calculada (`cost_source = 'fifo'` y `cost_base_unit_snapshot IS NOT NULL`) y que el recibo esté en borrador; cualquier intento de aplicar esta corrección sobre una línea sin costo FIFO es rechazado con la excepción `QB_RECEIPT_LINE_NOT_FIFO: La línea no cuenta con una tarifa FIFO calculada para corregir.` (SQLSTATE `42500`).
    - Registra el evento auditable `costo_fifo_corregido_manualmente` en `public.qb_receipt_events`.
    - Actualiza la línea a `cost_source = 'manual'`, `cost_calculation_status = 'manual_override'`.
    - **No modifica ni corrompe** `inventory_lots` ni `inventory_lot_consumptions`.
  - En la UI, el input de costo para líneas FIFO está deshabilitado y se añade el botón **«Corregir costo FIFO...»** con modal accesible (`role="dialog"`) que exige el motivo antes de proceder.

### Incompatibilidad 3 (PRIORIDAD MEDIA) — Referencias históricas claramente diferenciadas
- **Diagnóstico**: `get_qb_receipt_lines_fifo_context()` devolvía un campo ambiguo `prev_cost` que mezclaba costos manuales previos con compras de almacén, etiquetando ambos indistintamente como «Compra ant.».
- **Corrección**:
  - `get_qb_receipt_lines_fifo_context()` ahora calcula y devuelve de forma estrictamente separada:
    - **Precio anterior**: última venta emitida correspondiente al cliente y producto (`previous_sale_price`), intacto e independiente.
    - **Costo anterior de compra**: `previous_purchase_cost_value` y `previous_purchase_cost_unit_symbol`, obtenido exclusivamente de ingresos confirmados de almacén (`qb_merchandise_receipts` confirmados). Se excluye la compra más reciente consumida por la entrega para reflejar fielmente la compra previa.
    - **Costo manual anterior**: `previous_manual_cost_value` y `previous_manual_cost_unit_symbol`, obtenido exclusivamente de líneas manuales en recibos emitidos anteriores.
  - En la UI se muestran identificadores independientes:
    - `Precio ant.: Bs X / [UNIDAD]`
    - `Compra ant.: X,XX Bs/[UNIDAD]`
    - `Manual ant.: X,XX Bs/[UNIDAD]`

---

## 4. Migraciones canónicas en la PR #21

1. [`supabase/migrations/20261116120000_qb_fifo_receipt_costs_from_confirmed_purchases.sql`](../../supabase/migrations/20261116120000_qb_fifo_receipt_costs_from_confirmed_purchases.sql)
   - Creación de infraestructura de cálculo FIFO sobre consumos confirmados, bloqueo de emisión sin costo, y snapshot inmutable en recibos.
   - Crea `get_qb_receipt_lines_fifo_context(uuid[])` con 10 columnas en `RETURNS TABLE`.
2. [`supabase/migrations/20261116233000_qb_fifo_override_guards_and_distinct_cost_references.sql`](../../supabase/migrations/20261116233000_qb_fifo_override_guards_and_distinct_cost_references.sql)
   - Neutralización de reglas antiguas sobre FIFO en `line_cost_markup`.
   - Protección de líneas FIFO contra edición accidental en `set_qb_receipt_line_pricing()`.
   - RPC auditada `override_qb_receipt_fifo_cost()` con validación estricta de procedencia FIFO (`cost_source = 'fifo'` y `cost_base_unit_snapshot IS NOT NULL`) y restricción en `qb_receipt_events` (9 valores permitidos, 100% compatible con los 8 tipos históricos).
   - **Compatibilidad PostgreSQL en tipo de retorno**:
     - PostgreSQL prohíbe modificar el número o tipos de columnas de una función con `RETURNS TABLE(...)` mediante `CREATE OR REPLACE FUNCTION` (SQLSTATE `42804`).
     - Se aplicó `DROP FUNCTION IF EXISTS public.get_qb_receipt_lines_fifo_context(uuid[]);` controlado sin `CASCADE` antes de recrearla con 12 columnas (`previous_manual_cost_value`, `previous_manual_cost_unit_symbol`).
     - Se verificó dependencia previa: 0 objetos dependientes (vistas, triggers o claves foráneas).
   - **Instalación secuencial demostrada**:
     - Aplicación limpia y consecutiva 135 -> 136 -> 137 en entorno desechable con esquema idéntico a Production.
     - 135 versiones iniciales -> migración 136 aplicada (función con 10 columnas) -> migración 137 aplicada (función con 12 columnas).

---

## 5. Matriz completa de resultados PASS/FAIL (15/15 PASS)

### Casos originales acordados (10/10 PASS)

| Caso | Escenario | Resultado | Recibo(s) QA | Evidencia |
| --- | --- | --- | --- | --- |
| **1** | `LECHUGA MANTECA` sin stock inicia siempre en `Bs 0` (`NULL` en DB, emisión bloqueada) | **PASS** | `QBR-20261117-7A493E` | [Captura caso 1](screenshots-costos-fifo-2026-11-16/case-01-lechuga-sin-stock-bs0.png) |
| **2** | Ingreso manual `Bs 20` emitido; siguiente recibo sin stock vuelve a `Bs 0` (`Manual ant.: 20,00 Bs/BOLSA`) | **PASS** | `QBR-20261117-DE7E62` | [Captura caso 2](screenshots-costos-fifo-2026-11-16/case-02-lechuga-vuelve-a-bs0.png) |
| **3** | `PAPA HOLANDESA GRANDE` con 1 lote confirmado (`10 KG × Bs 11,50`) -> FIFO `Bs 11,50/KG` | **PASS** | `QBR-20261117-871C86` | [Captura caso 3](screenshots-costos-fifo-2026-11-16/case-03-papa-un-lote-fifo.png) |
| **4** | **Caso obligatorio 2 lotes** (`2 KG @ Bs 10` + `3 KG @ Bs 14`, entrega `5 KG`) -> **`Bs 62,00` / `Bs 12,40/KG`** | **PASS** | `QBR-20261117-287E97` | [Captura caso 4](screenshots-costos-fifo-2026-11-16/case-04-obligatorio-dos-lotes-12-40.png) |
| **5** | Consumo parcial (`2,5 KG @ 10`) + cruce al siguiente lote (`1,5 KG @ 10 + 1,5 KG @ 16 = Bs 39` -> `Bs 13,00/KG`) | **PASS** | `QBR-20261117-C95ABC` | [Captura caso 5](screenshots-costos-fifo-2026-11-16/case-05-consumo-parcial-cruce-lotes.png) |
| **6** | Stock final `0` tras entrega conserva FIFO `Bs 16,00/KG`; entrega posterior sin stock inicia en `Bs 0` | **PASS** | `QBR-20261117-B543D5` | [Captura caso 6](screenshots-costos-fifo-2026-11-16/case-06-stock-cero-post-entrega-fifo.png) |
| **7** | Consumo histórico sin costo (`historical_unknown`) y entrega mixta muestran `Costo pendiente`, sin inventar ceros ni alterar lotes | **PASS** | `QBR-20261117-CE0799`, `QBR-20261117-5227DA` | [Captura caso 7](screenshots-costos-fifo-2026-11-16/case-07-costo-pendiente-sin-inventar.png) |
| **8** | `Precio anterior` conserva venta anterior del cliente (`13,80`) separada de `Compra ant.` (`11,50 Bs/KG`) y FIFO (`14,10`) | **PASS** | `QBR-20261117-CDB185` | [Captura caso 8](screenshots-costos-fifo-2026-11-16/case-08-precio-anterior-vs-compra-ant.png) |
| **9** | Compra en borrador y costo de Provisión (`Bs 15`) dejan recibo en `Bs 0`; compra confirmada aplica `Bs 20,00/KG` | **PASS** | `QBR-20261117-F0E8F1`, `QBR-20261117-32940D` | [Captura caso 9](screenshots-costos-fifo-2026-11-16/case-09-borrador-provision-no-aplican.png) |
| **10** | `1 ARROBA = Bs 95` (`11,25 KG` -> `8,44444444 Bs/KG`), protección `legacy_dump` `95/ARROBA`, recargos aditivos `20%` (`Bs 114,00`), historial inmutable, permisos y 4 modos de limpieza | **PASS** | `QBR-20261117-90F83C` | [Captura caso 10](screenshots-costos-fifo-2026-11-16/case-10-unidades-factores-inmutabilidad.png) |

### Casos adicionales de la revisión final (5/5 PASS)

| Caso | Escenario | Resultado | Verificación SQL / UI | Evidencia |
| --- | --- | --- | --- | --- |
| **Extra 1** | Regla de costo activa (`8,26 Bs/kg`) + lote FIFO (`14,00 Bs/kg`): FIFO prevalece sobre la regla | **PASS** | `cost_source: fifo`, `cost_base_unit_snapshot: 14.00`, `cost_rule_id: null` | [Captura extra 1](screenshots-costos-fifo-2026-11-16/case-extra-01-regla-vs-fifo-y-factores.png) |
| **Extra 2** | Regla de costo activa + producto sin salida de almacén: inicia estrictamente en `Bs 0` | **PASS** | `cost_source: null`, `cost_base_unit_snapshot: null`, `cost_rule_id: null` | [Captura extra 2](screenshots-costos-fifo-2026-11-16/case-extra-02-regla-sin-almacen-bs0.png) |
| **Extra 3** | Cambio de recargos comerciales en línea FIFO (distancia 20%): conserva `cost_source = 'fifo'` | **PASS** | `cost_source: fifo`, `cost_base: 14.00`, `precio_final: 16.80`, `total: 84.00` | [Captura extra 1](screenshots-costos-fifo-2026-11-16/case-extra-01-regla-vs-fifo-y-factores.png) |
| **Extra 4** | Intento directo de modificar tarifa FIFO es bloqueado; corrección excepcional vía RPC auditada con motivo registra evento y deja lotes intactos | **PASS** | Error `42500` en edición directa. RPC: `cost_source: manual`, `status: manual_override`, evento `costo_fifo_corregido_manualmente` registrado | [Captura extra 4](screenshots-costos-fifo-2026-11-16/case-extra-04-modal-correccion-excepcional-fifo.png) |
| **Extra 5** | Referencias diferenciadas: Costo anterior manual (`Manual ant.: 21,00 Bs/KG`) vs Costo anterior de compra (`Compra ant.: 11,00 Bs/KG`) | **PASS** | Producto A: `prev_purchase: 11`, `prev_manual: null`. Producto B: `prev_purchase: null`, `prev_manual: 21` | [Captura extra 5](screenshots-costos-fifo-2026-11-16/case-extra-05-referencias-compra-vs-manual.png) |

---

## 6. Consultas SQL de respaldo

### Lotes de inventario confirmados y sus consumos FIFO

```sql
SELECT p.name, il.initial_quantity, il.remaining_quantity, il.unit_cost, il.received_at::timestamptz(0)
FROM public.inventory_lots il
JOIN public.products p ON p.id = il.product_id
ORDER BY p.name, il.received_at;
```

```text
          name          | initial_quantity | remaining_quantity |  unit_cost  |      received_at
------------------------+------------------+--------------------+-------------+------------------------
 PAPA HOLANDESA GRANDE  |        10.000000 |           0.000000 | 11.50000000 | 2026-11-17 01:11:47+00
 PAPA HOLANDESA GRANDE  |         4.000000 |           0.000000 | 18.00000000 | 2026-11-17 01:13:46+00
 PAPA HOLANDESA MEDIANA |         2.000000 |           0.000000 | 10.00000000 | 2026-11-17 01:12:11+00
 PAPA HOLANDESA MEDIANA |         3.000000 |           0.000000 | 14.00000000 | 2026-11-17 01:12:18+00
 PAPA HOLANDESA MEDIANA |         4.000000 |           2.000000 |             | 2026-11-17 01:14:39+00
 PAPA IMILLA            |         4.000000 |           0.000000 | 10.00000000 | 2026-11-17 01:12:42+00
 PAPA IMILLA            |         4.000000 |           0.000000 | 16.00000000 | 2026-11-17 01:12:49+00
 PAPA IMILLA MEDIANA    |         5.000000 |           0.000000 | 20.00000000 | 2026-11-17 01:14:21+00
 QA PAPA PESO ARROBA    |        11.250000 |           0.000000 |  8.44444444 | 2026-11-17 01:15:15+00
```

### Verificación de rechazo directo y corrección excepcional auditada (Caso Extra 4)

```sql
-- 1. Intento de edición directa de tarifa sobre línea FIFO (parámetros reales de set_qb_receipt_line_pricing):
SELECT public.set_qb_receipt_line_pricing(
  '360f5e99-2872-40f1-9ce1-64b12aa9f176'::uuid,
  '[{"line_id":"7d423e66-f3f3-4d16-a097-3bdf016c8215","cost_base_unit":18.5,"distance_factor_percent":0,"exigency_factor_percent":0,"weather_factor_percent":0,"extraordinary_factor_percent":0}]'::jsonb
);
-- ERROR:  42500: QB_FIFO_COST_OVERRIDE_REQUIRES_EXPLICIT_ACTION: La tarifa calculada por FIFO no puede modificarse directamente en la tabla. Usa la acción de corrección excepcional con motivo de auditoría.

-- 2. Intento de corrección excepcional sobre línea SIN costo FIFO calculado (línea sin stock o sin consumos FIFO):
SELECT public.override_qb_receipt_fifo_cost(
  '3a40a812-a77a-47da-aec1-3ead48da6fc8'::uuid,
  'c07ede00-ec72-4bff-bb75-15a743e795b8'::uuid,
  18.5,
  'Intento inválido de corrección FIFO sobre línea sin stock'
);
-- ERROR:  42500: QB_RECEIPT_LINE_NOT_FIFO: La línea no cuenta con una tarifa FIFO calculada para corregir.

-- 3. Ejecución autorizada de acción excepcional sobre línea FIFO:
SELECT public.override_qb_receipt_fifo_cost(
  '4273414a-c118-4a28-bd55-c7e7de58bd33'::uuid,
  'ee614586-7538-4518-9ffe-570ffbe76b2e'::uuid,
  18.5,
  'Ajuste excepcional por merma autorizada'
);
-- Retorna el receipt_id: 4273414a-c118-4a28-bd55-c7e7de58bd33

-- 4. Estado resultante en qb_receipt_lines:
SELECT cost_source, cost_calculation_status, cost_base_unit_snapshot, notes
FROM public.qb_receipt_lines WHERE id = 'ee614586-7538-4518-9ffe-570ffbe76b2e';
-- manual | manual_override | 18.50000000 | ... Corrección excepcional FIFO: Ajuste excepcional por merma autorizada

-- 5. Registro de auditoría en qb_receipt_events (columnas canónicas event_type y metadata):
SELECT event_type, metadata->>'reason' as reason, metadata->>'previous_cost' as prev_cost, metadata->>'new_cost' as new_cost
FROM public.qb_receipt_events
WHERE receipt_id = '4273414a-c118-4a28-bd55-c7e7de58bd33'
  AND event_type = 'costo_fifo_corregido_manualmente';
--            event_type            |                 reason                  |  prev_cost  |  new_cost
-- ----------------------------------+-----------------------------------------+-------------+-------------
--  costo_fifo_corregido_manualmente | Ajuste excepcional por merma autorizada | 14.00000000 | 18.50000000

-- 6. Restricción qb_receipt_events_type_check compatible con históricos:
-- event_type = ANY (ARRAY['creado', 'lineas_editadas', 'precio_base_actualizado', 'emitido', 'anulado', 'reemplazado', 'control_actualizado', 'costos_compra_actualizados', 'costo_fifo_corregido_manualmente'])
```

### Verificación de referencias diferenciadas (Caso Extra 5)

```sql
SELECT
  line_id,
  previous_purchase_cost_value,
  previous_purchase_cost_unit_symbol,
  previous_manual_cost_value,
  previous_manual_cost_unit_symbol
FROM public.get_qb_receipt_lines_fifo_context(ARRAY['c5b7b023-b595-49b3-be33-2d684544edd4'::uuid]);
```

```text
               line_id                | previous_purchase_cost_value | previous_purchase_cost_unit_symbol | previous_manual_cost_value | previous_manual_cost_unit_symbol
--------------------------------------+------------------------------+------------------------------------+----------------------------+----------------------------------
 644c8657-f44f-4eb0-97fb-4eee0fbd6eee |                           11 | KG                                 |                            |
 6937129b-f3fa-47bd-98b2-959f2727c049 |                              |                                    |                         21 | KG
```

---

## 7. Verificación de instalación secuencial 135 -> 136 -> 137 en PostgreSQL

Demostración ejecutada en base de datos QA desechable inicializada en el estado de 135 migraciones de Production:

### 1. Estado inicial en 135 migraciones
```sql
SELECT count(*) FROM supabase_migrations.schema_migrations;
-- count: 135
-- Última migración: 20261114104000_qb_fix_customer_address_optional_in_orders.sql
-- get_qb_receipt_lines_fifo_context: No existe (NULL)
```

### 2. Aplicación de migración 136 (`20261116120000_qb_fifo_receipt_costs_from_confirmed_purchases.sql`)
```sql
SELECT count(*) FROM supabase_migrations.schema_migrations;
-- count: 136

SELECT pg_get_function_result('public.get_qb_receipt_lines_fifo_context(uuid[])'::regprocedure);
```
```text
TABLE(line_id uuid, warehouse_base_quantity numeric, external_base_quantity numeric, fifo_known_quantity numeric, fifo_known_total_cost numeric, fifo_unknown_quantity numeric, fifo_lot_count integer, fifo_lots_summary text, previous_purchase_cost_value numeric, previous_purchase_cost_unit_symbol text)
```
*(Firma original de 10 columnas).*

### 3. Aplicación de migración 137 (`20261116233000_qb_fifo_override_guards_and_distinct_cost_references.sql`)
```sql
SELECT count(*) FROM supabase_migrations.schema_migrations;
-- count: 137

SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5;
```
```text
    version     
----------------
 20261116233000
 20261116120000
 20261114104000
 20261114103000
 20261114101000
(5 rows)
```

```sql
SELECT pg_get_function_result('public.get_qb_receipt_lines_fifo_context(uuid[])'::regprocedure);
```
```text
TABLE(line_id uuid, warehouse_base_quantity numeric, external_base_quantity numeric, fifo_known_quantity numeric, fifo_known_total_cost numeric, fifo_unknown_quantity numeric, fifo_lot_count integer, fifo_lots_summary text, previous_purchase_cost_value numeric, previous_purchase_cost_unit_symbol text, previous_manual_cost_value numeric, previous_manual_cost_unit_symbol text)
```
*(Firma actualizada de 12 columnas instalada limpiamente mediante DROP controlado sin CASCADE ni errores de tipo).*
