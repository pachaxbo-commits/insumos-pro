# Plan de pruebas Staging - Fase 15F-C

Aplicar primero Fase 15F-B y despues
`SUPABASE_MIGRATION_FASE_15F_C_FULFILL_CONFIRMED_ORDER.sql`.
Usar exclusivamente staging con backup confirmado.

## Preparacion

1. Tener productos con stock suficiente y precios configurados.
2. Tener un cliente `credito` con limite disponible.
3. Tener un cliente `contado`.
4. Crear pedidos publicos de prueba, prepararlos con cantidad real, emitir el
   resumen y confirmarlos como cliente.
5. Probar con usuarios `administrador`, `ventas` e `inventario`.

## Casos obligatorios

1. Recojo pagado completamente en efectivo:
   - pedido y fulfillment `entregado`;
   - una venta `origin = order`;
   - stock descontado una vez;
   - un pago y una caja por el mismo monto;
   - saldo cero y estado `pagado`.
2. Recojo pagado por QR con referencia válida.
3. Recojo con efectivo + QR:
   - dos pagos;
   - dos movimientos de caja;
   - nunca un método único `mixto`.
4. Recojo sin pagos para cliente crédito:
   - CxC por el total;
   - vencimiento predeterminado 15 días;
   - `current_balance` aumenta solo por el saldo.
5. Cliente contado con saldo usando usuario ventas: debe bloquear.
6. Cliente contado con saldo usando administrador, motivo de 10 caracteres y
   vencimiento: debe completar y auditar autorización.
7. Delivery confirmado:
   - pedido/fulfillment `despachado`;
   - nunca `entregado`;
   - stock descontado;
   - sin recibo digital.
8. Doble clic o dos llamadas concurrentes con la misma clave:
   - mismo fulfillment y venta;
   - sin duplicar stock, pagos, caja, CxC o auditoría.
9. Reducir stock antes del cierre: toda la operación debe fallar y no dejar
   fulfillment, venta, pagos, caja, CxC ni movimientos parciales.
10. QR o transferencia sin referencia: debe bloquear antes de mover stock.
11. Pagos acumulados mayores al total: debe bloquear todo.
12. Verificar que `sales.order_id` aparece una sola vez.
13. Comparar suma de pagos activos con movimientos de caja por `payment_id`.
14. Comparar CxC y `customers.current_balance` con el saldo exacto.
15. Usuario inventario intentando llamar la RPC directamente: debe bloquearse.
16. Crear y confirmar una venta manual de contado y otra a crédito: ambas deben
    conservar el comportamiento anterior.

## Consultas de apoyo

```sql
select id, order_id, origin, status, total, paid_amount, balance_due, payment_status
from public.sales
where origin = 'order'
order by created_at desc;

select *
from public.order_fulfillments
order by created_at desc;

select id, sale_id, fulfillment_id, amount, payment_method, external_reference,
       idempotency_key, status
from public.payments
where fulfillment_id is not null;

select id, payment_id, amount, payment_method, source_type
from public.cash_movements
where payment_id is not null;

select id, sale_id, fulfillment_id, amount, paid_amount, balance, status
from public.accounts_receivable
where fulfillment_id is not null;
```

No probar anulaciones, devoluciones ni entrega final de delivery en esta fase.
