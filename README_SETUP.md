# README_SETUP

## Requisitos

- Node.js 20 o superior
- npm 10 o superior

## Instalacion

```bash
npm install
```

## Variables de entorno

1. Crear un archivo `.env.local`.
2. Copiar el contenido de `.env.example`.
3. Completar con credenciales reales de Supabase:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Si tu proyecto usa la nueva clave publishable de Supabase, tambien puedes definir `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; la app la toma como fallback del valor anon.

Si las variables no estan definidas, la aplicacion sigue compilando y `/login` muestra un mensaje claro indicando que falta configuracion.

## Supabase

1. Ir al SQL Editor del proyecto.
2. Ejecutar completo [`SUPABASE_SCHEMA.sql`](/C:/dev/insumos-pro/SUPABASE_SCHEMA.sql).
3. Verificar que se creen `public.profiles`, `public.product_categories`, `public.units_of_measure`, `public.products`, `public.inventory_movements`, `public.suppliers`, `public.purchases`, `public.purchase_items`, `public.customers`, `public.sales`, `public.sale_items`, `public.accounts_receivable`, `public.accounts_payable`, `public.payments` y `public.cash_movements`.
4. Confirmar que se creen triggers, politicas RLS, las funciones `register_inventory_movement`, `create_purchase_draft`, `confirm_purchase`, `cancel_purchase_draft`, `create_sale_draft`, `confirm_sale`, `cancel_sale_draft`, `register_customer_payment`, `register_supplier_payment`, `register_manual_cash_movement` y los datos iniciales de referencia si se deciden cargar.
5. Para Fase 8, confirmar tambien los indices de reportes sobre ventas, items, compras, inventario, pagos y caja. Si ya tienes el esquema anterior aplicado, puedes ejecutar solo el bloque `Fase 8: indices de apoyo para reportes y exportaciones` al final de `SUPABASE_SCHEMA.sql`.
6. Para Fase 10, confirmar la tabla `public.audit_logs`, sus indices, RLS y la funcion `current_user_role`. Si ya tienes fases previas aplicadas, puedes ejecutar solo el bloque `Fase 10: auditoria, bitacora y seguridad operativa` al final de `SUPABASE_SCHEMA.sql`.

## Primer usuario administrador

1. Crear un usuario en Supabase Auth:
   Dashboard > Authentication > Users > Add user
2. El trigger creara automaticamente su fila en `public.profiles` con rol `ventas`.
3. Cambiar el rol a `administrador` con SQL:

```sql
update public.profiles
set role = 'administrador'
where id = 'UUID_DEL_USUARIO';
```

## Desarrollo

```bash
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).

