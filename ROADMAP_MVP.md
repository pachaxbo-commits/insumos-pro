# ROADMAP_MVP

## Fase 1

- Base tecnica con Next.js App Router, TypeScript, Tailwind CSS 4 y shadcn/ui
- Layout privado responsive con sidebar, header y acceso rapido a nueva venta
- Dashboard premium inicial con KPIs, alertas, ventas recientes y movimientos de inventario
- Componentes reutilizables para cards, badges, tablas y estados vacios
- Helpers iniciales para Supabase sin dependencia obligatoria de credenciales

## Fase 2

- Autenticacion real con Supabase Auth
- Tabla `profiles` con roles y estado activo
- Proteccion de rutas privadas y logout
- Sidebar dinamico segun permisos
- Pantalla de acceso restringido y base de permisos
- SQL inicial para perfiles, trigger y RLS basica

## Fase 3

- Productos y catalogo real
- Categorias y unidades de medida
- Formularios de alta, edicion y desactivacion logica
- Filtros por nombre, SKU, categoria, estado y stock bajo
- RLS y permisos aplicados al catalogo

## Fase 4

- Inventario y movimientos persistidos
- Entradas, salidas y ajustes
- Mermas y devoluciones
- Actualizacion de `products.stock_current` mediante movimientos
- Alertas reales de stock bajo
- Historial filtrable de movimientos

## Fase 5

- Proveedores reales conectados a Supabase
- Compras con items y estados operativos
- Confirmacion de compras conectada a movimientos de inventario tipo `entrada`
- Listados, filtros y detalle de compra
- Permisos diferenciados para inventario, administracion y finanzas

## Fase 6

- Ventas reales
- Clientes con tipos contado/credito, limites y saldos
- Confirmacion de ventas conectada a movimientos de inventario tipo `salida`
- Cuentas por cobrar iniciales para ventas a credito
- Dashboard operativo de ventas con KPIs y productos mas vendidos
- Permisos diferenciados para ventas, inventario y finanzas

## Fase 7

- Finanzas operativas sobre datos reales
- Cuentas por cobrar con pagos parciales/totales
- Cuentas por pagar conectadas a compras pendientes
- Historial de pagos
- Caja diaria con ingresos, egresos y movimientos manuales
- RLS y Server Actions para roles financieros

## Fase 8

- Reportes operativos y financieros reales
- Vista `/reportes` con tabs de ventas, inventario, clientes, compras, finanzas y exportaciones
- KPIs ejecutivos por rango de fecha y filtros de negocio
- Rankings de productos, clientes y proveedores
- Valorizacion de inventario y utilidad estimada
- Exportaciones CSV para ventas, productos, inventario, clientes, compras, cuentas y caja
- Permisos diferenciados por rol

## Fase 9

- Pulido final para demo comercial
- Dashboard conectado a datos reales de ventas, inventario y finanzas
- Feedback con toast en acciones criticas
- Correcciones de textos, codificacion y placeholders visibles
- Pantalla `/configuracion` preparada para demo
- Documentacion `DEMO_CLIENTE.md`

## Fase 10

- Tabla `audit_logs` con RLS e indices
- Helper de auditoria en Server Actions criticas
- Bitacora visible en `/configuracion`
- Revision y documentacion de seguridad/permisos
- Guias finales de usuario, administrador y entrega
- Pendientes controlados para reversas y riesgos contables

## Fase 11

- Preparacion para produccion real y entrega al cliente
- Separacion documental de demo, prueba y produccion
- Guia segura de limpieza de datos demo
- Plantilla de carga inicial de datos reales
- Guia de usuarios reales y roles
- Checklist de pruebas cliente
- Configuracion productiva de Vercel, Supabase, dominio y backups

## Fase 12A

- Endurecimiento de RLS para perfiles y tablas operativas criticas
- Separacion de SQL productivo y seed demo
- Migracion incremental segura para staging
- Matriz de permisos por rol/tabla
- Plan de pruebas de staging previo a produccion

## Fase 12B

- Validacion real planeada en Supabase Staging
- Procedimiento separado para staging nuevo vs staging existente
- Pruebas por rol, RLS, RPCs criticas, auditoria y flujos operativos

## Fase 12C

- Administracion interna de usuarios desde `/configuracion`
- Creacion, actualizacion, activacion/desactivacion y restablecimiento de acceso desde servidor
- Protecciones contra autocambio de rol, autodesactivacion y perdida del ultimo administrador activo
- Auditoria escrita con mecanismo server-only y RLS cerrada para inserts directos
- Errores visibles en consultas importantes
- Diseno tecnico de anulacion contable segura para Fase 12D

## Fase 12D

- Anulacion contable segura de ventas y compras confirmadas
- Reversion de stock con movimientos compensatorios
- Cierre de CxC/CxP sin pagos como anuladas
- Reversion de caja para ventas de contado/transferencia/QR
- Bloqueos conservadores ante pagos o movimientos posteriores incompatibles
- Auditoria completa de anulaciones confirmadas

## Fase 13

- Pedidos moviles para ventas con preparacion por checklist
- Cantidad solicitada vs cantidad real pesada/entregada
- Estados de pedido: recibido, en preparacion, preparado completo, preparado incompleto, confirmado y cancelado
- Confirmacion de pedido conectada a venta real, inventario, finanzas, dashboard y reportes
- Bloqueo de confirmacion con items pendientes o reglas de negocio incumplidas
- Base segura para futuro catalogo online de clientes

