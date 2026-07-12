# PLAN PRUEBAS STAGING FASE 13

## Preparacion

- Aplicar `SUPABASE_MIGRATION_FASE_13_ORDERS.sql` solo en staging existente.
- Confirmar que existen clientes y productos activos.
- Iniciar sesion con `administrador` y `ventas`.

## Pruebas criticas

1. Crear pedido con cliente contado y dos productos.
2. Confirmar que el pedido queda en estado `recibido`.
3. Preparar un producto con cantidad real menor a la solicitada.
4. Marcar otro producto como `sin_stock`.
5. Confirmar que el pedido queda `preparado_incompleto`.
6. Intentar confirmar con item pendiente y verificar bloqueo.
7. Confirmar pedido preparado y verificar venta en `/ventas`.
8. Verificar que stock baja usando `actual_quantity`.
9. Verificar que `estimated_total` y `final_total` difieren si el peso real cambia.
10. Crear pedido de cliente contado y confirmar que no aparece opcion `credito`.
11. Crear pedido de cliente credito, confirmar como `credito` y validar cuenta por cobrar.
12. Hacer doble clic en confirmar y verificar que no se duplica venta ni stock.
13. Entrar como `inventario` y confirmar que no abre `/pedidos`.
14. Revisar `/configuracion` > bitacora y confirmar eventos `create_order` y `confirm_order`.

## Criterio de aceptacion

- No hay stock descontado antes de confirmar.
- No hay impacto financiero antes de confirmar.
- La venta final usa cantidades reales.
- Los errores de negocio se muestran como mensajes claros.
- Reportes, dashboard, caja e inventario reflejan la venta confirmada.
