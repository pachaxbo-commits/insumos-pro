# PENDIENTES_CONTROLADOS

## Reversion de ventas confirmadas

No se implemento una anulacion contable completa de ventas confirmadas en Fase 10.

Regla operativa temporal:

- Compras y ventas confirmadas no se editan ni eliminan.
- Las correcciones se realizan mediante movimientos compensatorios autorizados y auditados.
- Toda correccion debe tener motivo claro, responsable y respaldo documental.

Recomendacion:

- Crear una accion especifica `anular_venta_confirmada`.
- Generar movimientos de inventario tipo `devolucion` por cada item.
- Si fue venta a credito, ajustar `accounts_receivable` y `customers.current_balance`.
- Si hubo pago de contado, crear movimiento de caja reverso.
- Registrar todo en `audit_logs`.

Riesgo: anular sin trazabilidad puede descuadrar stock, caja y cartera.

## Reversion de compras confirmadas

No se implemento anulacion completa de compras confirmadas.

Recomendacion:

- Crear accion `anular_compra_confirmada`.
- Generar movimientos de inventario tipo `salida` o `ajuste` por cada item.
- Validar stock suficiente antes de reversar.
- Si genero cuenta por pagar o pago, crear reversos financieros.
- Registrar auditoria.

Riesgo: si el stock ya fue vendido, una reversion directa puede producir saldos negativos o costo incorrecto.

## Ajustes de inventario

El ajuste actual permite definir stock final.

Recomendacion:

- Mantener ajustes solo para administradores/inventario.
- Exigir motivo claro.
- Revisar auditoria de ajustes periodicamente.

## Costeo historico

La utilidad estimada usa costo actual del producto.

Recomendacion:

- Incorporar costo historico por item vendido.
- Evaluar lotes o promedio ponderado.

## Busqueda global

El header muestra acceso visual, pero no busqueda global real.

Recomendacion:

- Implementar busqueda global con resultados por modulo y permisos.
