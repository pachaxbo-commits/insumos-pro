# PLAN PRUEBAS STAGING FASE 14C

## Preparacion

- Aplicar `SUPABASE_MIGRATION_FASE_14B_PURCHASE_BATCHES.sql`.
- Aplicar `SUPABASE_MIGRATION_FASE_14C_CONFIRM_PURCHASE_BATCHES.sql`.
- Tener productos activos, proveedores activos y usuario `administrador` o `inventario`.

## Casos obligatorios

1. Crear batch con un proveedor y metodo efectivo. Confirmar y verificar una compra hija pagada.
2. Crear batch con varios proveedores. Confirmar y verificar una compra hija por proveedor/metodo.
3. Crear batch con mismo proveedor y efectivo + QR. Confirmar y verificar dos compras hijas.
4. Crear batch con credito. Confirmar y verificar cuenta por pagar.
5. Doble clic en confirmar. Verificar una sola compra por grupo, una sola entrada de stock y una sola caja/CxP.
6. Simular falla: agregar linea con producto que requiere clasificacion. Confirmar debe bloquear sin crear compras ni stock.
7. Usuario ventas o finanzas intenta confirmar. Debe bloquear.
8. Verificar que inventario aumenta una sola vez por compra hija.
9. Verificar caja para efectivo/QR/transferencia.
10. Verificar auditoria: `confirm_purchase_batch` y `confirm_purchase` con origen `purchase_batch`.
11. Intentar editar batch confirmado. Debe bloquear UI y RLS/servidor.

## Criterio de aceptacion

- El batch no aparece duplicado.
- Las compras hijas aparecen en `/compras` como compras confirmadas normales.
- Finanzas, inventario, reportes y dashboard usan las compras hijas, no el batch.
- La clasificacion pendiente bloquea toda la confirmacion.
