# NOTAS_FASE_7

## Alcance completado

- Modulo `/finanzas` reemplazado por una vista real conectada a Supabase.
- Tabs de Resumen, Cuentas por cobrar, Cuentas por pagar, Pagos, Caja y Gastos/Ingresos manuales.
- `accounts_receivable` mejorada con `paid_amount`, `due_date`, `notes` y estado `vencida`.
- Tabla `accounts_payable` para cuentas por pagar.
- Tabla `payments` para historial de cobros, pagos a proveedores, ingresos y gastos manuales.
- Tabla `cash_movements` para caja diaria.
- RPC `register_customer_payment` para registrar cobros parciales o totales.
- RPC `register_supplier_payment` para registrar pagos parciales o totales.
- RPC `register_manual_cash_movement` para ingresos y gastos manuales.
- `confirm_sale` actualizado para crear caja en ventas de contado y cuenta por cobrar en ventas a credito.
- `confirm_purchase` actualizado para crear caja en compras pagadas y cuentas por pagar en compras pendientes/parciales.

## Reglas financieras

- No se permiten pagos mayores al saldo pendiente.
- Un cobro reduce `accounts_receivable.balance` y `customers.current_balance`.
- Un pago a proveedor reduce `accounts_payable.balance`.
- Si el saldo llega a cero, la cuenta cambia a `pagada`.
- Si hay pago parcial, cambia a `parcial`.
- Si hay saldo y la fecha de vencimiento ya paso, cambia a `vencida`.
- Todo cobro o pago genera fila en `payments` y movimiento en `cash_movements`.

## Permisos

- `administrador`: acceso total a finanzas.
- `finanzas`: gestiona pagos, cuentas y caja.
- `ventas`: conserva acceso a ventas/clientes, sin gestionar `/finanzas`.
- `inventario`: conserva compras/inventario, sin gestionar `/finanzas`.

## SQL agregado

- `public.accounts_payable`
- `public.payments`
- `public.cash_movements`
- Mejoras sobre `public.accounts_receivable`
- Funcion `get_finance_status`
- Funcion `assert_finance_role`
- Funcion `register_customer_payment`
- Funcion `register_supplier_payment`
- Funcion `register_manual_cash_movement`
- Reemplazo de `confirm_sale`
- Reemplazo de `confirm_purchase`

## Limitaciones

- No hay conciliacion bancaria ni cierre formal de caja.
- Las compras con estado `parcial` aun no capturan un monto pagado inicial; se crea cuenta por pagar por el total.
- No hay edicion manual de fechas de vencimiento desde UI.
- No hay reportes financieros avanzados ni exportaciones.
- No se implementa reversion de pagos o anulacion financiera.

## Validacion

- `npm run lint`: correcto, sin errores ni advertencias.
- `npm run build`: correcto, compilacion de produccion exitosa.
