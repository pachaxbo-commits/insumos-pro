# QB-9.8 - Vinculacion y dry-run del nuevo Staging

Fecha/hora: 2026-07-12 21:25:41 -04:00

Estado: dry-run completado. Este documento no autoriza aplicar migraciones.

## Alcance autorizado

- Proyecto: `qb-insumos-staging-v2`.
- Project ref corregido y confirmado por el usuario: `tekfwbhvqtojpfqusosg`.
- Operaciones ejecutadas: `supabase link` al ref anterior y `supabase db push --dry-run --include-all`.
- No se autorizo ni ejecuto un `db push` real, seeds, roles, Auth, datos, deploy o commits.
- No se accedio a Produccion ni al Staging legacy.

## Estado previo del repositorio

- Carpeta: `C:\dev\insumos-pro`.
- Rama: `main`.
- Git: limpio antes de la vinculacion.
- Ultimos commits observados:
  - `8d05cf3 Cierre QB-9.7 y decision de nuevo Staging QB`
  - `1765098 QB Insumos validado localmente hasta QB-9.5`
  - `c5da1de QB Insumos hasta QB-9 antes de validacion local`
- Supabase CLI: `2.109.1`.
- Migraciones canonicas locales: 14.
- No existia `supabase/.temp/project-ref` antes de QB-9.8.

La revision local confirmo que las copias canonicas de Fases 12A, 12C, 15E y 16 a 25 coinciden por hash con sus archivos de raiz. El primer archivo es el baseline aislado validado desde base vacia.

## Vinculo confirmado

Comando ejecutado:

```text
npx supabase link --project-ref tekfwbhvqtojpfqusosg
```

Resultado:

- el comando termino correctamente;
- `supabase/.temp/project-ref` contiene exactamente `tekfwbhvqtojpfqusosg`;
- longitud comprobada: 20 caracteres;
- no se uso ningun otro project ref.

## Dry-run

Comando ejecutado:

```text
npx supabase db push --dry-run --include-all
```

La CLI informo expresamente que las migraciones no serian enviadas a la base y enumero las 14 migraciones locales. El comando termino correctamente.

## Plan ordenado

| Orden | Migracion local | Aparece en dry-run | Dependencia | Riesgo | Decision |
| ---: | --- | ---: | --- | --- | --- |
| 1 | `20260712090100_qb_local_empty_baseline.sql` | Si | Proyecto Supabase limpio | Baseline sintetico valido solo para una base vacia | Incluir en futura solicitud; no aplicado |
| 2 | `20260712090200_fase_12a_security.sql` | Si | Baseline | Roles, funciones y RLS base | Incluir en orden; no aplicado |
| 3 | `20260712090300_fase_12c_users_audit.sql` | Si | Fase 12A | Auditoria y administracion interna | Incluir en orden; no aplicado |
| 4 | `20260712090400_fase_15e_customer_accounts.sql` | Si | Baseline, Auth y seguridad base | Compatibilidad de cuenta cliente | Incluir en orden; no aplicado |
| 5 | `20260712090500_qb2_units_presentations.sql` | Si | Productos y perfiles base | Crea parametrizacion y datos de referencia de unidades | Incluir en orden; no aplicado |
| 6 | `20260712090600_qb3_product_configuration.sql` | Si | QB-2 | Configuracion por producto | Incluir en orden; no aplicado |
| 7 | `20260712090700_qb4_merchandise_receipts.sql` | Si | QB-2, QB-3 e inventario base | RPC de ingreso y movimientos atomicos | Incluir en orden; no aplicado |
| 8 | `20260712090800_qb5_customer_catalog_orders.sql` | Si | QB-3 y cuentas cliente | Catalogo y pedidos QB | Incluir en orden; no aplicado |
| 9 | `20260712090900_qb6_order_preparation_delivery.sql` | Si | QB-4 y QB-5 | Entrega y descuento de stock | Incluir en orden; no aplicado |
| 10 | `20260712091000_qb7_accumulated_receipts.sql` | Si | QB-6 | Recibos no fiscales y estados de pedido | Incluir en orden; no aplicado |
| 11 | `20260712091100_qb9_2_snapshot_actor_fix.sql` | Si | QB-2, QB-5 y QB-6 | Actor Auth/interno de snapshots | Incluir en orden; no aplicado |
| 12 | `20260712091200_qb9_3_grants_report_fix.sql` | Si | Objetos QB previos | Grants minimos compatibles con RLS | Incluir en orden; no aplicado |
| 13 | `20260712091300_qb9_4_baseline_product_access_fix.sql` | Si | Baseline y Fase 23 | Contrato seguro de productos | Incluir en orden; no aplicado |
| 14 | `20260712091400_qb9_5_service_role_contract.sql` | Si | Fase 24 | Contrato minimo de service role | Incluir en orden; no aplicado |

## Comparacion y discrepancias

- Migraciones locales: 14.
- Migraciones mostradas por el dry-run: 14.
- Orden: coincide exactamente.
- Migraciones locales omitidas por el dry-run: ninguna.
- Migraciones inesperadas: ninguna.
- Duplicados: ninguno.
- Fase 15F-B: ausente.
- Fase 15F-C: ausente.
- Fulfillment legacy: ausente.
- `SUPABASE_SCHEMA.sql`: no incluido como migracion; solo existe una advertencia textual dentro del baseline.
- Seed externo: no incluido; no se uso `--include-seed`.
- Roles externos: no incluidos; no se uso `--include-roles`.

QB-2 contiene los registros iniciales canonicos de kg, libra, arroba y cuartilla dentro de la propia migracion. No son un `seed.sql` adicional y no fueron ejecutados durante el dry-run.

## Evidencia de proyecto limpio

El ref vinculado coincide con el proyecto nuevo autorizado y el dry-run propone las 14 migraciones desde el baseline. Esto es consistente con un historial remoto sin estas migraciones. QB-9.8 no realizo un inventario de datos o esquema adicional porque ese acceso no formaba parte del comando autorizado.

## Comprobacion de no escritura

- Migraciones aplicadas: ninguna.
- Seed ejecutado: no.
- Usuarios creados: ninguno.
- Auth modificado: no.
- Datos insertados, actualizados o eliminados: no.
- Tablas modificadas: no por el dry-run.
- Secretos modificados: no.
- Aplicacion ejecutada contra Staging: no.
- Pruebas E2E remotas: no.
- Deploy: no.
- Commit: no.
- Acceso a proyectos legacy: no.

El unico cambio local esperado es la metadata de vinculacion administrada por Supabase CLI dentro de `supabase/.temp`, que apunta al ref autorizado.

## Riesgos pendientes

- La futura aplicacion es una operacion de escritura y necesita autorizacion humana independiente.
- Antes de aplicar debe reconfirmarse el ref y conservarse este orden exacto.
- El baseline sintetico solo debe aplicarse al nuevo proyecto limpio, nunca al Staging legacy.
- Los datos iniciales de unidades contenidos en QB-2 se ejecutaran cuando se autorice una aplicacion real.
- Las pruebas de Auth, RLS, flujos QB y aplicacion pertenecen a una fase posterior y no se ejecutaron aqui.

## Veredicto y recomendacion

**DRY-RUN APROBADO, LISTO PARA SOLICITAR APLICACION.**

Siguiente paso exacto: solicitar una autorizacion humana separada para aplicar estas 14 migraciones al project ref `tekfwbhvqtojpfqusosg`, con regla de detencion ante el primer error y sin incluir seeds externos, roles, datos de prueba, Auth o deploy. No ejecutar la aplicacion hasta recibir esa autorizacion.
