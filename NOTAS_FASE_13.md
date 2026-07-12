# NOTAS FASE 13 - Pedidos moviles y cantidades reales

## Objetivo

Se agrego un flujo intermedio entre pedido del cliente y venta real:

- El pedido guarda lo solicitado por el cliente.
- Ventas prepara el pedido desde una vista optimizada para celular.
- Cada item se marca como preparado, parcial, sin stock, cancelado o pendiente.
- Se registra la cantidad real pesada o entregada.
- Recien al confirmar el pedido se crea una venta real y se descuenta inventario.

## Implementado

- Ruta `/pedidos` protegida para `administrador` y `ventas`.
- Tablas `orders` y `order_items`.
- RPCs seguras:
  - `create_order`
  - `prepare_order_item`
  - `confirm_prepared_order`
  - `cancel_order`
- Confirmacion de pedido conectada a `confirm_sale`, reutilizando la logica existente de:
  - stock
  - cuentas por cobrar
  - caja
  - reportes
  - dashboard
  - auditoria
- UI mobile-first con tarjetas grandes, checklist por item y cantidades con 3 decimales.

## Reglas principales

- Un pedido no mueve stock ni finanzas.
- Un item preparado o parcial requiere cantidad real mayor a cero.
- Un item sin stock o cancelado queda con cantidad real cero.
- Un pedido con items pendientes no puede confirmarse.
- Un pedido confirmado no puede confirmarse otra vez.
- Si al confirmar falta stock, la venta se bloquea con error visible.
- Si el cliente es contado, no se ofrece pago a credito.

## SQL

Para una base nueva:

1. Ejecutar `SUPABASE_SCHEMA.sql`.

Para una base staging existente con Fase 12D aplicada:

1. Ejecutar `SUPABASE_MIGRATION_FASE_13_ORDERS.sql`.

No ejecutar `SUPABASE_SEED_DEMO.sql` en produccion.

## Alcance no incluido

- Catalogo publico para clientes finales.
- Login de clientes externos.
- Cotizacion formal por WhatsApp/PDF.
- Estados logisticos avanzados de despacho.

Estos puntos se recomiendan como Fase 13B/14 para no abrir una superficie publica sin controles.

## Prueba recomendada

1. Entrar como administrador o ventas.
2. Crear cliente y producto activo si no existen.
3. Ir a `/pedidos`.
4. Crear pedido con cantidades solicitadas aproximadas.
5. Preparar un item completo con peso real distinto al solicitado.
6. Preparar otro item parcial o sin stock.
7. Confirmar pedido como contado, QR o transferencia.
8. Verificar que aparece venta confirmada en `/ventas`.
9. Verificar que inventario baja por cantidad real, no por cantidad solicitada.
10. Verificar caja, dashboard y reportes con el monto real.
