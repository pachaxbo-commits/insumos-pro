# QA E2E — Costos reales desde Compras y FIFO en Recibos (`2026-11-16`)

Entorno QA ejecutado localmente contra el stack Docker existente `qb-pr20-e2e-qa` (`http://127.0.0.1:55821` / PostgreSQL `127.0.0.1:55822`) y servidor Next.js local en `http://127.0.0.1:3390` (sin modificar Production `https://qb-insumos.vercel.app` ni `tekfwbhvqtojpfqusosg`).

## 1. Fuente canónica del precio de compra

- **Fuente canónica confirmada**: **Hoja de Compras para Almacén** (`/ingresos/compras-almacen`) e **Ingresos de Mercadería** (`/ingresos`), respaldados por `public.qb_merchandise_receipts` (`status = 'confirmado'`) y `public.qb_merchandise_receipt_lines`.
- Al confirmar el ingreso (`confirm_qb_merchandise_receipt` / `confirm_qb_warehouse_purchase_draft`), se crean movimientos en `public.inventory_movements` (`entrada`) y `public.qb_merchandise_receipt_movements`, cuyo trigger `public.create_inventory_lot_from_receipt_movement()` genera lotes reales en `public.inventory_lots` con costo unitario a 8 decimales (`numeric(20, 8)`).
- Al confirmar una entrega en `/matriz-operativa` (`confirm_qb_matrix_delivery`), el trigger `consume_inventory_fifo_after_delivery` (`public.consume_inventory_fifo_for_delivery()`) consume lotes existentes en orden FIFO (`ORDER BY received_at, created_at, id`) y registra el detalle exacto en `public.inventory_lot_consumptions`.
- **Fuentes excluidas**:
  - **Hoja de Provisión** (`/matriz-operativa/mercado`, `qb_order_preparation_items.provision_cost_unit`): solo referencia operativa, no mueve inventario ni fija costos en Recibos.
  - **Compras en borrador** (`qb_merchandise_receipts.status = 'borrador'`): no crean lotes ni afectan Recibos hasta su confirmación.
  - **Último costo manual ingresado en Recibos**: solo se muestra como referencia histórica (`Compra ant.: ...`); nunca rellena automáticamente la tarifa de costo en recibos nuevos sin stock.

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

## 3. Migración nueva

- [`supabase/migrations/20261116120000_qb_fifo_receipt_costs_from_confirmed_purchases.sql`](../../supabase/migrations/20261116120000_qb_fifo_receipt_costs_from_confirmed_purchases.sql) (idempotente; verificada doble ejecución en Docker QA).

## 4. Resultados PASS/FAIL (Playwright sobre formularios auténticos + SQL)

