# QB-6 - Preparacion, entrega fisica y descuento de stock

## Alcance

QB-6 activa el flujo interno de `/pedidos` para preparar pedidos QB y confirmar entrega fisica. La preparacion no mueve inventario. El stock baja una sola vez al confirmar entrega, usando cantidades reales preparadas.

## Migracion local

- `SUPABASE_MIGRATION_FASE_20_QB6_ORDER_PREPARATION_DELIVERY.sql`

La migracion:

- extiende estados de `qb_orders`;
- agrega `products.is_qb_loss_product`;
- crea `qb_order_preparations`;
- crea `qb_order_preparation_items`;
- crea `qb_order_delivery_movements`;
- redefine `get_qb_public_catalog()` para excluir productos de merma;
- agrega `prevent_qb_loss_order_item` para bloquear productos de merma en items de pedido QB;
- agrega RPCs `start_qb_order_preparation`, `save_qb_order_preparation`, `confirm_qb_order_delivery` y `cancel_qb_order_before_delivery`;
- mantiene RLS de lectura interna y mutacion por RPC.

## Estados QB-6

Pedido:

- `pendiente_preparacion`
- `en_preparacion`
- `preparado`
- `entregado_pendiente_recibo`
- `cancelado`

Linea preparada:

- `completo`
- `parcial`
- `no_disponible`

## Seguridad operativa

- `start_qb_order_preparation` bloquea el pedido con `FOR UPDATE`.
- `save_qb_order_preparation` guarda cantidades reales y snapshots sin mover stock.
- `confirm_qb_order_delivery` exige pedido `preparado`, bloquea el pedido, valida que no existan movimientos previos y descuenta stock dentro de la misma transaccion.
- `qb_order_delivery_movements` tiene unicidad por item preparado y por movimiento de inventario.
- `cancel_qb_order_before_delivery` solo opera antes de entrega y rechaza pedidos con movimientos de entrega.
- `prevent_qb_loss_order_item` evita que una llamada directa a creacion de pedidos inserte productos marcados como merma QB.

## Separacion de legado

QB-6 no crea ni modifica:

- ventas;
- pagos;
- caja;
- CxC;
- CxP;
- compras legacy;
- recibos;
- fulfillment legacy.

## UI

- `/pedidos` deja de ser solo lectura y permite preparar/entregar pedidos QB.
- `/mi-cuenta` muestra estados de pedido al cliente sin precios.
- El catalogo sigue sin precios y excluye productos marcados como merma QB.

## Continuacion en QB-7

Los pedidos entregados quedan en `entregado_pendiente_recibo`. QB-7 consume ese estado para crear recibos acumulativos no fiscales, sin mover stock ni registrar cobros.
