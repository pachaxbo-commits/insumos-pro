# QB Insumos - QB-4 Ingresos de mercaderia y clasificacion opcional

## Estado de la fase

QB-4 crea el modulo nuevo de ingresos fisicos de mercaderia para QB Insumos. Es independiente de compras legacy, pagos, CxP, caja y finanzas.

Ruta privada usada:

- `/ingresos`

Migracion local preparada:

- `SUPABASE_MIGRATION_FASE_18_QB4_MERCHANDISE_RECEIPTS.sql`

La migracion no fue aplicada a PostgreSQL real desde esta sesion. `SUPABASE_SCHEMA.sql` no es fuente canonica.

## Modelo creado

Tablas nuevas:

- `qb_merchandise_receipts`: cabecera del ingreso.
- `qb_merchandise_receipt_lines`: producto recibido, unidad o presentacion, cantidad original, cantidad base y costo separado.
- `qb_merchandise_receipt_classification_results`: resultados reales o merma para ingresos clasificados.
- `qb_merchandise_receipt_movements`: enlace auditable entre ingreso QB y movimientos de inventario.

RPC nueva:

- `confirm_qb_merchandise_receipt(uuid)`.

Estados:

- `borrador`;
- `confirmado`;
- `anulado`.

La anulacion implementada en UI aplica solo a borradores sin movimientos. La reversion de ingresos confirmados queda fuera de QB-4.

## Flujo funcional

1. Administracion o inventario crea un borrador en `/ingresos`.
2. Selecciona producto QB activo.
3. Selecciona unidad o presentacion permitida para `recepcion`.
4. Ingresa cantidad recibida.
5. El sistema calcula cantidad base usando QB-2/QB-3.
6. Se guarda snapshot en `qb_conversion_snapshots`.
7. Si el ingreso requiere clasificacion, se guardan resultados y merma.
8. Al confirmar, se crean movimientos de inventario de entrada.
9. Si hay clasificacion, solo los productos resultado reciben stock.
10. La merma queda trazada sin aumentar stock.

## Reglas de inventario

- Ingreso directo: el producto recibido aumenta stock en su unidad base de inventario.
- Ingreso clasificado: el producto base recibido no aumenta stock.
- Cada producto resultado aumenta stock por su cantidad base clasificada.
- La suma de resultados mas merma debe coincidir con la cantidad base recibida.
- La confirmacion se bloquea si el ingreso no esta en borrador.
- La confirmacion se bloquea si ya existen movimientos asociados.

## Costo

QB-4 permite registrar costo unitario y costo total del ingreso como dato operativo separado.

Este costo:

- no modifica `products.purchase_price`;
- no modifica `products.sale_price`;
- no modifica precio base QB;
- no crea compras, CxP, pagos, caja ni finanzas;
- no se usa para recibos acumulativos.

## Seguridad

Permisos actuales:

- lectura: `administrador`, `inventario` o rol legacy `admin`;
- creacion, clasificacion, confirmacion y anulacion de borradores: `administrador` e `inventario`;
- no se cambiaron Auth ni roles reales.

La migracion local incluye RLS minima equivalente a patrones QB-2/QB-3:

- lectura solo para roles internos autorizados;
- insert/update para `admin`, `administrador` o `inventario`;
- los enlaces de movimientos se escriben exclusivamente desde la RPC de confirmacion;
- sin politicas de borrado operativo de ingresos confirmados.

## Cierre QB-4.1

La auditoria local de seguridad QB-4.1 endurece la migracion antes de aplicar la fase:

- RLS de lectura restringida a roles internos autorizados.
- Confirmacion con revalidacion de producto activo, configuracion QB activa, unidad o presentacion permitida para `recepcion`, cantidad, factor y snapshot de conversion.
- Clasificacion con revalidacion de salidas configuradas activas.
- Sin politica directa de insercion en `qb_merchandise_receipt_movements`; la RPC confirma y crea los vinculos de forma atomica.

## Fuera de alcance

QB-4 no implementa:

- compras legacy;
- `/compras` ni `/compras/multiple`;
- pagos;
- caja;
- CxP;
- CxC;
- finanzas;
- ventas;
- pedidos;
- catalogo;
- checkout;
- entregas;
- recibos acumulativos;
- fulfillment;
- reversion de ingresos confirmados.

## Siguiente fase recomendada

QB-5: Cuenta cliente, catalogo sin precios y pedidos QB.
