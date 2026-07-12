# PLAN DE PRUEBAS STAGING FASE 14D.1

## Preparacion

1. Confirmar project ref y URL de staging.
2. Crear backup o export logico y registrar conteos de tablas operativas.
3. Aplicar, en orden, Fase 13, 14B, 14C, 14D y finalmente 14D.1.
4. No aplicar `SUPABASE_SCHEMA.sql` sobre staging existente.

## Casos obligatorios

1. Venta de `0.958 kg`:
   - confirmar la venta;
   - verificar `sale_items.quantity = 0.958`;
   - verificar movimiento y descuento exactos de `0.958`.
2. Pedido de `1 kg` preparado como `1.110 kg`:
   - confirmar el pedido;
   - verificar venta, movimiento y stock con `1.110`.
3. Anulacion de venta fraccionada:
   - anular como administrador;
   - verificar que el stock recupere exactamente la cantidad original.
4. Clasificacion con tres decimales:
   - guardar varios resultados y merma;
   - confirmar que sus cantidades no se redondean a dos decimales.
5. Distribucion automatica compleja:
   - usar tres resultados con valores de venta diferentes;
   - verificar que la suma asignada coincide exactamente con el subtotal.
6. Diferencia manual de Bs 0.01:
   - enviar costos cuya suma difiera un centavo;
   - verificar rechazo y ausencia de cambios o auditoria nueva.
7. Edicion de linea clasificada:
   - cambiar cantidad o costo;
   - verificar incremento de `line_revision` y eliminacion de la clasificacion anterior.
8. Flag desactualizado o manipulado:
   - marcar el producto real como clasificable;
   - verificar que no pueda confirmarse sin clasificacion vigente ni alterarse el flag
     directamente desde cliente.
9. Fila invalida junto a filas validas:
   - dejar producto sin cantidad o ingresar cantidad negativa;
   - verificar rechazo de toda la operacion y conservacion de la clasificacion previa.
10. Producto base fuera de inventario:
    - confirmar un batch clasificado;
    - verificar que no exista `purchase_item` ni movimiento de entrada para el producto base.

## Regresion

- Doble clic en guardar clasificacion no duplica resultados.
- Doble clic en confirmar no duplica compras, stock, caja, CxP ni auditoria.
- Batch mixto conserva lineas normales y clasificadas.
- Efectivo y QR generan pagos/caja; credito genera CxP.
- Reportes muestran cantidades con tres decimales y montos con dos.

