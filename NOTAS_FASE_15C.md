# NOTAS FASE 15C

## Alcance

Se implemento checkout invitado en `/catalogo/checkout`. El visitante puede enviar:

- nombre o negocio;
- celular o WhatsApp;
- delivery o recojo;
- direccion cuando corresponde;
- horario aproximado;
- metodo esperado: efectivo, QR o mixto;
- observaciones;
- productos y cantidades del carrito.

El resultado es un pedido con origen `catalogo_invitado` y estado
`pendiente_revision`. No crea Auth, cliente, venta, reserva, movimiento de inventario, caja,
cuenta, pago ni dato de reportes financieros.

## Fuente de verdad

El navegador solo envia `product_id` y cantidad. La RPC vuelve a consultar producto, categoria,
unidad, visibilidad, vendibilidad, disponibilidad, minimo, incremento y precio.

Se guardan snapshots de:

- nombre y telefono;
- entrega, direccion y horario;
- pago esperado;
- nombre de producto y unidad;
- cantidad solicitada;
- precio y subtotal referenciales;
- disponibilidad publica;
- total aproximado.

No se guardan desde el navegador precios, subtotales, totales, costos, stock, proveedor ni margen.

## Seguridad

- `anon` no tiene permisos directos sobre `orders`, `order_items`, auditoria o rate limit.
- La Server Action usa `SUPABASE_SERVICE_ROLE_KEY` solo en servidor.
- La RPC `create_public_catalog_order` solo puede ejecutarla `service_role`.
- La IP se transforma con HMAC y `ORDER_RATE_LIMIT_SALT`; no se guarda IP cruda.
- Maximo 5 intentos por hash de IP en 15 minutos.
- Maximo 30 productos y 10000 unidades por linea.
- Honeypot, validacion estricta e idempotency key.
- Bloqueos transaccionales impiden duplicados por doble clic.
- La referencia publica es aleatoria y no habilita lectura publica del pedido.

La tabla privada de intentos crece con los envios. Antes de alto volumen debe definirse una
retencion operativa periodica; no se agrego limpieza automatica para evitar borrados no validados.

## Compatibilidad Fase 13

Los estados heredados se conservan. Un administrador o ventas vincula el pedido invitado con un
cliente activo; entonces pasa a `recibido` y usa la preparacion existente.

Un trigger bloquea la preparacion mientras el pedido publico no tenga cliente. La confirmacion
final de Fase 13 no fue modificada.

`handle_new_user` no requiere cambios: el checkout no crea usuarios en Supabase Auth y, por tanto,
ese trigger no participa.

## SQL y configuracion

Pendiente de aplicar en staging:

`SUPABASE_MIGRATION_FASE_15C_PUBLIC_CHECKOUT.sql`

Variable privada nueva:

`ORDER_RATE_LIMIT_SALT`

No se ejecuto SQL remoto ni se modifico staging o produccion.
