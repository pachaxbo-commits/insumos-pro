# QB-8 - Reportes simples y auditoria operativa

## Alcance

QB-8 reactiva `/reportes` como modulo interno de supervision operativa para QB Insumos. Reemplaza el reporte legacy financiero por vistas de solo lectura sobre inventario, ingresos QB, pedidos QB, entregas, recibos acumulativos y eventos operativos.

No crea migracion SQL nueva. La fase usa consultas desde Server Components sobre tablas existentes de QB-2 a QB-7.

## Ruta activa

- `/reportes`: Reportes QB.

## Reportes implementados

- Resumen operativo.
- Inventario actual QB.
- Ingresos de mercaderia QB-4.
- Pedidos y preparacion QB-5/QB-6.
- Entregas pendientes de recibo.
- Recibos acumulativos QB-7.
- Clientes y productos frecuentes.
- Auditoria operativa basica.
- Exportacion CSV de inventario, pedidos, pendientes de recibo y recibos.

## Fuentes de datos

- Productos y stock actual: `products`, `product_categories`, `qb_product_unit_settings`, `qb_units`, `qb_product_classification_outputs`, `inventory_movements`.
- Ingresos: `qb_merchandise_receipts`, `qb_merchandise_receipt_lines`, `qb_merchandise_receipt_classification_results`.
- Pedidos: `qb_orders`, `qb_order_items`, `qb_customer_locations`, `customer_accounts`.
- Preparacion y entrega: `qb_order_preparations`, `qb_order_preparation_items`, `qb_order_delivery_movements`.
- Recibos: `qb_receipts`, `qb_receipt_orders`, `qb_receipt_lines`, `qb_receipt_events`.
- Auditoria operativa: timestamps de ingresos, pedidos, preparaciones, entregas y eventos de recibos.

## Totales

El unico total monetario mostrado es `Total en recibos emitidos` o `Total de recibo`, proveniente de `qb_receipts.total_amount`.

Ese total:

- no es cobro;
- no es pago;
- no es caja;
- no es cuenta por cobrar;
- no es factura fiscal;
- no crea movimiento financiero.

## Que NO implementa

- No reportes de ventas legacy.
- No reportes de pagos.
- No caja.
- No CxC.
- No CxP.
- No compras legacy.
- No fulfillment legacy.
- No cobros.
- No factura fiscal.
- No metodos de pago.
- No precios en catalogo ni en vistas de cliente.
- No acciones operativas desde reportes, salvo navegacion de solo lectura a recibos.

## Inicio operativo QB

El inicio privado `/` muestra:

- pedidos pendientes de preparacion;
- pedidos en preparacion;
- pedidos preparados;
- pedidos entregados pendientes de recibo;
- recibos en borrador;
- total en recibos emitidos;
- productos con stock bajo o sin stock;
- ingresos recientes de mercaderia;
- ultimos pedidos recibidos.

No muestra ventas, cobros, pagos, caja, CxC, CxP, utilidad ni margen.

## Auditoria operativa

La vista de auditoria se construye con datos existentes:

- ingreso de mercaderia creado;
- ingreso confirmado;
- pedido recibido;
- preparacion guardada;
- pedido entregado;
- recibo creado;
- recibo emitido;
- recibo anulado;
- precio base actualizado desde recibo.

No se genera auditoria retroactiva falsa ni se crea tabla global nueva.

## Permisos

- `administrador`: ve todos los reportes QB y CSV disponibles.
- `inventario`: ve reportes operativos de inventario, ingresos, pedidos, pendientes de recibo, frecuentes y auditoria; no recibe CSV de recibos.
- Roles legacy `ventas` y `finanzas`: no acceden a `/reportes`.
- Clientes externos: no acceden a `/reportes`.

No se modificaron Auth, roles reales ni RLS. La seguridad de base sigue dependiendo de las politicas creadas en QB-2 a QB-7.

## Limitaciones

- No se validaron consultas contra PostgreSQL local real en esta fase.
- Si una base no tiene aplicadas migraciones QB-2 a QB-7, `/reportes` muestra error seguro.
- La auditoria es operativa basica y derivada de tablas existentes.
- No hay graficos complejos ni agregados SQL materializados.

## Siguiente fase recomendada

QB-9: Limpieza final, migraciones canonicas, pruebas locales con PostgreSQL y preparacion de Staging.
