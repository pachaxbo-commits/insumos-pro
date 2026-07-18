# README_SETUP

> Documento histórico de desarrollo. Para la operación y entrega de QB Insumos
> use [docs/QB_GUIA_ENTREGA_FINAL.md](docs/QB_GUIA_ENTREGA_FINAL.md). No ejecute
> `SUPABASE_SCHEMA.sql` ni los SQL históricos enumerados abajo en Production; el
> único historial canónico es `supabase/migrations/`.

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
SUPABASE_SERVICE_ROLE_KEY=
ORDER_RATE_LIMIT_SALT=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Si tu proyecto usa la nueva clave publishable de Supabase, tambien puedes definir `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; la app la toma como fallback del valor anon.

`SUPABASE_SERVICE_ROLE_KEY` es privada y server-only. Nunca debe tener prefijo `NEXT_PUBLIC_`. Se usa para administracion interna de usuarios y escritura controlada de auditoria desde servidor.

`ORDER_RATE_LIMIT_SALT` tambien es privada y server-only. Debe ser distinta por entorno,
tener al menos 32 caracteres y se usa para anonimizar IP e idempotencia del checkout publico.

`NEXT_PUBLIC_SITE_URL` define el origen permitido para enlaces de confirmacion y
recuperacion. Usar `http://localhost:3000` localmente y la URL HTTPS exacta en staging/produccion.

Si las variables no estan definidas, la aplicacion sigue compilando y `/login` muestra un mensaje claro indicando que falta configuracion.

## Supabase (referencia histórica; no ejecutar en Production)