Para probar autenticacion, abre tambien [http://localhost:3000/login](http://localhost:3000/login).

Para preparar una presentacion comercial, revisar [`DEMO_CLIENTE.md`](/C:/dev/insumos-pro/DEMO_CLIENTE.md).

Para entrega real, revisar [`PLAN_PUESTA_EN_PRODUCCION.md`](/C:/dev/insumos-pro/PLAN_PUESTA_EN_PRODUCCION.md), [`CONFIGURACION_PRODUCCION.md`](/C:/dev/insumos-pro/CONFIGURACION_PRODUCCION.md) y [`CHECKLIST_PRUEBAS_CLIENTE.md`](/C:/dev/insumos-pro/CHECKLIST_PRUEBAS_CLIENTE.md).

## Verificacion

```bash
npm run lint
npm run build
```

## Flujo de autenticacion

- `/login`: ingreso real con Supabase Auth
- `src/app/(private)`: rutas protegidas por sesion
- `/acceso-restringido`: mensaje profesional para usuarios sin permiso o perfil incompleto
- Header: nombre, rol y logout
- Sidebar: modulos filtrados por rol

## Catalogo de productos

- `/productos`: productos, categorias y unidades de medida conectados a Supabase
- `administrador` e `inventario`: pueden crear, editar y desactivar
- `ventas`: acceso de solo lectura
- `finanzas`: sin acceso directo al modulo
- El stock actual se actualiza desde movimientos de inventario

## Inventario

- `/inventario`: historial y registro de movimientos reales de stock
- Tipos soportados: `entrada`, `salida`, `ajuste`, `merma`, `devolucion`
- `administrador` e `inventario`: pueden registrar movimientos
- `ventas`: acceso de solo lectura
- `finanzas`: sin acceso directo al modulo
- Las salidas y mermas bloquean stock negativo
- En `ajuste`, la cantidad ingresada representa el nuevo stock final

## Proveedores y compras

- `/proveedores`: gestion de proveedores activos/inactivos conectada a Supabase
- `/compras`: compras con estado `borrador`, `confirmada` o `cancelada`
- Una compra en borrador no modifica stock
- Al confirmar una compra se generan movimientos de inventario tipo `entrada` por cada item
- La confirmacion usa la funcion SQL `confirm_purchase` para evitar duplicar entradas
- `administrador` e `inventario`: pueden crear proveedores, crear compras, confirmar y cancelar borradores
- `finanzas`: puede ver compras en modo lectura
- `ventas`: sin acceso directo a compras ni proveedores

## Clientes y ventas

- `/clientes`: clientes de contado o credito con limite y saldo actual
- `/ventas`: ventas con estado `borrador`, `confirmada` o `anulada`
- Una venta en borrador no modifica stock ni deuda
- Al confirmar una venta se generan movimientos de inventario tipo `salida`
- La confirmacion bloquea stock negativo y ventas a credito por encima del limite
- Si el metodo de pago es `credito`, se actualiza `customers.current_balance` y se crea una cuenta por cobrar en `accounts_receivable`
- `administrador` y `ventas`: pueden crear clientes, crear ventas, confirmar y anular borradores
- `inventario`: puede ver ventas en modo lectura
- `finanzas`: puede ver ventas y clientes para cuentas por cobrar

## Finanzas

- `/finanzas`: resumen financiero, cuentas por cobrar, cuentas por pagar, pagos, caja y movimientos manuales
- Cuentas por cobrar: pagos parciales o totales actualizan `accounts_receivable` y `customers.current_balance`
- Cuentas por pagar: pagos parciales o totales actualizan `accounts_payable`
- `payments`: historial de cobros, pagos a proveedores, ingresos manuales y gastos manuales
- `cash_movements`: ingresos y egresos de caja diaria
- `administrador` y `finanzas`: gestionan pagos, caja y cuentas
- `ventas` e `inventario`: no gestionan finanzas completas

## Reportes y exportaciones

- `/reportes`: reportes de ventas, inventario, clientes, compras, finanzas y exportaciones CSV
- Los filtros principales son por rango de fecha, cliente, producto, categoria, proveedor, estado y metodo de pago
- `administrador` y `finanzas`: acceso completo a reportes y exportaciones
- `ventas`: reportes de ventas, clientes e inventario basico
- `inventario`: reportes de inventario, compras y productos
- Las exportaciones se descargan como CSV desde el navegador y respetan los permisos del rol actual

## Demo comercial y produccion

- `/`: dashboard con datos reales de ventas, inventario y finanzas
- `/configuracion`: estado profesional de modulos, roles y bitacora
- Las acciones principales muestran toast o mensaje inline: productos, inventario, compras, ventas, finanzas y reportes
- No se requiere SQL adicional para Fase 9
- Fase 11 no agrega SQL; prepara limpieza, carga inicial, usuarios reales, configuracion productiva y checklist de pruebas cliente

## Entrega y auditoria

- `/configuracion`: incluye modulos activos, roles y bitacora de actividad
- `audit_logs`: registra acciones criticas de productos, inventario, compras, ventas y finanzas
- Documentos finales: `GUIA_USUARIO.md`, `GUIA_ADMIN.md`, `CHECKLIST_ENTREGA.md`, `SEGURIDAD_PERMISOS.md`, `PENDIENTES_CONTROLADOS.md`, `USUARIOS_DEMO.md`
- Documentos de produccion: `PLAN_PUESTA_EN_PRODUCCION.md`, `LIMPIEZA_DATOS_DEMO.md`, `PLANTILLA_CARGA_DATOS.md`, `CREACION_USUARIOS_REALES.md`, `CHECKLIST_PRUEBAS_CLIENTE.md`, `CONFIGURACION_PRODUCCION.md`

## Estructura principal

- `src/app`: rutas App Router y layouts
- `src/components/ui`: componentes base de shadcn/ui
- `src/components/layout`: sidebar, header y page header
- `src/components/dashboard`: bloques del dashboard operativo
- `src/components/shared`: tabla simple, estados y placeholders
- `src/data`: datos iniciales historicos no usados por el dashboard actual
- `src/lib`: utilidades, navegacion y helpers de Supabase
- `src/types`: contratos TypeScript del dashboard
- `src/hooks`: hooks reutilizables
