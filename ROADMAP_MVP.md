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

## Fase 12B propuesta

- Reversion contable controlada de ventas y compras confirmadas
- Auditoria avanzada con diffs antes/despues
- Reportes PDF e impresion
- Optimizacion con vistas SQL/RPC para alto volumen