1. Ir al SQL Editor del proyecto.
2. Para produccion o staging limpio, ejecutar completo [`SUPABASE_SCHEMA.sql`](/C:/dev/insumos-pro/SUPABASE_SCHEMA.sql).
3. Verificar que se creen `public.profiles`, `public.product_categories`, `public.units_of_measure`, `public.products`, `public.inventory_movements`, `public.suppliers`, `public.purchases`, `public.purchase_items`, `public.customers`, `public.sales`, `public.sale_items`, `public.accounts_receivable`, `public.accounts_payable`, `public.payments` y `public.cash_movements`.
4. Confirmar que se creen triggers, politicas RLS endurecidas, las funciones `register_inventory_movement`, `create_purchase_draft`, `confirm_purchase`, `cancel_purchase_draft`, `create_sale_draft`, `confirm_sale`, `cancel_sale_draft`, `register_customer_payment`, `register_supplier_payment`, `register_manual_cash_movement` y `admin_update_profile`.
5. Para Fase 8, confirmar tambien los indices de reportes sobre ventas, items, compras, inventario, pagos y caja. Si ya tienes el esquema anterior aplicado, puedes ejecutar solo el bloque `Fase 8: indices de apoyo para reportes y exportaciones` al final de `SUPABASE_SCHEMA.sql`.
6. Para Fase 10, confirmar la tabla `public.audit_logs`, sus indices, RLS y la funcion `current_user_role`. Si ya tienes fases previas aplicadas, puedes ejecutar solo el bloque `Fase 10: auditoria, bitacora y seguridad operativa` al final de `SUPABASE_SCHEMA.sql`.
7. Para una base existente de staging con fases previas, aplicar [`SUPABASE_MIGRATION_FASE_12A_SECURITY.sql`](/C:/dev/insumos-pro/SUPABASE_MIGRATION_FASE_12A_SECURITY.sql) despues de backup.
8. Para una base existente de staging con Fase 12A aplicada, aplicar despues [`SUPABASE_MIGRATION_FASE_12C_USERS_AUDIT.sql`](/C:/dev/insumos-pro/SUPABASE_MIGRATION_FASE_12C_USERS_AUDIT.sql). Esta migracion refuerza administracion de perfiles y bloquea inserts directos a `audit_logs`.
9. Para habilitar anulacion contable segura, aplicar despues [`SUPABASE_MIGRATION_FASE_12D_SAFE_CANCELLATIONS.sql`](/C:/dev/insumos-pro/SUPABASE_MIGRATION_FASE_12D_SAFE_CANCELLATIONS.sql) y validar [`PLAN_PRUEBAS_STAGING_FASE_12D.md`](/C:/dev/insumos-pro/PLAN_PRUEBAS_STAGING_FASE_12D.md).
10. Para habilitar pedidos moviles con cantidades reales, aplicar despues [`SUPABASE_MIGRATION_FASE_13_ORDERS.sql`](/C:/dev/insumos-pro/SUPABASE_MIGRATION_FASE_13_ORDERS.sql) y validar [`PLAN_PRUEBAS_STAGING_FASE_13.md`](/C:/dev/insumos-pro/PLAN_PRUEBAS_STAGING_FASE_13.md).
11. Para habilitar compras multiples en borrador, aplicar despues [`SUPABASE_MIGRATION_FASE_14B_PURCHASE_BATCHES.sql`](/C:/dev/insumos-pro/SUPABASE_MIGRATION_FASE_14B_PURCHASE_BATCHES.sql). Esta fase no mueve inventario, caja ni cuentas por pagar.
12. Para confirmar compras multiples y crear compras hijas normales, aplicar despues [`SUPABASE_MIGRATION_FASE_14C_CONFIRM_PURCHASE_BATCHES.sql`](/C:/dev/insumos-pro/SUPABASE_MIGRATION_FASE_14C_CONFIRM_PURCHASE_BATCHES.sql) y validar [`PLAN_PRUEBAS_STAGING_FASE_14C.md`](/C:/dev/insumos-pro/PLAN_PRUEBAS_STAGING_FASE_14C.md).
13. Para habilitar clasificacion de ingresos en compras multiples, aplicar despues [`SUPABASE_MIGRATION_FASE_14D_PURCHASE_CLASSIFICATION.sql`](/C:/dev/insumos-pro/SUPABASE_MIGRATION_FASE_14D_PURCHASE_CLASSIFICATION.sql) y validar [`PLAN_PRUEBAS_STAGING_FASE_14D.md`](/C:/dev/insumos-pro/PLAN_PRUEBAS_STAGING_FASE_14D.md).
14. Para corregir precision de tres decimales e integridad no eludible de clasificacion, aplicar despues [`SUPABASE_MIGRATION_FASE_14D_1_PRECISION_INTEGRITY.sql`](/C:/dev/insumos-pro/SUPABASE_MIGRATION_FASE_14D_1_PRECISION_INTEGRITY.sql) y validar [`PLAN_PRUEBAS_STAGING_FASE_14D_1.md`](/C:/dev/insumos-pro/PLAN_PRUEBAS_STAGING_FASE_14D_1.md).
15. Para habilitar el catalogo publico seguro, aplicar despues [`SUPABASE_MIGRATION_FASE_15B_PUBLIC_CATALOG.sql`](/C:/dev/insumos-pro/SUPABASE_MIGRATION_FASE_15B_PUBLIC_CATALOG.sql) y validar [`PLAN_PRUEBAS_STAGING_FASE_15B.md`](/C:/dev/insumos-pro/PLAN_PRUEBAS_STAGING_FASE_15B.md). Esta migracion no publica ningun producto existente por defecto.
16. Para habilitar checkout invitado y pedidos publicos controlados, aplicar despues [`SUPABASE_MIGRATION_FASE_15C_PUBLIC_CHECKOUT.sql`](/C:/dev/insumos-pro/SUPABASE_MIGRATION_FASE_15C_PUBLIC_CHECKOUT.sql) y validar [`PLAN_PRUEBAS_STAGING_FASE_15C.md`](/C:/dev/insumos-pro/PLAN_PRUEBAS_STAGING_FASE_15C.md).
17. Para habilitar revision, resumen final y confirmacion segura, aplicar despues [`SUPABASE_MIGRATION_FASE_15D_SECURE_ORDER_CONFIRMATION.sql`](/C:/dev/insumos-pro/SUPABASE_MIGRATION_FASE_15D_SECURE_ORDER_CONFIRMATION.sql) y validar [`PLAN_PRUEBAS_STAGING_FASE_15D.md`](/C:/dev/insumos-pro/PLAN_PRUEBAS_STAGING_FASE_15D.md).
18. Para habilitar cuentas publicas de clientes, aplicar despues [`SUPABASE_MIGRATION_FASE_15E_CUSTOMER_ACCOUNTS.sql`](/C:/dev/insumos-pro/SUPABASE_MIGRATION_FASE_15E_CUSTOMER_ACCOUNTS.sql) y validar [`PLAN_PRUEBAS_STAGING_FASE_15E.md`](/C:/dev/insumos-pro/PLAN_PRUEBAS_STAGING_FASE_15E.md).
19. Para preparar el cierre comercial seguro, aplicar despues [`SUPABASE_MIGRATION_FASE_15F_B_FULFILLMENT_FOUNDATION.sql`](/C:/dev/insumos-pro/SUPABASE_MIGRATION_FASE_15F_B_FULFILLMENT_FOUNDATION.sql) y validar [`PLAN_PRUEBAS_STAGING_FASE_15F_B.md`](/C:/dev/insumos-pro/PLAN_PRUEBAS_STAGING_FASE_15F_B.md). Esta migracion aun no habilita UI de despacho o cobro.
20. Para habilitar despacho/recojo y pagos iniciales, aplicar despues [`SUPABASE_MIGRATION_FASE_15F_C_FULFILL_CONFIRMED_ORDER.sql`](/C:/dev/insumos-pro/SUPABASE_MIGRATION_FASE_15F_C_FULFILL_CONFIRMED_ORDER.sql) y validar [`PLAN_PRUEBAS_STAGING_FASE_15F_C.md`](/C:/dev/insumos-pro/PLAN_PRUEBAS_STAGING_FASE_15F_C.md).
21. Los datos demo ya no estan dentro del SQL productivo. Si necesitas datos ficticios para demo/staging, ejecutar manualmente [`SUPABASE_SEED_DEMO.sql`](/C:/dev/insumos-pro/SUPABASE_SEED_DEMO.sql). No usar este seed en produccion real.

