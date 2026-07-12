# DISENO_FASE_12D_ANULACIONES

## Objetivo

Implementar anulacion contable segura de compras y ventas confirmadas sin borrar registros historicos.

## Principios

- Nunca borrar ventas o compras confirmadas.
- Solo `administrador` puede anular.
- Toda anulacion requiere motivo.
- La operacion debe ser atomica en una RPC/transaccion.
- Debe impedir doble anulacion.
- Debe dejar auditoria completa.
- Si la reversa automatica puede causar inconsistencia, debe bloquearse con un mensaje claro.

## Campos sugeridos

Agregar a `sales` y `purchases`:

- `canceled_reason text`
- `canceled_by uuid references profiles(id)`
- `canceled_at timestamptz`
- `reversal_status text default 'none'`

Agregar constraints:

- `reversal_status in ('none', 'reversed', 'blocked')`
- venta/compra anulada debe tener motivo y usuario.

## RPC venta

Funcion propuesta: `public.cancel_confirmed_sale(p_sale_id uuid, p_reason text)`.

Flujo atomico:

1. Validar `current_user_role() = 'administrador'`.
2. Bloquear fila de `sales` con `for update`.
3. Exigir `status = 'confirmada'`.
4. Exigir que no este anulada ni con `reversal_status = 'reversed'`.
5. Cargar `sale_items` y bloquear productos relacionados.
6. Revertir stock creando movimientos tipo `devolucion` por cada item.
7. Si venta fue credito:
   - cargar `accounts_receivable`;
   - si no tuvo pagos, reducir `customers.current_balance` y marcar cuenta anulada/cerrada;
   - si tuvo pagos, bloquear anulacion automatica y pedir revertir/regularizar pagos primero.
8. Si venta fue contado/transferencia/QR:
   - crear egreso de caja compensatorio o bloquear si caja ya fue cerrada segun regla operativa.
9. Marcar venta como `anulada`, guardar motivo, usuario y fecha.
10. Insertar `audit_logs` con metadata segura.

Bloqueos:

- No anular si hay pagos aplicados sin procedimiento de reversa.
- No anular si ya fue anulada.
- No anular sin motivo.

## RPC compra

Funcion propuesta: `public.cancel_confirmed_purchase(p_purchase_id uuid, p_reason text)`.

Flujo atomico:

1. Validar `current_user_role() = 'administrador'`.
2. Bloquear fila de `purchases` con `for update`.
3. Exigir `status = 'confirmada'`.
4. Exigir que no este anulada ni con `reversal_status = 'reversed'`.
5. Cargar `purchase_items` y bloquear productos.
6. Validar stock suficiente para restar cada item comprado.
7. Crear movimientos tipo `salida` o `ajuste` compensatorio por cada item.
8. Si compra genero `accounts_payable`:
   - si no tuvo pagos, cerrar/anular cuenta;
   - si tuvo pagos, bloquear anulacion automatica y pedir reversar pago primero.
9. Si compra fue pagada al contado:
   - crear ingreso de caja compensatorio o bloquear si caja cerrada.
10. Marcar compra como `cancelada/anulada`, guardar motivo, usuario y fecha.
11. Insertar `audit_logs` con metadata segura.

Bloqueos:

- No anular si el stock ya fue vendido y la reversa dejaria stock negativo.
- No anular si hay pagos aplicados sin reversa financiera definida.
- No anular si ya fue anulada.

## UI

- Boton "Anular confirmada" visible solo para administradores.
- Dialog con motivo obligatorio y resumen de impacto:
  - productos y stock a revertir;
  - cuenta por cobrar/pagar afectada;
  - caja afectada;
  - pagos asociados.
- Si la RPC bloquea, mostrar mensaje accionable.

## Auditoria

Acciones nuevas:

- `cancel_confirmed_sale`
- `cancel_confirmed_purchase`

Metadata segura:

- motivo;
- total;
- items afectados;
- saldos previos y posteriores;
- movimientos compensatorios creados;
- nunca secretos ni datos sensibles innecesarios.
