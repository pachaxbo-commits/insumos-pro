# NOTAS_FASE_12D

## Implementado localmente

- RPC `cancel_confirmed_sale(p_sale_id, p_reason)`.
- RPC `cancel_confirmed_purchase(p_purchase_id, p_reason)`.
- Campos de anulacion en `sales` y `purchases`:
  - `canceled_reason`
  - `canceled_by`
  - `canceled_at`
  - `reversal_status`
- UI de anulacion fuerte en `/ventas` y `/compras`, solo para administradores.
- Motivo obligatorio de al menos 10 caracteres.
- Confirmacion escrita `ANULAR`.
- Auditoria SQL con `cancel_confirmed_sale` y `cancel_confirmed_purchase`.

## Reglas de venta

Permite anular si:

- la venta existe;
- esta `confirmada`;
- no fue anulada antes;
- el usuario es `administrador`;
- el motivo cumple longitud minima;
- si es credito, la CxC no tiene pagos aplicados.

Bloquea si:

- ya esta anulada;
- no esta confirmada;
- no existe cuenta por cobrar para venta credito;
- hay pagos aplicados sobre la CxC o la venta.

## Reglas de compra

Permite anular si:

- la compra existe;
- esta `confirmada`;
- no fue anulada antes;
- el usuario es `administrador`;
- el motivo cumple longitud minima;
- no tiene pagos registrados;
- no hay movimientos posteriores sobre los productos comprados;
- el stock actual permite restar la cantidad comprada.

Bloquea si:

- ya esta cancelada/anulada;
- no esta confirmada;
- tiene estado de pago `pagada` o `parcial`;
- existen pagos asociados;
- existen movimientos posteriores de inventario;
- revertir dejaria stock negativo.

## Efectos

- No se elimina ningun documento ni item.
- Ventas anuladas quedan con `status = 'anulada'`.
- Compras anuladas quedan con `status = 'cancelada'`.
- Se crean movimientos compensatorios de inventario.
- Venta contado/transferencia/QR crea egreso de caja compensatorio.
- Venta credito sin pagos cierra CxC como `anulada` y reduce saldo del cliente.
- Compra pendiente sin pagos cierra CxP como `anulada`.

## SQL pendiente

Aplicar en staging:

```sql
-- SUPABASE_MIGRATION_FASE_12D_SAFE_CANCELLATIONS.sql
```