| Caso | Escenario | Resultado | Recibo(s) QA | Evidencia |
| --- | --- | --- | --- | --- |
| **1** | `LECHUGA MANTECA` sin stock inicia siempre en `Bs 0` (`NULL` en DB, emisión bloqueada) | **PASS** | `QBR-20261117-5551D2` | [Captura caso 1](screenshots-costos-fifo-2026-11-16/case-01-lechuga-sin-stock-bs0.png) |
| **2** | Ingreso manual `Bs 20` emitido; siguiente recibo sin stock vuelve a `Bs 0` (`Compra ant.: 20,00 Bs/BOLSA`) | **PASS** | `QBR-20261117-E0C771` | [Captura caso 2](screenshots-costos-fifo-2026-11-16/case-02-lechuga-vuelve-a-bs0.png) |
| **3** | `PAPA HOLANDESA GRANDE` con 1 lote confirmado (`10 KG × Bs 11,50`) -> FIFO `Bs 11,50/KG` | **PASS** | `QBR-20261117-BC6C3D` | [Captura caso 3](screenshots-costos-fifo-2026-11-16/case-03-papa-un-lote-fifo.png) |
| **4** | **Caso obligatorio 2 lotes** (`2 KG @ Bs 10` + `3 KG @ Bs 14`, entrega `5 KG`) -> **`Bs 62,00` / `Bs 12,40/KG`** | **PASS** | `QBR-20261117-72A08C` | [Captura caso 4](screenshots-costos-fifo-2026-11-16/case-04-obligatorio-dos-lotes-12-40.png) |
| **5** | Consumo parcial (`2,5 KG @ 10`) + cruce al siguiente lote (`1,5 KG @ 10 + 1,5 KG @ 16 = Bs 39` -> `Bs 13,00/KG`) | **PASS** | `QBR-20261117-A28364` | [Captura caso 5](screenshots-costos-fifo-2026-11-16/case-05-consumo-parcial-cruce-lotes.png) |
| **6** | Stock final `0` tras entrega conserva FIFO `Bs 16,00/KG`; entrega posterior sin stock inicia en `Bs 0` | **PASS** | `QBR-20261117-08FCB1` | [Captura caso 6](screenshots-costos-fifo-2026-11-16/case-06-stock-cero-post-entrega-fifo.png) |
| **7** | Consumo histórico sin costo (`historical_unknown`) y entrega mixta muestran `Costo pendiente`, sin inventar ceros ni alterar lotes | **PASS** | `QBR-20261117-9FE60C`, `QBR-20261117-181C0D` | [Captura caso 7](screenshots-costos-fifo-2026-11-16/case-07-costo-pendiente-sin-inventar.png) |
| **8** | `Precio anterior` conserva venta anterior del cliente (`13,80`) separada de `Compra ant.` (`11,50 Bs/KG`) y FIFO (`14,10`) | **PASS** | `QBR-20261117-B4D354` | [Captura caso 8](screenshots-costos-fifo-2026-11-16/case-08-precio-anterior-vs-compra-ant.png) |
| **9** | Compra en borrador y costo de Provisión (`Bs 15`) dejan recibo en `Bs 0`; compra confirmada aplica `Bs 20,00/KG` | **PASS** | `QBR-20261117-E7F3EB`, `QBR-20261117-C3D9C0` | [Captura caso 9](screenshots-costos-fifo-2026-11-16/case-09-borrador-provision-no-aplican.png) |
| **10** | `1 ARROBA = Bs 95` (`11,25 KG` -> `8,44444444 Bs/KG`), protección `legacy_dump` `95/ARROBA`, recargos aditivos `20%` (`Bs 114,00`), historial inmutable, permisos y 4 modos de limpieza | **PASS** | `QBR-20261117-79A8A9` | [Captura caso 10](screenshots-costos-fifo-2026-11-16/case-10-unidades-factores-inmutabilidad.png) |

## 5. Consultas SQL de respaldo

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

```sql
SELECT p.name, dm.delivered_base_quantity, dm.warehouse_base_quantity, c.quantity_consumed, c.unit_cost, c.total_cost, c.cost_status
FROM public.inventory_lot_consumptions c
JOIN public.products p ON p.id = c.product_id
JOIN public.qb_order_delivery_movements dm ON dm.id = c.delivery_movement_id
ORDER BY c.created_at;
```

```text
          name          | delivered_base_quantity | warehouse_base_quantity | quantity_consumed |  unit_cost  | total_cost  |    cost_status
------------------------+-------------------------+-------------------------+-------------------+-------------+-------------+--------------------
 PAPA HOLANDESA GRANDE  |                4.000000 |                4.000000 |          4.000000 | 11.50000000 | 46.00000000 | known
 PAPA HOLANDESA MEDIANA |                5.000000 |                5.000000 |          2.000000 | 10.00000000 | 20.00000000 | known
 PAPA HOLANDESA MEDIANA |                5.000000 |                5.000000 |          3.000000 | 14.00000000 | 42.00000000 | known
 PAPA IMILLA            |                2.500000 |                2.500000 |          2.500000 | 10.00000000 | 25.00000000 | known
 PAPA IMILLA            |                3.000000 |                3.000000 |          1.500000 | 10.00000000 | 15.00000000 | known
 PAPA IMILLA            |                3.000000 |                3.000000 |          1.500000 | 16.00000000 | 24.00000000 | known
 PAPA IMILLA            |                2.500000 |                2.500000 |          2.500000 | 16.00000000 | 40.00000000 | known
 PAPA HOLANDESA GRANDE  |               10.000000 |               10.000000 |          6.000000 | 11.50000000 | 69.00000000 | known
 PAPA HOLANDESA GRANDE  |               10.000000 |               10.000000 |          4.000000 | 18.00000000 | 72.00000000 | known
 PAPA IMILLA MEDIANA    |                3.000000 |                3.000000 |          3.000000 | 20.00000000 | 60.00000000 | known
 PAPA HOLANDESA MEDIANA |                2.000000 |                2.000000 |          2.000000 |             |             | historical_unknown
 PAPA IMILLA MEDIANA    |                3.000000 |                2.000000 |          2.000000 | 20.00000000 | 40.00000000 | known
 QA PAPA PESO ARROBA    |               11.250000 |               11.250000 |         11.250000 |  8.44444444 | 94.99999995 | known
```