En Supabase Auth configurar como Redirect URLs:

```text
http://localhost:3000/mi-cuenta/auth/callback
https://URL-STAGING/mi-cuenta/auth/callback
https://URL-PRODUCCION/mi-cuenta/auth/callback
```

## Primer usuario administrador

1. Crear un usuario en Supabase Auth:
   Dashboard > Authentication > Users > Add user
2. El trigger no crea perfiles internos automaticamente. Esto evita que un registro
   publico pueda recibir un rol de personal.
3. Solo para el primer administrador de un proyecto nuevo, insertar el perfil explicitamente:

```sql
insert into public.profiles (id, full_name, role, is_active)
values ('UUID_DEL_USUARIO', 'Administrador', 'administrador', true);
```

Despues de ese bootstrap, crear y administrar todo el personal desde
`/configuracion`. Ese flujo usa `SUPABASE_SERVICE_ROLE_KEY` solo en servidor.

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
- `/mi-cuenta`: registro, login, recuperacion e historial para clientes
- `src/app/(private)`: rutas protegidas por sesion
- `/acceso-restringido`: mensaje profesional para usuarios sin permiso o perfil incompleto
- Header: nombre, rol y logout
- Sidebar: modulos filtrados por rol

## Catalogo de productos

- `/productos`: productos, categorias y unidades de medida conectados a Supabase
- `/catalogo`: escaparate publico de solo lectura con carrito guardado localmente en el navegador
- `administrador` e `inventario`: pueden crear, editar y desactivar
- `ventas`: acceso de solo lectura
- `finanzas`: sin acceso directo al modulo
- El stock actual se actualiza desde movimientos de inventario
- Para publicar un producto se debe activar primero su categoria para catalogo y luego marcar el producto como vendible y visible
- El catalogo publico solo recibe nombre, descripcion publica, imagen, precio referencial, unidad, categoria, cantidad minima, incremento, disponibilidad y orden
- El catalogo no expone costo, stock exacto, proveedor, margen, SKU ni otros campos internos
- `/catalogo/checkout`: checkout invitado que envia una solicitud aproximada para revision
- Con sesion de cliente, el checkout prellena datos y vincula el pedido a su cuenta
- "Pedir nuevamente" copia productos/cantidades al carrito y usa disponibilidad/precios actuales
- El checkout crea un pedido `catalogo_invitado` en `pendiente_revision`, sin venta ni reserva de stock
- El carrito solo se limpia despues de recibir una referencia de pedido confirmada

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
- `/compras/multiple`: planilla de compra multiple en borrador con proveedor y metodo de pago por linea
- Al confirmar una compra multiple, se crean compras hijas normales agrupadas por proveedor y metodo de pago
- Las compras hijas reutilizan `confirm_purchase`, por lo que inventario, caja, cuentas por pagar y reportes se actualizan por el flujo existente
- Las lineas con productos que requieren clasificacion permiten registrar productos resultantes, merma y costo asignado antes de confirmar
- El producto base para clasificar no ingresa a stock; solo ingresan los productos resultantes vendibles
- Una compra en borrador no modifica stock
- Al confirmar una compra se generan movimientos de inventario tipo `entrada` por cada item
- La confirmacion usa la funcion SQL `confirm_purchase` para evitar duplicar entradas
- `administrador` e `inventario`: pueden crear proveedores, crear compras, confirmar y cancelar borradores
- `finanzas`: puede ver compras en modo lectura
- `ventas`: sin acceso directo a compras ni proveedores

