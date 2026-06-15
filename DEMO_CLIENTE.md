# DEMO_CLIENTE

## Link de demo

- Vercel: reemplazar por el link final de produccion del proyecto.
- Local: `http://localhost:3000`

## Usuario demo sugerido

Crear en Supabase Auth un usuario exclusivo para demo comercial, por ejemplo:

- Email: `demo@insumospro.com`
- Rol recomendado: `administrador`
- Perfil: actualizar `public.profiles.role = 'administrador'`

No usar usuarios reales del cliente ni contrasenas compartidas fuera del entorno de demo.

## Modulos implementados

- Login real con Supabase Auth.
- Roles y permisos: administrador, ventas, inventario y finanzas.
- Dashboard con datos reales de ventas, inventario y finanzas.
- Productos, categorias y unidades de medida.
- Inventario con movimientos reales.
- Proveedores y compras conectadas a inventario.
- Clientes y ventas conectadas a inventario.
- Cuentas por cobrar, cuentas por pagar, pagos y caja.
- Reportes ejecutivos y operativos.
- Exportaciones CSV.

## Flujo recomendado para mostrar

1. Login: entrar con usuario demo y explicar roles.
2. Dashboard: revisar KPIs, ultimas ventas, movimientos y alertas.
3. Productos: mostrar catalogo, stock minimo, precios y estados.
4. Inventario: registrar una entrada o revisar historial.
5. Compra: crear compra en borrador y confirmar para aumentar stock.
6. Venta: crear venta en borrador y confirmar para descontar stock.
7. Finanzas: registrar cobros/pagos y revisar caja diaria.
8. Reportes: filtrar por fechas y exportar CSV.

## Funcionalidades pendientes

- Edicion avanzada de compras/ventas confirmadas.
- Auditoria completa de acciones.
- Reportes PDF e impresion formal.
- Multi-sucursal y multi-almacen.
- Costeo historico por lote.
- Busqueda global real desde el header.
- Parametros de empresa editables desde UI.

## Notas para no prometer de mas

- La utilidad estimada usa costo actual del producto, no costo historico.
- Las exportaciones actuales son CSV, no PDF.
- Los usuarios demo se crean desde Supabase, no desde una pantalla interna.
- El sistema ya esta conectado a Supabase, pero la calidad de la demo depende de tener datos preparados.
