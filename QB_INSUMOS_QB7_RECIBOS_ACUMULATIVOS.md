# QB-7 - Recibos acumulativos no fiscales

## Alcance

QB-7 implementa recibos acumulativos para pedidos QB ya entregados. El recibo es digital, interno y no fiscal. No registra cobro, metodo de pago, caja, CxC, CxP, venta ni movimiento de inventario.

## Migracion local

- `SUPABASE_MIGRATION_FASE_21_QB7_ACCUMULATED_RECEIPTS.sql`

La migracion:

- amplia estados de `qb_orders` con `incluido_en_recibo_borrador` y `recibo_emitido`;
- crea `qb_receipts`;
- crea `qb_receipt_orders`;
- crea `qb_receipt_lines`;
- crea `qb_receipt_events`;
- agrega calculo compuesto con `qb_compound_unit_price`;
- agrega RPCs `create_qb_receipt_draft`, `update_qb_receipt_draft`, `emit_qb_receipt` y `void_qb_receipt`;
- impide doble inclusion activa de pedidos mediante indice unico parcial.

## Flujo

1. El pedido se entrega en QB-6 y queda `entregado_pendiente_recibo`.
2. Administracion abre `/recibos`.
3. Selecciona cliente y uno o varios pedidos entregados pendientes.
4. Crea recibo `borrador`.
5. El borrador toma cantidades reales entregadas desde QB-6 y precio base vigente desde `qb_product_unit_settings.base_sale_price`.
6. Administracion edita factores y precio base usado por linea.
7. Si corresponde, marca una linea para guardar ese precio como nuevo precio base futuro del producto.
8. Administracion emite el recibo.
9. Los pedidos pasan a `recibo_emitido`.
10. Si se anula, los pedidos vuelven a `entregado_pendiente_recibo`.

## Estados

Recibo:

- `borrador`
- `emitido`
- `anulado`

Pedido relacionado:

- `entregado_pendiente_recibo`
- `incluido_en_recibo_borrador`
- `recibo_emitido`

## Factores compuestos

Los factores se guardan como puntos porcentuales. Ejemplo: `5.000` representa 5%.

Formula:

```text
precio_final_unitario =
precio_base_usado
* (1 + distancia / 100)
* (1 + exigencia / 100)
* (1 + clima / 100)
* (1 + extraordinario / 100)
```

Ejemplo:

```text
100 * 1.05 * 1.07 * 1.05 * 1.07
```

## Precio base editable

Cada linea guarda:

- precio base original;
- precio base usado en el recibo;
- indicador de precio editado;
- indicador de guardar como nuevo precio base.

Si se usa solo en el recibo, no cambia el producto. Si se marca guardar como nuevo precio base, se actualiza `qb_product_unit_settings.base_sale_price` para futuros recibos. No modifica recibos emitidos anteriores, pedidos, stock ni precios legacy.

## Emision

`emit_qb_receipt`:

- exige rol `admin` o `administrador`;
- exige recibo `borrador`;
- bloquea el recibo;
- valida pedidos y lineas;
- recalcula totales en backend;
- cambia el recibo a `emitido`;
- cambia pedidos a `recibo_emitido`;
- registra evento.

## Anulacion

`void_qb_receipt`:

- exige rol `admin` o `administrador`;
- permite anular `borrador` o `emitido`;
- exige motivo para recibos emitidos;
- cambia el recibo a `anulado`;
- libera pedidos a `entregado_pendiente_recibo`;
- registra evento;
- no devuelve stock ni crea movimientos.

## UI

Rutas privadas:

- `/recibos`
- `/recibos/[id]`

La vista digital muestra logo, numero, cliente, pedidos, periodo, cantidades reales, precios, factores, totales y la leyenda:

```text
No constituye factura fiscal ni comprobante de pago.
```

## Que NO implementa QB-7

- No cobro.
- No metodo de pago.
- No QR, efectivo, transferencia ni pago mixto.
- No factura fiscal.
- No ventas.
- No caja.
- No CxC.
- No CxP.
- No compras legacy.
- No fulfillment legacy.
- No devolucion de stock por anulacion.
- No vista publica por token.
- No recibos visibles al cliente en `/mi-cuenta`.

## Limitaciones

- Quitar o agregar pedidos dentro de un borrador queda pendiente; en esta fase se anula el borrador y se crea uno nuevo.
- La ejecucion real de SQL debe validarse en PostgreSQL local o base aislada antes de uso operativo.
- La numeracion usa prefijo `QBR-YYYYMMDD-XXXXXX`; un correlativo legal/fiscal no aplica porque no es factura fiscal.

## Siguiente fase recomendada

QB-8: Reportes simples y auditoria operativa.
