# Fase 15F-B - Fundacion de cierre comercial

## Implementado

- `order_fulfillments` para delivery y recojo.
- Venta originada en pedido identificada por `origin` y `order_id` unico.
- Resumen de pago para ventas de pedido: pagado, saldo y estado.
- Idempotencia de fulfillment y pagos.
- Referencia obligatoria para QR/transferencia de fulfillment.
- Relacion unica pago-caja y venta-item-movimiento de inventario.
- Helpers SQL internos para crear fulfillment/venta, registrar salida, cobros y CxC.
- Bloqueo temporal de anulacion 12D para ventas originadas en pedidos.

## Compatibilidad

`confirm_sale` no fue reemplazada ni cambio de firma. Las ventas historicas y
manuales conservan `origin = manual`; sus nuevos campos de resumen quedan nulos
y las RPC actuales de ventas, credito y pagos continúan siendo la fuente vigente.

## Seguridad

Las funciones `internal_*` no tienen `EXECUTE` para `anon` ni `authenticated`.
Fase 15F-C creara una RPC publica minima, con validacion de rol y transaccion, que
orquestara esos helpers.

## Fuera de alcance

- UI de despacho/recojo.
- RPC publica de fulfillment.
- UI y Server Actions de pagos mixtos.
- Confirmacion final de delivery.
- Retornos, devoluciones y reversas.
- Recibo digital.
- Cambios de reportes/CSV para nuevos estados.