```sql
SELECT r.receipt_number, r.status, l.product_name_snapshot, l.delivered_base_quantity, l.base_unit_symbol,
       l.cost_source, l.cost_base_unit_snapshot, l.cost_total_precise, l.final_unit_price, l.line_total
FROM public.qb_receipt_lines l
JOIN public.qb_receipts r ON r.id = l.receipt_id
ORDER BY r.created_at;
```

```text
   receipt_number    |  status  | product_name_snapshot  | delivered_base_quantity | base_unit_symbol | cost_source | cost_base_unit_snapshot | cost_total_precise | final_unit_price | line_total
---------------------+----------+------------------------+-------------------------+------------------+-------------+-------------------------+--------------------+------------------+------------
 QBR-20261117-5551D2 | emitido  | LECHUGA MANTECA        |                2.000000 | BOLSA            | manual      |             20.00000000 |        40.00000000 |          24.0000 |      48.00
 QBR-20261117-E0C771 | borrador | LECHUGA MANTECA        |                3.000000 | BOLSA            |             |                         |                    |                  |
 QBR-20261117-BC6C3D | emitido  | PAPA HOLANDESA GRANDE  |                4.000000 | KG               | fifo        |             11.50000000 |        46.00000000 |          13.8000 |      55.20
 QBR-20261117-72A08C | emitido  | PAPA HOLANDESA MEDIANA |                5.000000 | KG               | fifo        |             12.40000000 |        62.00000000 |          13.6400 |      68.20
 QBR-20261117-7BCF8A | borrador | PAPA IMILLA            |                2.500000 | KG               | fifo        |             10.00000000 |        25.00000000 |          10.0000 |      25.00
 QBR-20261117-A28364 | borrador | PAPA IMILLA            |                3.000000 | KG               | fifo        |             13.00000000 |        39.00000000 |          13.0000 |      39.00
 QBR-20261117-08FCB1 | borrador | PAPA IMILLA            |                2.500000 | KG               | fifo        |             16.00000000 |        40.00000000 |          16.0000 |      40.00
 QBR-20261117-EA5951 | borrador | PAPA IMILLA            |                2.000000 | KG               |             |                         |                    |                  |
 QBR-20261117-B4D354 | borrador | PAPA HOLANDESA GRANDE  |               10.000000 | KG               | fifo        |             14.10000000 |       141.00000000 |          14.1000 |     141.00
 QBR-20261117-E7F3EB | borrador | PAPA IMILLA MEDIANA    |                3.000000 | KG               |             |                         |                    |                  |
 QBR-20261117-C3D9C0 | borrador | PAPA IMILLA MEDIANA    |                3.000000 | KG               | fifo        |             20.00000000 |        60.00000000 |          20.0000 |      60.00
 QBR-20261117-9FE60C | emitido  | PAPA HOLANDESA MEDIANA |                2.000000 | KG               | manual      |             18.50000000 |        37.00000000 |          20.3500 |      40.70
 QBR-20261117-181C0D | borrador | PAPA IMILLA MEDIANA    |                3.000000 | KG               |             |                         |                    |                  |
 QBR-20261117-79A8A9 | borrador | QA PAPA PESO ARROBA    |               11.250000 | KG               | fifo        |              8.44444444 |        94.99999995 |          10.1333 |     114.00
```
