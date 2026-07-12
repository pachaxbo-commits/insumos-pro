# NOTAS FASE 14D.1

## Objetivo

Corregir precision fisica e integridad de clasificacion antes de aplicar Fases 13 y 14 en staging.

## Precision

- Cantidades fisicas usan `numeric(14, 3)`.
- Costos unitarios de compra y clasificacion usan `numeric(14, 4)`.
- Subtotales, totales, precios y costos asignados conservan dos decimales.
- Se redefinen `register_inventory_movement`, `create_purchase_draft`, `create_sale_draft`,
  `confirm_sale`, `cancel_confirmed_sale` y `cancel_confirmed_purchase`.
- `0.958 kg` permanece `0.958` al vender, mover inventario y anular.

## Integridad de clasificacion

Cada linea de compra multiple tiene `line_revision`.

- El trigger `prepare_purchase_batch_line` obtiene producto, unidad, proveedor y
  `requires_classification` desde sus tablas reales.
- Un cambio en producto, cantidad, unidad, costo o exigencia de clasificacion elimina
  la clasificacion anterior e incrementa la revision en la misma transaccion.
- La RPC de confirmacion valida revision, producto base, cantidad, unidad, subtotal,
  resultados y costo asignado.
- Las columnas internas de snapshot, revision y clasificacion no tienen permiso de
  escritura directa para `authenticated`.

## Costos

- La distribucion manual debe coincidir exactamente con el subtotal a dos decimales.
- La distribucion automatica asigna cualquier diferencia de redondeo al ultimo
  resultado valido.
- `purchase_items.subtotal` conserva el costo asignado exacto aunque el costo unitario
  de cuatro decimales no lo reproduzca matematicamente al centavo.

## Formularios

Las filas completamente vacias se ignoran como espacios sin usar. Una fila parcialmente
completada o con datos invalidos rechaza toda la operacion, identifica su numero y no
invoca la RPC. Por eso la clasificacion anterior y su auditoria quedan intactas.

## No incluido

- Clasificacion con 100% de merma.
- Anulacion integral de batches.
- Pago parcial real por linea.
- Catalogo publico.

