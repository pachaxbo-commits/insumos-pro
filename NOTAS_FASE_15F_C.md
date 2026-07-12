# Fase 15F-C - Despacho, recojo y pagos iniciales

## Implementado

- RPC `fulfill_confirmed_order` para cierre atomico.
- Recojo finaliza `entregado`; delivery finaliza `despachado`.
- Venta definitiva con cantidades reales y precios congelados.
- Pagos iniciales separados por efectivo, QR o transferencia.
- Caja creada exclusivamente por cada pago real.
- CxC y saldo del cliente únicamente por la diferencia pendiente.
- Autorización administrativa para saldo de clientes de contado.
- Server Action con doble validación de rol.
- UI responsive sin tablas horizontales.
- Resumen de venta, pagos y saldo en el pedido cerrado.

## Idempotencia

El pedido usa una sola clave de fulfillment y un fingerprint de todos los datos.
Cada pago recibe una clave determinista. Un reintento idéntico devuelve el cierre
existente; un reintento con datos distintos queda bloqueado.

## Fuera de alcance

- Recibo o comprobante digital.
- Pago posterior desde CxC.
- Marcar delivery como entregado.
- Retorno pendiente y devolución física.
- Reversas de pago.
- Anulación final de ventas originadas en pedidos.
