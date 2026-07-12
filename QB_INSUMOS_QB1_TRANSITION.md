# QB Insumos - QB-1 Transicion visual segura

## Nombre visual final

La aplicacion se presenta visualmente como **QB Insumos**.

No se renombraron rutas, tablas, migraciones, RPCs, Server Actions ni identificadores historicos internos.

## Modulos visibles temporales

| Ruta | Modulo | Motivo de visibilidad |
| --- | --- | --- |
| `/` | Inicio QB | Resumen operativo QB local, sin metricas financieras ni consultas a ventas, pagos, caja, CxC o CxP. |
| `/productos` | Productos | Catalogo base reutilizable y configuracion QB por producto; no ejecuta ventas, pagos ni caja. |
| `/ingresos` | Ingresos | Modulo QB-4 para recepcion fisica y clasificacion opcional sin compras legacy, pagos ni CxP. |
| `/pedidos` | Pedidos QB | Preparacion y entrega fisica QB-6, con stock solo al entregar y sin ventas ni cobros. |
| `/recibos` | Recibos QB | Recibos acumulativos no fiscales posteriores a entrega, sin cobro, caja ni CxC/CxP. |
| `/reportes` | Reportes QB | Reportes simples y auditoria operativa QB-8, sin ventas, pagos, caja, CxC, CxP, compras legacy ni fulfillment. |
| `/parametrizacion` | Parametrizacion QB | Modulo QB-2 para reglas generales de unidades, conversiones y presentaciones sin activar operaciones. |
| `/clientes` | Clientes | Vista transitoria de contacto sin cobros, checkout, saldos operativos ni acciones comerciales antiguas. |
| `/configuracion` | Configuracion y auditoria | Estado QB-1, modulos suspendidos/futuros y bitacora de lectura. No modifica Auth, RLS ni roles reales. |
| `/catalogo` | Catalogo QB | Catalogo sin precios para crear carrito de productos, unidad, cantidad y observacion. |
| `/catalogo/checkout` | Revisar pedido QB | Revision y envio de pedido sin precios ni metodo de pago. |
| `/mi-cuenta` | Cuenta cliente QB | Perfil, ubicaciones, historial, repetir pedido y frecuentes sin precios. |
| `/mi-cuenta/recuperar` | Recuperacion cliente | Recuperacion de acceso cliente. |
| `/mi-cuenta/restablecer` | Restablecer cliente | Restablecimiento de contrasena cliente. |

## Rutas suspendidas

| Ruta | Motivo |
| --- | --- |
| `/inventario` | Los movimientos manuales de stock quedan congelados hasta parametrizar unidades, ingresos y entrega idempotente. |
| `/ventas` | Ventas POS/manuales seran reemplazadas por recibos acumulativos no fiscales posteriores a entrega. |
| `/compras` | Las compras actuales mezclan recepcion con pagos o confirmaciones antiguas. |
| `/compras/multiple` | La base de clasificacion se reutilizara, pero su confirmacion actual queda congelada en QB-1. |
| `/proveedores` | Se congela junto con compras antiguas hasta definir ingresos de mercaderia QB. |
| `/finanzas` | QB Insumos no registra efectivo, QR, caja, pagos, CxC ni CxP. |
| `/pedido/confirmar` | La confirmacion por token y precio queda fuera del flujo oficial. |

## Modulos futuros

- Catalogo sin precios.
- Pedidos QB.
- Preparacion QB.
- Entregas con descuento idempotente.
- Limpieza final, migraciones canonicas y preparacion de Staging.

## Limitacion de la proteccion actual

QB-1 es una proteccion visual y de rutas. Evita que las pantallas suspendidas monten formularios operativos, data loaders y componentes que llaman Server Actions o RPCs de negocio desde esas rutas.

QB-1 no reemplaza todavia:

- revision futura de RPCs;
- revision futura de RLS;
- migracion real de roles;
- migracion real de estados;
- uso operativo de unidades, conversiones y presentaciones;
- modelo de recibos acumulativos.

## Mapa entre roles actuales y roles objetivo

| Rol actual | Estado QB-1 | Rol objetivo probable |
| --- | --- | --- |
| `administrador` | Se conserva sin cambios reales. | Administrador. |
| `ventas` | Se conserva temporalmente; sus modulos comerciales quedan suspendidos. | Reasignar a Administrador o Preparacion/Inventario segun responsabilidad real. |
| `inventario` | Se conserva temporalmente; inventario manual y compras quedan suspendidos. | Preparacion/Inventario. |
| `finanzas` | Se conserva temporalmente; finanzas queda suspendido. | Legado o Administrador, si solo necesita lectura historica. |
| cliente externo via `customer_accounts` | Portal suspendido en QB-1. | Cliente externo. |

La migracion real de roles se hara en una fase posterior. No se modificaron Auth, RLS ni permisos de Supabase.

## Mapa entre estados actuales y estados futuros

| Area | Estados actuales observados | Estados objetivo futuros |
| --- | --- | --- |
| Pedidos | `borrador`, `pendiente_revision`, `recibido`, `en_preparacion`, `listo_para_confirmar`, `confirmado_cliente`, `preparado_completo`, `preparado_incompleto`, `confirmado`, `despachado`, `entregado`, `cancelado` | `borrador_cliente`, `enviado`, `en_preparacion`, `preparado_completo`, `preparado_parcial`, `entregado_pendiente_recibo`, `incluido_en_recibo`, `cancelado`. |
| Lineas de pedido | `pendiente`, `preparado`, `parcial`, `sin_stock`, `cancelado` | `pendiente`, `completa`, `parcial`, `no_disponible`. |
| Compras/lotes | `borrador`, `confirmada`, `cancelada` | `borrador`, `clasificacion_pendiente`, `listo_para_confirmar`, `confirmado`, `cancelado`. |
| Ventas | `borrador`, `confirmada`, `anulada` | Reemplazo por recibos: `borrador`, `emitido`, `anulado`, `reemplazado`. |
| Fulfillment | `pendiente`, `despachado`, `entregado`, `retorno_pendiente`, `devuelto`, `cancelado` | Reemplazo por entrega QB con descuento de stock idempotente. |

Los estados objetivo no estan implementados todavia y no deben mostrarse como operativos hasta su fase correspondiente.

## Pendientes antes de habilitar uso operativo real

1. QB-4: redisenar ingresos de mercaderia y clasificacion sin duplicar stock base.
2. QB-5: rehacer cuenta cliente, catalogo sin precios y pedidos QB.
3. QB-6: separar preparacion y entrega idempotente.
4. QB-9: limpiar legado, ordenar migraciones canonicas, probar en PostgreSQL local y preparar Staging.
