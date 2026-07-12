# PLAN_PRUEBAS_STAGING_FASE_12D

## Preparacion

1. Usar Supabase Staging, nunca produccion.
2. Confirmar backup de staging.
3. Aplicar `SUPABASE_MIGRATION_FASE_12D_SAFE_CANCELLATIONS.sql`.
4. Configurar `.env.local` contra staging.
5. Iniciar la app local con `npm run dev`.
6. Probar con usuarios `administrador`, `ventas`, `inventario` y `finanzas`.

## Casos obligatorios

1. Venta contado anulada:
   - Crear y confirmar venta contado.
   - Anular como administrador con motivo de 10+ caracteres y confirmacion `ANULAR`.
   - Verificar `sales.status = 'anulada'`, `reversal_status = 'reversed'`.
   - Verificar movimiento `devolucion` y egreso de caja compensatorio.

2. Venta credito sin pagos anulada:
   - Crear cliente credito, confirmar venta credito.
   - Sin registrar pagos, anular.
   - Verificar stock devuelto, CxC `anulada`, balance 0 y saldo del cliente reducido.

3. Venta con pago parcial bloqueada:
   - Confirmar venta credito.
   - Registrar pago parcial.
   - Intentar anular.
   - Debe bloquear con mensaje sobre pagos aplicados.

4. Doble clic en anulacion:
   - Enviar anulacion dos veces.
   - Solo debe existir una reversa de stock/caja.
   - Segundo intento debe fallar indicando que ya fue anulada.

5. Compra sin movimientos posteriores anulada:
   - Crear compra pendiente, confirmar.
   - No mover esos productos.
   - Anular como administrador.
   - Verificar salida compensatoria de stock y CxP `anulada`.

6. Compra con stock usado bloqueada:
   - Confirmar compra.
   - Registrar venta/salida/merma/ajuste posterior del producto.
   - Intentar anular.
   - Debe bloquear indicando movimientos posteriores.

7. Compra con pago aplicado bloqueada:
   - Confirmar compra pagada o registrar pago de CxP.
   - Intentar anular.
   - Debe bloquear indicando pagos aplicados.

8. Usuario no administrador bloqueado:
   - Ingresar como ventas/inventario/finanzas.
   - Confirmar que no aparece boton de anulacion confirmada.
   - Intentar llamar accion/RPC manualmente y verificar rechazo.

9. Reportes, caja, cuentas, stock y auditoria:
   - Dashboard y reportes no deben contar anuladas como vigentes.
   - CSV debe mostrar estado anulada/cancelada.
   - Caja debe reflejar movimiento compensatorio.
   - Auditoria debe registrar `cancel_confirmed_sale` o `cancel_confirmed_purchase`.

## Rollback si falla

- No tocar produccion.
- Guardar captura y error exacto.
- Restaurar backup de staging si se afectaron datos de prueba.
- Corregir con nueva migracion incremental; no editar manualmente datos contables para ocultar el fallo.
