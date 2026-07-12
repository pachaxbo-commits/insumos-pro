# QB-9 - Cierre tecnico local

## Alcance

QB-9 cierra tecnicamente el redisenio QB Insumos antes de cualquier uso de Staging. No agrega funcionalidades nuevas, no ejecuta SQL remoto, no migra datos reales y no elimina legado.

El objetivo de esta fase es dejar auditados:

- modulos activos y suspendidos;
- rutas y permisos visuales;
- migraciones canonicas y riesgos de orden;
- dependencias QB-2 a QB-7;
- plan de pruebas local con PostgreSQL/Supabase local;
- plan de Staging;
- checklist de entrega al cliente.

## Veredicto local

Estado: **APROBADO CON RIESGOS**.

Motivo: la auditoria estatica, lint, TypeScript y build pasan, pero no se ejecuto PostgreSQL local porque `.env.local` apunta a un host remoto `*.supabase.co`. Por seguridad no se aplico SQL ni se ejecutaron pruebas de humo con datos ficticios.

## Modulos activos QB

| Modulo | Ruta | Estado | Riesgo |
| --- | --- | --- | --- |
| Inicio QB | `/` | Activo QB | Depende de tablas QB aplicadas para datos reales. |
| Productos | `/productos` | Activo QB | Configuracion QB convive con campos legacy. |
| Parametrizacion | `/parametrizacion` | Activo QB | Requiere QB-2 aplicado. |
| Ingresos | `/ingresos` | Activo QB | Requiere QB-4 y productos/unidades configuradas. |
| Catalogo QB | `/catalogo` | Activo QB publico | Debe validarse en PostgreSQL que RPC no devuelve precios. |
| Checkout QB | `/catalogo/checkout` | Activo QB publico | Crea pedidos QB sin precios; requiere Auth cliente. |
| Mi cuenta QB | `/mi-cuenta` | Activo QB publico autenticado | Usa `qb-catalog`, no la libreria legacy `customer-account`. |
| Pedidos QB | `/pedidos` | Activo QB interno | Preparacion no mueve stock; entrega si mueve stock. |
| Recibos QB | `/recibos`, `/recibos/[id]` | Activo QB interno | Admin emite/anula recibos no fiscales. |
| Reportes QB | `/reportes` | Activo QB interno | Solo lectura; no muta datos. |
| Clientes | `/clientes` | Activo transitorio | Consulta contactos legacy sin saldos ni acciones comerciales. |
| Configuracion | `/configuracion` | Interno tecnico | Estado de transicion y auditoria local. |

## Modulos suspendidos legacy

| Modulo legacy | Ruta | Estado | Evidencia local |
| --- | --- | --- | --- |
| Ventas legacy | `/ventas` | Suspendido legacy | Renderiza `ModuleTransitionScreen`. |
| Finanzas legacy | `/finanzas` | Suspendido legacy | Renderiza `ModuleTransitionScreen`. |
| Compras legacy | `/compras` | Suspendido legacy | Renderiza `ModuleTransitionScreen`. |
| Compras multiples legacy | `/compras/multiple` | Suspendido legacy | Renderiza `ModuleTransitionScreen`. |
| Inventario manual legacy | `/inventario` | Suspendido legacy | Renderiza `ModuleTransitionScreen`. |
| Proveedores legacy | `/proveedores` | Suspendido legacy | Renderiza `ModuleTransitionScreen`. |
| Confirmacion publica legacy | `/pedido/confirmar` | Suspendido legacy publico | Renderiza `ModuleTransitionScreen` con `publicView`. |
| Fulfillment legacy | `order_fulfillments`, `fulfill_confirmed_order` | Suspendido por no exposicion UI QB | No invocado desde modulos QB. |
| Cotizaciones con token | `/pedido/confirmar`, RPCs 15D | Suspendido legacy | Fuera del flujo QB sin precios. |
| Checkout con precios | Legacy 15C | Suspendido legacy | Reemplazado por catalogo/checkout QB sin precios. |

## Auditoria de rutas

