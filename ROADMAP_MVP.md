# ROADMAP_MVP

## Fase 1

- Base tecnica con Next.js App Router, TypeScript, Tailwind CSS 4 y shadcn/ui
- Layout privado responsive con sidebar, header y acceso rapido a nueva venta
- Dashboard demo premium con KPIs, alertas, ventas recientes y movimientos de inventario
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

- Compras basicas conectadas a reposicion
- Ventas reales
- Finanzas operativas sobre datos reales
- Reportes operativos y financieros
