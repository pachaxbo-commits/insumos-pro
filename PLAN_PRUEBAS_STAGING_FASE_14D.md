# PLAN PRUEBAS STAGING FASE 14D

## Preparacion

- Aplicar `SUPABASE_MIGRATION_FASE_14B_PURCHASE_BATCHES.sql`.
- Aplicar `SUPABASE_MIGRATION_FASE_14C_CONFIRM_PURCHASE_BATCHES.sql`.
- Aplicar `SUPABASE_MIGRATION_FASE_14D_PURCHASE_CLASSIFICATION.sql`.
- Tener un producto base activo con `requires_classification = true`.
- Tener dos o mas productos resultantes activos y vendibles.
- Tener proveedores activos.
- Probar con usuario `administrador`, `inventario`, `ventas` y `finanzas`.

## Casos obligatorios

1. Crear batch con una linea normal y confirmar. Debe conservar el flujo 14C sin cambios.
2. Crear batch con producto base que requiere clasificacion. Intentar confirmar sin clasificar. Debe bloquear.
3. Clasificar una linea en dos productos resultantes con tres decimales de cantidad. Guardar y reabrir el batch.
4. Confirmar batch clasificado. Verificar que el producto base no aumenta stock.
5. Verificar que los productos resultantes aumentan stock con las cantidades reales clasificadas.
6. Verificar que las compras hijas se crean agrupadas por proveedor y metodo de pago.
7. Verificar que caja se actualiza para efectivo, QR o transferencia.
8. Verificar que CxP se crea para credito.
9. Revisar `/compras`, `/inventario`, `/finanzas`, `/reportes` y dashboard: deben reflejar compras hijas, no duplicar montos del batch.
10. Clasificar con costos manuales que no suman el subtotal original. Debe bloquear.
11. Clasificar con producto resultante igual al producto base. Debe bloquear.
12. Clasificar con producto resultante repetido. Debe bloquear.
13. Usar misma unidad base/resultados y cantidad + merma distinta a la original. Debe bloquear.
14. Usar unidad diferente y registrar peso real. Debe permitir sin inventar conversion.
15. Editar la linea despues de clasificar. La clasificacion anterior debe invalidarse.
16. Doble clic en confirmar batch clasificado. Debe crear una sola compra por grupo y una sola entrada de inventario.
17. Usuario `ventas` o `finanzas` intenta clasificar o confirmar por URL/accion directa. Debe bloquear.
18. Revisar bitacora: debe aparecer `save_purchase_batch_line_classification`, `confirm_purchase_batch` y `confirm_purchase`.

## Criterio de aceptacion

- No ingresa stock al producto base no vendible.
- Los productos resultantes reciben stock y costo unitario asignado.
- La suma de costos asignados coincide con el subtotal original.
- No hay duplicacion de compras, movimientos, caja, CxP ni auditoria.
- El batch confirmado queda bloqueado para edicion.