| Ruta | Estado | Publico/Privado | Roles | Que permite | Que NO permite | Riesgo |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | Activo QB | Privado | internos con acceso a `/` | Resumen operativo QB | Ventas, caja, pagos, CxC/CxP | Requiere tablas QB aplicadas. |
| `/login` | Interno tecnico | Publico | N/A | Login interno | Operacion QB | Bajo. |
| `/productos` | Activo QB | Privado | administrador, inventario | Productos y configuracion QB | Stock, ventas, pagos | Requiere migraciones QB-2/QB-3. |
| `/parametrizacion` | Activo QB | Privado | administrador, inventario | Unidades/presentaciones | Pedidos, stock, ventas | Requiere QB-2. |
| `/ingresos` | Activo QB | Privado | administrador, inventario | Ingresos fisicos QB | Compras legacy, CxP, pagos | Requiere PostgreSQL validado. |
| `/catalogo` | Activo QB | Publico | cliente opcional | Catalogo sin precios | Precios, pagos, caja | Validar RPC en DB real. |
| `/catalogo/checkout` | Activo QB | Publico/autenticado cliente | cliente | Enviar pedido QB | Stock, venta, pago, recibo | Requiere Auth cliente. |
| `/mi-cuenta` | Activo QB | Publico/autenticado cliente | cliente | Perfil, ubicaciones, historial sin precios | Reportes, recibos internos, precios | Bajo; filtra por `customer_account_id`. |
| `/mi-cuenta/recuperar` | Activo QB | Publico | cliente | Recuperar acceso | Operacion | Bajo. |
| `/mi-cuenta/restablecer` | Activo QB | Publico | cliente | Restablecer contrasena | Operacion | Bajo. |
| `/pedidos` | Activo QB | Privado | administrador, inventario | Preparar y entregar QB | Venta, pago, recibo automatico, fulfillment | Entrega mueve stock; probar idempotencia. |
| `/recibos` | Activo QB | Privado | administrador | Crear/emitir/anular recibos QB | Stock, cobros, caja, CxC | Validar bloqueo doble recibo. |
| `/recibos/[id]` | Activo QB | Privado | administrador | Vista imprimible no fiscal | Metodo de pago, factura fiscal | Bajo. |
| `/reportes` | Activo QB | Privado | administrador, inventario | Reportes de solo lectura | Mutaciones, ventas, caja, pagos | Requiere datos QB aplicados. |
| `/clientes` | Activo transitorio | Privado | administrador, ventas, finanzas | Directorio sin saldos visibles | Cobros, credito operativo | Usa data legacy filtrada visualmente. |
| `/compras` | Suspendido legacy | Privado | roles legacy con acceso | Pantalla de transicion | Formularios de compra | Acceso directo muestra suspension. |
| `/compras/multiple` | Suspendido legacy | Privado | roles legacy con acceso | Pantalla de transicion | Clasificacion legacy | Acceso directo muestra suspension. |
| `/ventas` | Suspendido legacy | Privado | roles legacy con acceso | Pantalla de transicion | Venta POS/manual | Acceso directo muestra suspension. |
| `/finanzas` | Suspendido legacy | Privado | finanzas/admin | Pantalla de transicion | Caja, pagos, CxC/CxP | Acceso directo muestra suspension. |
| `/pedido/confirmar` | Suspendido legacy | Publico | N/A | Pantalla de transicion | Cotizacion/token/precio | Mantener no indexado. |

## Seguridad local estatica

Resultado:

- Rutas internas usan `requireRoleAccess`.
- Clientes externos no tienen entrada a `/reportes`.
- `src/lib/navigation.ts` no lista ventas, finanzas, compras legacy, inventario manual ni proveedores.
- `AppSidebar` cruza navegacion con `getActiveTransitionalModules`, por lo que no muestra modulos suspendidos.
- Catalogo QB usa `get_qb_public_catalog()` y tipos `QbCatalog*` sin campos de precio.
- Mi cuenta QB usa `src/lib/qb-catalog/data.ts`; los archivos legacy `src/lib/customer-account/*` conservan pagos/precios pero no son el portal QB actual.
- Pedidos cliente se crean por `create_qb_catalog_order`; no hay stock, venta, pago, caja ni recibo.
- Preparacion guarda cantidades; entrega mueve stock por `confirm_qb_order_delivery`.
- Recibos QB no mueven stock y no crean ventas/pagos/caja/CxC.
- Reportes QB no tienen `.insert`, `.update`, `.delete` ni `.rpc`.
- No se encontro invocacion de fulfillment legacy desde modulos QB.

## Auditoria QB-2 a QB-7

| Fase | Confirmacion estatica |
| --- | --- |
| QB-2 | Crea `qb_unit_dimensions`, `qb_units`, presentaciones, unidades permitidas y snapshots con RLS. |
| QB-3 | Amplia configuracion QB de productos, precio base futuro, visibilidad catalogo y salidas de clasificacion. |
| QB-4 | Crea ingresos QB, lineas, clasificacion, movimientos puente y RPC de confirmacion con entrada de stock controlada. |
| QB-5 | Crea ubicaciones cliente, pedidos QB, catalogo sin precios y RLS cliente/interno. |
| QB-6 | Crea preparacion, lineas preparadas, entrega y puente a movimientos; bloquea doble entrega y merma/loss. |
| QB-7 | Crea recibos, lineas, pedidos incluidos, eventos, factores compuestos y RPCs de emision/anulacion sin stock. |

