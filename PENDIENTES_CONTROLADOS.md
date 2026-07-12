# PENDIENTES_CONTROLADOS

## Reversion de ventas confirmadas

Fase 12D implementa anulacion segura de ventas confirmadas para casos compatibles.

Regla operativa temporal:

- Compras y ventas confirmadas no se editan ni eliminan.
- Las correcciones se realizan mediante movimientos compensatorios autorizados y auditados.
- Toda correccion debe tener motivo claro, responsable y respaldo documental.
- Si existen pagos aplicados en ventas a credito, la anulacion automatica se bloquea y requiere regularizacion previa.

Recomendacion:

- Revisar el diseno tecnico en `DISENO_FASE_12D_ANULACIONES.md`.
- Probar `SUPABASE_MIGRATION_FASE_12D_SAFE_CANCELLATIONS.sql` en staging antes de produccion.
- Definir procedimiento operativo para ventas a credito con pagos ya aplicados.

Riesgo: anular sin trazabilidad puede descuadrar stock, caja y cartera.

## Reversion de compras confirmadas

Fase 12D implementa anulacion segura de compras confirmadas solo cuando no hay pagos ni movimientos posteriores.

Recomendacion:

- Revisar el diseno tecnico en `DISENO_FASE_12D_ANULACIONES.md`.
- Probar `SUPABASE_MIGRATION_FASE_12D_SAFE_CANCELLATIONS.sql` en staging antes de produccion.
- Mantener procedimiento de devolucion o ajuste controlado cuando ya hubo salidas, ventas, mermas, ajustes o pagos.

Las ventas con `origin = order` quedan bloqueadas para anulacion Fase 12D desde
Fase 15F-B. El bloqueo se retirara solo cuando Fase 15F-F implemente devolucion
fisica, reversa individual de pagos y movimientos compensatorios auditados.

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