## Clientes y ventas

- `/clientes`: clientes de contado o credito con limite y saldo actual
- `/pedidos`: preparacion mobile-first de pedidos con cantidades solicitadas y reales
- Los pedidos del catalogo muestran snapshot de contacto, entrega, pago esperado y referencia publica
- Administrador o ventas debe vincular un cliente interno antes de preparar un pedido invitado
- La preparacion registra cantidades reales y deja el pedido `listo_para_confirmar`
- Ventas puede ajustar precio final solo con motivo obligatorio y auditoria
- El resumen se comparte mediante `/pedido/confirmar#TOKEN`; el fragmento no llega a logs HTTP
- La confirmacion del cliente cambia a `confirmado_cliente`, sin crear venta ni descontar stock
- `/ventas`: ventas con estado `borrador`, `confirmada` o `anulada`
- Un pedido no modifica stock ni finanzas hasta confirmarse como venta real
- Al confirmar un pedido, se crea una venta y se descuenta inventario usando la cantidad real preparada
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

- `/configuracion`: incluye modulos activos, roles, administracion interna de usuarios y bitacora de actividad
- `audit_logs`: registra acciones criticas desde servidor con `SUPABASE_SERVICE_ROLE_KEY`; usuarios autenticados no deben insertar eventos arbitrarios
- Documentos finales: `GUIA_USUARIO.md`, `GUIA_ADMIN.md`, `CHECKLIST_ENTREGA.md`, `SEGURIDAD_PERMISOS.md`, `PENDIENTES_CONTROLADOS.md`, `USUARIOS_DEMO.md`
- Documentos de produccion: `PLAN_PUESTA_EN_PRODUCCION.md`, `LIMPIEZA_DATOS_DEMO.md`, `PLANTILLA_CARGA_DATOS.md`, `CREACION_USUARIOS_REALES.md`, `CHECKLIST_PRUEBAS_CLIENTE.md`, `CONFIGURACION_PRODUCCION.md`
- Fase 12A: `SUPABASE_SCHEMA.sql` queda sin seeds demo y con RLS endurecida para perfiles y tablas operativas criticas
- Fase 12C: administracion interna de usuarios, auditoria server-only y plan de anulación segura futura en `DISENO_FASE_12D_ANULACIONES.md`
- Fase 12D: anulacion contable segura de ventas/compras confirmadas solo para administradores, con reversas auditadas y bloqueos conservadores

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
