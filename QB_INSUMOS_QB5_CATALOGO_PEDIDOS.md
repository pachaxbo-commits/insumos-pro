# QB Insumos - QB-5 Cuenta cliente, catalogo sin precios y pedidos

## Estado de la fase

QB-5 activa el flujo cliente de QB Insumos para pedir productos sin precios.

Rutas activas:

- `/catalogo`
- `/catalogo/checkout`
- `/mi-cuenta`
- `/mi-cuenta/recuperar`
- `/mi-cuenta/restablecer`
- `/pedidos` como vista interna de solo lectura

Migracion local preparada:

- `SUPABASE_MIGRATION_FASE_19_QB5_CUSTOMER_CATALOG_ORDERS.sql`

No fue aplicada a PostgreSQL real desde esta sesion. `SUPABASE_SCHEMA.sql` no es fuente canonica.

## Cuenta cliente

QB-5 reutiliza `customer_accounts` como identidad externa separada de `profiles`.

Se agrega una capa QB para ubicaciones:

- `qb_customer_locations`

El cliente gestiona:

- nombre;
- telefono;
- ubicaciones activas;
- ubicacion principal opcional;
- referencia y telefono por ubicacion.

## Catalogo sin precios

El catalogo QB se obtiene por RPC curada:

- `get_qb_public_catalog()`

La RPC no devuelve precios ni totales.

Un producto aparece solo si:

- `products.is_active = true`;
- `products.is_sellable = true`;
- `qb_product_unit_settings.is_qb_active = true`;
- `qb_product_unit_settings.is_visible_in_qb_catalog = true`;
- tiene al menos una unidad activa en `qb_product_allowed_units` con `usage_context = 'pedido'`.

## Pedido QB

Pedidos nuevos:

- `qb_orders`
- `qb_order_items`

Estado inicial:

- `pendiente_preparacion`

Estado adicional QB-5:

- `cancelado`

El pedido guarda cliente, ubicacion, snapshots de cliente/ubicacion, items solicitados, unidad solicitada, cantidad y snapshot de conversion.

No guarda:

- precio;
- subtotal;
- total;
- metodo de pago;
- venta;
- pago;
- caja;
- recibo;
- CxC;
- CxP.

## Envio e idempotencia

El envio usa la RPC:

- `create_qb_catalog_order(uuid, text, jsonb, text)`

La RPC valida:

- cliente autenticado y activo;
- ubicacion activa propia;
- carrito no vacio;
- maximo 30 items;
- cantidad mayor a cero y maximo 3 decimales;
- producto activo, vendible y visible en catalogo QB;
- unidad o presentacion activa permitida para `pedido`;
- idempotencia por cliente.

## Repetir ultimo pedido

El portal toma el ultimo pedido QB no cancelado del cliente y copia solo:

- producto;
- unidad solicitada;
- cantidad solicitada;
- observacion.

No copia precios, estados, preparacion, entrega, recibos ni inventario.

Si un producto o unidad ya no existe en el catalogo actual, se omite al repetir.

## Productos frecuentes

Se calculan desde pedidos QB del mismo cliente:

- frecuencia por producto;
- fecha reciente como desempate.

No usa ventas legacy ni recibos.

## Vista interna de pedidos

`/pedidos` muestra:

- pedidos QB recibidos;
- cliente;
- telefono;
- ubicacion;
- productos;
- cantidades y unidades solicitadas;
- notas.

No permite preparar, entregar, descontar stock, cobrar, vender, emitir recibo ni ejecutar fulfillment.

## RLS y seguridad

Tablas nuevas con RLS:

- `qb_customer_locations`
- `qb_orders`
- `qb_order_items`

Reglas:

- cliente ve y edita solo sus ubicaciones;
- cliente ve solo sus pedidos;
- roles internos `admin`, `administrador` e `inventario` pueden leer pedidos para operacion futura;
- no hay politicas directas de insert/update/delete para `qb_orders` ni `qb_order_items`;
- la creacion ocurre exclusivamente por RPC.

## Cierre QB-5.1

La auditoria local QB-5.1 agrega una defensa extra en la capa de datos del portal cliente:

- `/mi-cuenta` filtra ubicaciones y pedidos por `customer_account_id` de la cuenta autenticada.
- La vista interna `/pedidos` mantiene lectura operativa amplia para roles internos autorizados.
- Esto evita que una identidad que accidentalmente tenga `customer_account` y rol interno vea pedidos o ubicaciones de otros clientes desde el portal cliente.

## Fuera de alcance

QB-5 no implementa:

- preparacion;
- entrega;
- descuento de stock;
- ventas;
- pagos;
- caja;
- CxC;
- CxP;
- recibos;
- fulfillment;
- confirmacion publica por token;
- cotizacion con precio.

## Limitaciones

- La cancelacion de cliente queda pendiente para QB-6.
- La vista interna es solo lectura.
- Las validaciones reales de SQL deben probarse al aplicar la migracion en base local o aislada.

## Siguiente fase recomendada

QB-6: Preparacion, entrega fisica y descuento de stock al entregar.
