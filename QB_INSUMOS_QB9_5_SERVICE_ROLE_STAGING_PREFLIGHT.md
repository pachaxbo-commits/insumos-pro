# QB-9.5 - Contrato service_role y preflight seguro de Staging

Fecha: 2026-07-12

## Veredicto

**LISTO PARA SOLICITAR ACCESO DE SOLO LECTURA A STAGING**.

Este veredicto no afirma que Staging este aprobado. Solo confirma que el contrato local y los artefactos de inventario estan listos para una futura autorizacion independiente.

## Uso real de service_role

| Uso | Archivo | Operacion | Objeto | Necesita service role | Alternativa | Riesgo |
|---|---|---|---|---|---|---|
| Cliente administrativo | src/lib/supabase/admin.ts | crear cliente server-only | Auth/Data API | si | ninguna para Admin Auth | exposicion si la clave llega al navegador |
| Usuarios internos | src/lib/admin-users/data.ts | listar usuarios Auth | Admin Auth API | si | no consultar auth.users directo | enumeracion sensible |
| Usuarios internos | src/lib/admin-users/actions.ts | crear/consultar/eliminar Auth | Admin Auth API | si | ninguna equivalente cliente | privilegio Auth elevado |
| Perfiles internos | src/lib/admin-users/actions.ts | SELECT/INSERT | profiles | si | RPC adicional no necesaria | crear perfil con rol |
| Auditoria | src/lib/audit/log.ts | INSERT append-only | audit_logs | si | RPC dedicada futura | metadata no confiable |
| Alta cliente | src/lib/customer-account/actions.ts | INSERT posterior a signUp | customer_accounts | si | RPC dedicada futura | cuenta huerfana si falla rollback |
| Checkout invitado legacy | src/lib/catalog/actions.ts | RPC y SELECT cuenta | legacy | no, ruta suspendida | catalogo QB | reactivacion accidental |
| Confirmacion token legacy | src/lib/orders/public-actions.ts | RPC | legacy | no, ruta suspendida | pedidos QB | reactivacion de precios |
| Modulos financieros/inventario legacy | varias actions | escritura de auditoria | audit_logs | solo auditoria | ninguna | rutas permanecen suspendidas |

No se encontro uso de `service_role` en componentes cliente ni variables `NEXT_PUBLIC_*`.

## Contrato minimo final

### Admin Auth API

Permitido desde servidor:

- listar usuarios;
- crear usuario;
- consultar usuario por id;
- eliminar usuario como rollback controlado.

Estas operaciones pertenecen a GoTrue y no dependen de grants sobre tablas `public`.

### Tablas public

| Objeto | Antes QB-9.5 | Requerido | Final |
|---|---|---|---|
| profiles | ALL sintetico | SELECT, INSERT | SELECT, INSERT |
| audit_logs | ALL sintetico | INSERT | INSERT |
| customer_accounts | sin SELECT/INSERT | INSERT | INSERT |
| products/categorias/unidades | ALL sintetico | ninguno | ninguno |
| inventory_movements | ALL sintetico | ninguno | ninguno |
| tablas QB-2 a QB-7 | sin privilegios operativos | ninguno | ninguno |
| ventas/pagos/caja/CxC/CxP/compras legacy | ALL sintetico | ninguno | ninguno |

No se requieren secuencias: los ids administrativos se suministran como UUID.

No existe una RPC administrativa que necesite ejecucion como `service_role`. La actualizacion de perfiles usa `admin_update_profile` con la sesion autenticada del administrador.

## Fase 25

Archivos:

- `SUPABASE_MIGRATION_FASE_25_QB9_5_SERVICE_ROLE_CONTRACT.sql`
- `supabase/migrations/20260712091400_qb9_5_service_role_contract.sql`

La migracion:

- revoca privilegios sinteticos de objetos fuera del contrato;
- concede `SELECT, INSERT` en `profiles`;
- concede `INSERT` en `audit_logs`;
- concede `INSERT` en `customer_accounts`;
- revoca `EXECUTE` del RPC legacy `link_public_order_customer_account`;
- no cambia `anon`, `authenticated`, RLS, roles ni reglas comerciales;
- no concede acceso directo a productos, stock o tablas QB.

## RLS y funciones

- Las 27 tablas auditadas conservan RLS habilitado.
- `service_role` local tiene `rolbypassrls = true`, pero los grants SQL siguen siendo obligatorios.
- Las RPC QB `SECURITY DEFINER` auditadas usan `search_path = public`.
- Fase 25 no concede ejecucion nueva sobre RPCs QB.
- Los helpers de trigger no forman parte del API administrativo.

