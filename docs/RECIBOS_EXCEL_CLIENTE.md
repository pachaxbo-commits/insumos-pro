# Recibos por producto: contrato de integración

## Referencia funcional

`JULIO 2026.xlsx` contiene dos hojas de catálogo histórico, una hoja `GENERAL` y seis
hojas de cliente. Cada hoja de cliente repite bloques por pedido con las columnas
producto, unidad, cantidad, venta, costo, utilidad, costo unitario, utilidad
unitaria y observación. A la derecha resume pedido, fecha, utilidad, venta,
estado y porcentaje de utilidad. `GENERAL` consolida clientes. Las fórmulas con
`#REF!`, `#DIV/0!` y `#N/A` se excluyeron del contrato.

## Modelo vigente y nuevo

- `qb_receipt_orders` mantiene los pedidos incluidos y `qb_receipt_lines` conserva
  una fila por producto realmente entregado.
- Los recibos anteriores conservan `pricing_mode = legacy`, sus importes y sus
  factores históricos. Su calculadora original se conserva como
  `recalculate_qb_receipt_totals_legacy`.
- Los borradores nuevos usan `pricing_mode = line_cost_markup`. Cada línea guarda
  sus cuatro factores, costo unitario, costo total, venta total, utilidad
  unitaria y utilidad total. La emisión bloquea cambios posteriores.
- `purchase_cost_total` existente puede alimentar el costo inicial. Si falta,
  administración lo escribe en el borrador. La nueva RPC acepta además un
  `cost_total` preciso, de modo que Provisión/FIFO puede entregar un costo total
  efectivo sin implementar la selección de lotes en Recibos.
- `amount_bs` mantiene la venta fija del pedido. Sus factores quedan en cero y
  el costo real, si se conoce, determina la utilidad. No se modifica entrega ni
  stock.

## Cálculo

Para líneas de cantidad: factor total = distancia + exigencia + clima +
extraordinario. Precio unitario = costo unitario × (1 + factor total / 100).
Costo total = cantidad entregada × costo unitario. Venta total = cantidad
entregada × precio unitario. Utilidad total = venta total − costo total.

Los totales del recibo y los resúmenes suman importes precisos por línea.
El porcentaje de utilidad es `SUM(utilidad) / SUM(venta) × 100`. Los valores
internos se guardan con ocho decimales y la interfaz muestra dos. La columna
histórica `line_total` mantiene su precisión de dos decimales para la impresión
actual, mientras `sale_total_precise` conserva el valor utilizado en resúmenes.

## Estados y permisos

`pendiente`, `pagado` y `cobrado` son marcas administrativas manuales de un
recibo emitido. No crean caja, pagos ni cuentas por cobrar. Las nuevas RPCs
comprueban el rol administrador; RLS deja la lectura de recibos y sus costos al
administrador. La vista de cliente usa solo cantidad entregada, precio de venta
y total; los costos, factores y utilidades quedan en la vista administrativa.

## Pendiente de Provisión/FIFO

El módulo de Provisión debe calcular el costo total realmente consumido por la
línea entregada, incluso si cruza varios lotes. Debe pasar ese total a la RPC
de Recibos y registrar su referencia de origen antes de emitir. Recibos no
elige lotes ni vuelve a valorar recibos emitidos.

## Validación de base de datos

La migración nueva no se ha aplicado a Production. La instancia local de
Supabase no pudo completar el historial canónico: la migración histórica
`20260725010300_qb_legacy_repeatable_order_templates.sql` exige 38 plantillas
y 330 líneas, pero la inicialización local encontró cero. Esta condición debe
resolverse en un entorno local o staging autorizado antes de aplicar la nueva
migración o habilitar la edición real de los nuevos borradores. Como comprobación
aislada, la migración compiló dos veces en PostgreSQL 17 con un esquema sintético;
dos líneas devolvieron costo 230, venta 254,50 y utilidad 24,50. Al cambiar solo
Exigencia de la primera línea, el recibo pasó a venta 274,50 y utilidad 44,50;
la segunda línea conservó 34,50 de venta. Esa prueba no reemplaza una aplicación
completa de todas las migraciones canónicas.
