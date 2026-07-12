# Plan de pruebas Staging - Fase 15F-B

Aplicar `SUPABASE_MIGRATION_FASE_15F_B_FULFILLMENT_FOUNDATION.sql` solo
despues de Fase 15E y con backup confirmado. Esta fase no habilita UI operativa.

## Verificacion estructural

```sql
select to_regclass('public.order_fulfillments');

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'sales',
    'payments',
    'cash_movements',
    'accounts_receivable',
    'inventory_movements'
  )
order by table_name, ordinal_position;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name like 'internal_%fulfillment%'
   or routine_schema = 'public'
  and routine_name like 'internal_%order_sale%';
```

Confirmar que un usuario `authenticated` no puede ejecutar funciones
`internal_*` directamente. Las pruebas de helpers deben hacerse posteriormente
mediante las RPC publicas de Fase 15F-C, no concediendo permisos temporales.

## Regresion obligatoria

1. Crear y confirmar una venta manual de contado. Debe conservar pago y caja.
2. Crear y confirmar una venta manual a credito. Debe conservar CxC y limite.
3. Registrar pago parcial con el flujo financiero existente y verificar saldo.
4. Intentar insertar dos ventas con el mismo `order_id`; la segunda debe fallar.
5. Intentar asociar dos movimientos de caja al mismo `payment_id`; debe fallar.
6. Verificar que un futuro pago de fulfillment QR/transferencia sin referencia
   sea rechazado por constraint/helper.
7. Verificar que el helper rechaza pagos acumulados mayores al total.
8. Marcar una venta `origin = order` como anulada mediante Fase 12D; toda la
   transaccion debe revertirse con mensaje de bloqueo.
9. Intentar crear dos fulfillments para un pedido; debe fallar por unicidad.
10. Comprobar que delivery pasa a `despachado`, no a `entregado`; recojo pasa
    directamente a `entregado` cuando se habilite la RPC 15F-C.
11. Abrir dashboard, ventas, finanzas y reportes; las consultas existentes deben
    continuar funcionando con ventas manuales historicas.

## Integridad adicional para Fase 15F-C

- Doble llamada con la misma idempotencia devuelve el mismo fulfillment/venta.
- Una clave reutilizada con datos diferentes falla.
- Una salida de inventario por `fulfillment_sale_item_id`.
- Una fila de `payments` por cobro real y una fila de caja por `payment_id`.
- Cliente contado no conserva saldo sin administrador, motivo y vencimiento.
- Cliente credito no supera su limite por el saldo pendiente.

No ejecutar pruebas destructivas ni conceder `EXECUTE` directo a usuarios.