## Prueba local PostgreSQL

No ejecutada por seguridad.

Deteccion:

- Host detectado: `wfhvuzigmkgojdoofjib.supabase.co`.
- Puerto: default HTTPS.
- Base: no determinada sin conectar.
- Confirmacion local/aislada: **No**.
- Decision: no ejecutar SQL porque apunta a Supabase remoto.

## Plan de prueba local recomendado

1. Crear Supabase local o PostgreSQL Docker vacio, sin datos reales.
2. Aplicar baseline real del proyecto o restauracion anonima local.
3. Aplicar migraciones canonicas en el orden definido en `QB_INSUMOS_MIGRACIONES_CANONICAS.md`.
4. Crear datos ficticios: admin, inventario, cliente, unidades, papa para clasificar, papa grande/mediana/pequena y carga.
5. Probar ingreso clasificado 60/20/20.
6. Probar pedido cliente sin precios.
7. Probar preparacion parcial.
8. Confirmar entrega y validar descuento unico.
9. Crear, emitir y anular recibo.
10. Verificar reportes.

## Checklist manual extremo a extremo

### Inventario

- Crear unidades kg, arroba y cuartilla.
- Crear presentacion carga de papa.
- Configurar papa como clasificable.
- Registrar ingreso.
- Clasificar 60/20/20.
- Confirmar ingreso.
- Ver stock solo en productos resultado.

### Cliente

- Crear cuenta cliente.
- Crear ubicacion.
- Ver catalogo sin precios.
- Pedir producto.
- Repetir pedido.
- Ver historial sin precios.

### Preparacion

- Admin ve pedido.
- Inicia preparacion.
- Marca completo/parcial/no disponible.
- Guarda preparacion.
- Confirma entrega.
- Verifica stock descontado solo por cantidad real.

### Recibo

- Admin ve pedidos pendientes de recibo.
- Crea borrador.
- Aplica factores 5/7/5/7.
- Edita precio base.
- Decide guardar o no precio base futuro.
- Emite recibo.
- Imprime vista.
- Anula recibo.
- Verifica que stock no cambia.

### Reportes

- Ver inventario.
- Ver ingresos.
- Ver pedidos.
- Ver pendientes de recibo.
- Ver recibos.
- Exportar CSV.
- Confirmar que no hay caja, pagos, CxC ni CxP.

## Candidatos legacy para eliminacion futura

| Archivo/modulo legacy | Estado | Riesgo | Recomendacion |
| --- | --- | --- | --- |
| `src/components/sales/*` | Suspendido | Historicos pueden requerir consulta futura | Mantener hasta archivo historico. |
| `src/lib/sales/*` | Suspendido | RPCs legacy siguen existiendo | No invocar desde QB; retirar despues de respaldo. |
| `src/components/finance/*` | Suspendido | Caja/CxC/CxP fuera de QB | Mantener solo para historico congelado. |
| `src/lib/finance/*` | Suspendido | Puede mutar pagos/caja | No exponer; retirar despues de auditoria. |
| `src/components/purchases/*` | Suspendido | Compras mezclan pagos/CxP | Reemplazado por ingresos QB. |
| `src/components/purchase-batches/*` | Suspendido | Clasificacion legacy crea compras hijas | No usar; conservar historico. |
| `src/components/orders/*` | Suspendido | Cotizacion/precio/token legacy | Reemplazado por `qb-orders`. |
| `src/lib/orders/*` | Suspendido | Llama venta/confirmacion legacy | No invocar desde QB. |
| `src/lib/customer-account/*` | Legacy | Contiene default payment/precios legacy | Confirmar no importado por `/mi-cuenta` QB salvo logout. |
| `src/types/fulfillment.ts` | Suspendido | Modelo contradice QB | Retirar cuando no compile dependencias legacy. |
| Migraciones 15F-B/15F-C | Legacy suspendido | Crea venta/pagos/caja desde fulfillment | No aplicar para flujo QB. |

## Riesgos pendientes

- Falta aplicar y validar migraciones en PostgreSQL local aislado.
- Falta confirmar RLS real con usuarios Supabase locales.
- Falta decidir archivo historico de ventas/finanzas/compras legacy.
- Falta preparar rollback real de Staging con backup verificable.
- `SUPABASE_SCHEMA.sql` sigue existiendo como consolidado historico, no canonico.

## Siguiente paso exacto

Crear una base Supabase local limpia o una copia anonima aislada, aplicar el orden canonico y ejecutar el checklist end-to-end antes de cualquier Staging.