## Fase 13B propuesta

- Catalogo publico controlado para clientes finales
- Cotizacion/formato compartible antes de confirmar despacho
- Flujo de confirmacion de cliente por QR/efectivo/transferencia
- Mejoras logisticas: reparto, entrega y trazabilidad

## Fase 14B

- Compra multiple como planilla unica en modo borrador
- Entidad padre `purchase_batches` y lineas `purchase_batch_lines`
- Proveedor obligatorio y metodo de pago por linea
- Totales por metodo de pago y proveedor
- UI responsive: tabla en PC/tablet y cards editables en movil
- Campo `requires_classification` en productos para preparar lineas que requieren clasificacion de ingreso
- Sin impacto en inventario, caja, cuentas por pagar, reportes ni dashboard

## Fase 14C

- Confirmar compra multiple agrupando lineas por proveedor + metodo de pago
- Crear compras hijas normales y reutilizar `confirm_purchase`
- Mantener auditoria y trazabilidad entre batch y compras hijas
- Bloqueo total si existen lineas que requieren clasificacion y aun no fueron clasificadas
- Atomicidad e idempotencia con RPC transaccional y bloqueo de batch

## Fase 14D

- Clasificacion de ingreso para productos base no vendibles
- Distribucion de costos a productos resultantes por valor de venta o costo manual
- Merma trazable absorbida por productos vendibles
- Confirmacion de compra multiple usando solo productos resultantes
- Bloqueo si falta clasificacion, hay cantidades invalidas o costos inconsistentes
- Auditoria de guardado de clasificacion y confirmacion

## Fase 14D.1

- Precision fisica de tres decimales de punta a punta
- Anulaciones de ventas y compras sin perdida de fracciones
- Revision atomica de lineas clasificadas
- Validacion contra el producto real y bloqueo de flags manipulados
- Igualdad monetaria exacta entre clasificacion, compras hijas y batch
- Rechazo completo de formularios de clasificacion parcialmente invalidos

## Fase 14E propuesta

- Anulacion segura de compra multiple y compras hijas
- Bloqueos conservadores ante pagos, salidas o movimientos posteriores

## Fase 15A

- Auditoria y diseno tecnico del catalogo publico, clientes y pedidos
- Separacion entre escaparate anonimo, carrito local y futuro checkout
- Definicion de contrato publico minimo sin exponer datos operativos

## Fase 15B

- Catalogo publico mobile-first en `/catalogo`
- Publicacion explicita por categoria y producto, oculta por defecto
- RPC publica de solo lectura con lista blanca de campos
- Carrito local persistente sin checkout ni datos personales
- Cantidades con minimo e incremento de hasta tres decimales
- Avisos permanentes sobre precio, peso y disponibilidad referenciales

## Fase 15C

- Checkout invitado seguro y creacion controlada de pedidos
- Snapshot de contacto, entrega, pago esperado, productos y precios referenciales
- Estado `pendiente_revision` sin venta, reserva de stock ni impacto financiero
- Honeypot, rate limit anonimo, idempotencia y limites de productos/cantidades
- Precios reconstruidos en RPC exclusiva de servidor
- Vinculacion manual con cliente interno antes de preparar

## Fase 15D

- Revision interna y liberacion explicita a preparacion
- Cantidades reales, faltantes y precios finales auditados
- Resumen congelado por `quote_version`
- Enlace con token de alta entropia guardado solo como hash
- Expiracion de 72 horas, revocacion y uso unico
- Confirmacion o solicitud de contacto sin acceso a pedidos ajenos
- Estado `confirmado_cliente` sin venta, stock, caja ni cuentas

## Fase 15E completada localmente

- Cuentas de clientes separadas de perfiles internos
- Login, recuperacion, historial y repeticion de pedidos
- Vinculacion verificada, nunca automatica solo por coincidencia de telefono
- Preferencias de entrega y contactos administrables

## Fase 15F propuesta

- Pagos online o comprobantes, recibo digital y conciliacion
- Estados de despacho/entrega y comunicacion al cliente
- Politicas de reembolso, reversa y auditoria asociadas
- Integracion financiera solo despues de confirmacion real

## Fase 15F-B completada localmente

- Fundacion `order_fulfillments` para delivery/recojo
- Ventas de pedido con `order_id` unico y resumen de pago
- Idempotencia de fulfillment, pagos, caja e inventario
- Helpers SQL internos sin acceso directo de cliente
- Bloqueo temporal de anulacion 12D para ventas de pedido
- Sin UI ni RPC publica de despacho hasta Fase 15F-C

## Fase 15F-C completada localmente

- RPC atomica para cerrar pedidos confirmados por cliente
- Recojo entregado y delivery despachado
- Venta definitiva con stock real
- Pagos iniciales separados y caja por pago
- CxC por saldo y autorización administrativa para contado
- UI mobile-first de cierre comercial
- Recibos, pagos posteriores y devoluciones siguen pendientes

- Auditoria avanzada con diffs antes/despues
- Reportes PDF e impresion
- Optimizacion con vistas SQL/RPC para alto volumen
