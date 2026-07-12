# PLAN PRUEBAS STAGING FASE 15D

## Preparacion

1. Confirmar proyecto y backup de staging.
2. Confirmar Fases 15B y 15C aplicadas.
3. Aplicar una sola vez `SUPABASE_MIGRATION_FASE_15D_SECURE_ORDER_CONFIRMATION.sql`.
4. Confirmar variables server-only, incluida `ORDER_RATE_LIMIT_SALT`.
5. Reiniciar la app local.

## Flujo principal

1. Crear pedido invitado y comprobar `pendiente_revision`.
2. Editar contacto/entrega y vincular cliente activo.
3. Liberar a preparacion y comprobar `en_preparacion`.
4. Registrar peso menor al solicitado.
5. Registrar peso mayor al solicitado.
6. Marcar un item parcial con motivo.
7. Marcar un item sin stock con motivo.
8. Verificar estado `listo_para_confirmar`.
9. Ajustar precio final con motivo de 10 caracteres o mas.
10. Emitir enlace y abrirlo en una ventana anonima.

## Token y version

1. Confirmar que la base solo guarda `token_hash`.
2. Confirmar expiracion cercana a 72 horas.
3. Revocar enlace y comprobar mensaje publico.
4. Forzar `expires_at` pasado solo en staging y comprobar vencimiento.
5. Emitir enlace, cambiar peso/precio/motivo y comprobar que queda revocado.
6. Emitir nueva version y comprobar que solo el enlace nuevo funciona.
7. Verificar que token/hash no aparecen en auditoria ni eventos.

## Acciones del cliente

1. Confirmar una vez y comprobar `confirmado_cliente`.
2. Hacer doble clic: debe existir un solo evento `customer_confirmed`.
3. Recargar el enlace usado: debe mostrar ya confirmado.
4. Solicitar contacto dos veces: debe existir un solo evento por version.
5. Confirmar manualmente por llamada/WhatsApp con motivo.

## Permisos

1. Ventas y administrador pueden revisar, preparar y emitir.
2. Inventario y finanzas no pueden abrir `/pedidos`.
3. Usuario inactivo no puede operar.
4. `anon` no puede leer tablas de pedidos, tokens, eventos, clientes ni auditoria.
5. `anon` y `authenticated` no pueden ejecutar RPCs publicas reservadas a `service_role`.

## No impacto operativo

Tomar conteos y stock antes/despues de confirmar cliente:

- `sales` y `sale_items`;
- `products.stock_current`;
- `inventory_movements`;
- `payments`;
- `cash_movements`;
- `accounts_receivable`;
- `accounts_payable`.

Todos deben permanecer sin cambios en Fase 15D.

## Responsive

1. Preparacion interna desde celular.
2. Resumen publico en 360 px sin scroll horizontal.
3. Tablet y escritorio.
4. Error de red sin cambiar estado ni duplicar eventos.
