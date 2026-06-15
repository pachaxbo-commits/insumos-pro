# NOTAS_FASE_6

## Alcance completado

- Modulo `/clientes` funcional conectado a Supabase.
- Modulo `/ventas` funcional conectado a Supabase.
- Tablas `customers`, `sales`, `sale_items` y `accounts_receivable` agregadas al esquema.
- Gestion de clientes con creacion, edicion, desactivacion logica, busqueda y filtros.
- Clientes de tipo `contado` y `credito`.
- Ventas con estados `borrador`, `confirmada` y `anulada`.
- Formulario de venta con cliente, productos, cantidades, precios, descuento y total calculado.
- Confirmacion de ventas con salida automatica de inventario.
- Validacion de stock suficiente antes de confirmar.
- Cuentas por cobrar iniciales para ventas con metodo `credito`.
- KPIs de ventas hoy, ventas del mes, clientes activos, deuda pendiente y productos mas vendidos.
- Historial de ventas con filtros por cliente, estado y fecha.

## Reglas de ventas

- Una venta nueva se guarda como `borrador`.
- Una venta en `borrador` no modifica stock ni deuda.
- Al confirmar, cada item genera un movimiento de inventario tipo `salida`.
- No se permite confirmar si algun producto queda con stock negativo.
- Si el metodo de pago es `credito`, el cliente debe estar marcado como `credito`.
- Si el metodo es `credito`, la venta no puede superar el limite disponible.
- Al confirmar credito, se incrementa `customers.current_balance` y se crea `accounts_receivable`.
- Una venta confirmada no se puede confirmar dos veces.
- La UI solo permite anular ventas en borrador.

## Permisos

- `administrador`: acceso total al modulo comercial.
- `ventas`: puede gestionar clientes, crear ventas, confirmar y anular borradores.
- `inventario`: puede ver ventas en modo lectura.
- `finanzas`: puede ver ventas y clientes para seguimiento de cuentas por cobrar.

## SQL agregado

- `public.customers`
- `public.sales`
- `public.sale_items`
- `public.accounts_receivable`
- RLS por rol para lectura y escritura.
- Funcion `create_sale_draft`.
- Funcion `confirm_sale`.
- Funcion `cancel_sale_draft`.
- Datos demo opcionales para clientes.

## Limitaciones

- No hay pagos parciales ni conciliacion de cuentas por cobrar.
- No hay anulacion de ventas confirmadas ni reversion automatica de stock.
- No hay facturacion fiscal ni numeracion legal.
- No hay busqueda asincrona de productos; el formulario usa selector con productos activos.
- El formulario permite hasta 10 filas de productos por venta.

## Validacion

- `npm run lint`: correcto, sin errores ni advertencias.
- `npm run build`: correcto, compilacion de produccion exitosa.
