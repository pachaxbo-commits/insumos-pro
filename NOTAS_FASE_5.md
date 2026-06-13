# NOTAS_FASE_5

## Alcance completado

- Modulo `/proveedores` funcional conectado a Supabase.
- Modulo `/compras` funcional conectado a Supabase.
- Tablas `suppliers`, `purchases` y `purchase_items` agregadas al esquema.
- Formularios para crear, editar y desactivar proveedores sin eliminacion fisica.
- Formulario para crear compras en estado `borrador` con proveedor, fecha, pago e items.
- Confirmacion de compra conectada a inventario mediante movimientos tipo `entrada`.
- Cancelacion permitida solo para compras en borrador.
- Listado de compras con resumen, filtros por proveedor, estado y fecha.
- Detalle de compra con items, cantidades, costos y subtotal.
- Badges visuales para estados de compra y proveedores.

## Reglas de compras

- Una compra nueva se guarda como `borrador`.
- Una compra `borrador` no modifica stock.
- Al confirmar, cada item genera un movimiento de inventario tipo `entrada`.
- La funcion SQL `confirm_purchase` cambia el estado a `confirmada` y evita confirmar dos veces.
- Una compra `confirmada` no se edita desde la interfaz.
- Una compra solo puede cancelarse si sigue en `borrador`.
- No se implementan cuentas por pagar reales; `payment_status` queda preparado para finanzas.

## Permisos

- `administrador`: puede gestionar proveedores y compras.
- `inventario`: puede gestionar proveedores y compras.
- `finanzas`: puede ver compras en modo lectura, sin confirmar ni modificar inventario.
- `ventas`: sin acceso directo a compras ni proveedores.

## SQL agregado

- `public.suppliers`
- `public.purchases`
- `public.purchase_items`
- RLS de lectura/escritura por rol.
- Funcion `create_purchase_draft`.
- Funcion `confirm_purchase`.
- Funcion `cancel_purchase_draft`.
- Datos demo opcionales para proveedores.

## Limitaciones

- No hay edicion avanzada de compras en borrador despues de creadas.
- No hay cuentas por pagar ni calendario de vencimientos.
- No hay anulacion de compras confirmadas ni reversion automatica de stock.
- No hay carga masiva de items; el formulario permite hasta 8 filas por compra.
- Los nombres de usuarios pueden depender de las politicas RLS de `profiles`.

## Validacion

- `npm run lint`: correcto, sin errores ni advertencias.
- `npm run build`: correcto, compilacion de produccion exitosa.
