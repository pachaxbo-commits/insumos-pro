# PLAN PRUEBAS STAGING FASE 15C

## Preparacion

1. Confirmar proyecto, URL y backup de staging.
2. Confirmar Fases 13 y 15B aplicadas.
3. Aplicar una vez `SUPABASE_MIGRATION_FASE_15C_PUBLIC_CHECKOUT.sql`.
4. Configurar `ORDER_RATE_LIMIT_SALT` con al menos 32 caracteres.
5. Reiniciar la app local conectada a staging.

## Flujo feliz

1. Sin iniciar sesion, abrir `/catalogo`.
2. Agregar productos disponibles y uno con estado `consultar`.
3. Abrir `/catalogo/checkout`.
4. Probar delivery con direccion, horario y pago esperado.
5. Enviar y guardar la referencia `PED-*`.
6. Confirmar que el carrito se limpia solo despues del exito.
7. Iniciar como ventas o administrador y abrir `/pedidos`.
8. Confirmar estado `pendiente_revision`, origen, contacto, entrega, items y total.
9. Vincular un cliente activo y comprobar que pasa a `recibido`.
10. Preparar con cantidad real usando el flujo de Fase 13.

## Sin impacto operativo inicial

Antes y despues de enviar el pedido publico, comparar:

- `products.stock_current`;
- cantidad de filas en `sales` y `sale_items`;
- `inventory_movements`;
- `payments`;
- `cash_movements`;
- `accounts_receivable`;
- `accounts_payable`.

Ninguno debe cambiar por crear el pedido.

## Manipulacion y seguridad

1. Cambiar precio, subtotal o total en el navegador: la RPC debe ignorarlos.
2. Enviar producto oculto, inactivo, solo de compra o de clasificacion: debe bloquear.
3. Enviar producto agotado: debe bloquear.
4. Enviar cantidad bajo minimo, fuera de incremento, negativa, con mas de tres decimales o mayor a 10000: debe bloquear.
5. Enviar producto repetido o mas de 30 lineas: debe bloquear.
6. Repetir simultaneamente el mismo idempotency key: debe existir un solo pedido.
7. Intentar `insert`, `update`, `select` o `delete` anonimo en pedidos: debe fallar.
8. Intentar ejecutar la RPC publica con anon/authenticated: debe fallar.
9. Completar el honeypot: no debe crear pedido.
10. Superar cinco intentos en 15 minutos desde la misma IP de prueba: debe mostrar rate limit.

## Integridad y auditoria

1. Verificar snapshots de nombre, telefono, unidad, precio y disponibilidad.
2. Verificar que `estimated_total` coincide con la suma reconstruida por la base.
3. Verificar auditoria `create_public_order` sin telefono, direccion, IP ni secretos en metadata.
4. Verificar auditoria `link_public_order_customer`.
5. Intentar preparar antes de vincular cliente: debe bloquear.
6. Confirmar que inventario/finanzas no pueden abrir `/pedidos`.

## Responsive

1. Celular 360 px: formulario, radios, resumen y boton sin scroll horizontal.
2. Tablet: formulario y resumen legibles.
3. Escritorio: dos columnas y resumen fijo.
4. Simular error de red: conservar carrito y mostrar mensaje claro.