## Prueba local de service_role

Archivo: `supabase/tests/qb9_5_service_role_local.ps1`.

Operaciones aprobadas:

- Admin Auth API `listUsers`;
- Admin Auth API `createUser` y `deleteUser`;
- REST `SELECT/INSERT profiles`;
- REST `INSERT customer_accounts`;
- REST `INSERT audit_logs`.

Operaciones bloqueadas:

- lectura de `products`;
- lectura de `customer_accounts`;
- actualizacion directa de `profiles`;
- insercion directa de `qb_orders`;
- insercion en `sales`;
- ejecucion de `link_public_order_customer_account`.

Los usuarios y eventos creados por la prueba se eliminan localmente al finalizar. La clave nunca se imprime.

## Correccion del fixture Auth

El E2E insertaba usuarios ficticios directamente en `auth.users` con tokens nulos. GoTrue actual no puede enumerar esos registros mediante Admin API. El fixture ahora establece tokens vacios, sin cambiar datos o reglas de la aplicacion.

## Reset y E2E

- Docker: `desktop-linux`.
- API: `http://127.0.0.1:54321`.
- DB: `127.0.0.1:54322`.
- project ref: ausente.
- `db reset`: OK, 14 migraciones.
- E2E completo: OK sin grants temporales.

Resultados:

- ingreso 10 cargas = 1125 kg;
- clasificacion 675/225/225, base y merma 0;
- pedido 2 arrobas = 22.5 kg;
- preparacion sin stock;
- entrega 16.875 kg y doble entrega bloqueada;
- stock final 668.125 kg;
- recibo 126.225225 / 126.2252 / 126.23, total 2130.05;
- emision/anulacion sin ventas, pagos, caja, CxC o stock;
- cliente A/B aislados;
- usuario sin cuenta bloqueado;
- cliente sin acceso directo a productos;
- catalogo curado sin precios.

## Reportes y CSV

`/reportes` cargo datos reales sin alertas para inventario. CSV de inventario generado desde UI:

- 4 filas;
- 730 bytes;
- stock, unidad, estado y visibilidad QB;
- sin precios, pagos, caja, QR, CxC o CxP.

## Preflight preparado y no ejecutado

Carpeta: `scripts/staging-preflight/`.

- `01_inventory_schema.sql`
- `02_inventory_migrations.sql`
- `03_inventory_functions.sql`
- `04_inventory_rls_policies.sql`
- `05_inventory_grants.sql`
- `06_inventory_indexes_constraints.sql`
- `07_inventory_row_counts.sql`
- `08_inventory_legacy_objects.sql`
- `09_compare_expected_qb_objects.md`

Los ocho SQL fueron revisados estaticamente: solo contienen `SELECT` y consultas a catalogos/conteos. No se ejecutaron.

## Separacion de etapas

### Preparacion local completada

Migraciones, E2E, contrato service role, reportes, CSV, scripts y runbooks.

### Inspeccion remota futura

Requiere autorizacion humana de solo lectura. Solo puede ejecutar los scripts aprobados y guardar resultados.

### Aplicacion futura

Requiere backup validado, diff, migraciones de compatibilidad y una nueva autorizacion. No queda autorizada por QB-9.5.

## Baseline desconocido

- Escenario A: baseline completo; aplicar solo migraciones faltantes despues del diff.
- Escenario B: baseline parcial/distinto; crear compatibilidad especifica y probar sobre copia.
- Escenario C: entorno vacio/descartable; evaluar reconstruccion canonica solo con autorizacion.

Nunca aplicar el baseline local sintetico sobre Staging existente sin diff.

## Riesgos pendientes

- No se conoce el esquema ni historial real de Staging.
- Falta la migracion historica original del baseline.
- El inventario remoto puede revelar diferencias que exijan otra fase local.
- El acceso de solo lectura y el backup aun no fueron autorizados ni ejecutados.
- `.env.local.qb-test` mantiene placeholders y requiere claves locales inyectadas en memoria.

## Siguiente paso exacto

Solicitar autorizacion exclusivamente para inventario de solo lectura de Staging. Antes de conectarse, registrar host/project ref, responsable, ventana y confirmar Produccion por separado. No solicitar aun permiso para migrar, escribir datos o desplegar.

