# QB-9.9 - Aplicacion controlada al nuevo Staging

Fecha/hora de cierre: 2026-07-12 21:34:38 -04:00

Estado: las 14 migraciones autorizadas fueron aplicadas. No se autoriza todavia ejecutar pruebas funcionales, crear usuarios o datos de prueba, abrir la aplicacion contra Staging ni desplegar.

## Autorizacion recibida

Se autorizo exclusivamente:

- proyecto `qb-insumos-staging-v2`;
- project ref `tekfwbhvqtojpfqusosg`;
- repetir `npx supabase db push --dry-run --include-all`;
- ejecutar una sola vez `npx supabase db push --include-all`;
- detenerse ante el primer error;
- comprobar despues el historial con `migration list` y un dry-run final.

No se autorizo acceder a proyectos legacy, ejecutar seeds externos, incluir roles, crear usuarios o datos de prueba, modificar Auth, ejecutar RPCs, abrir la aplicacion, desplegar, cambiar codigo/migraciones o hacer commits.

## Verificaciones previas

- Carpeta: `C:\dev\insumos-pro`.
- Git previo: limpio.
- `supabase/.temp/project-ref`: `tekfwbhvqtojpfqusosg`.
- Coincidencia exacta del ref: si.
- Migraciones locales: 14.
- Diferencias frente a la lista autorizada: ninguna.
- Fase 15F-B: ausente.
- Fase 15F-C: ausente.
- Fulfillment legacy: ausente.
- `SUPABASE_SCHEMA.sql`: ausente del directorio de migraciones.

## Dry-run previo

Comando:

```text
npx supabase db push --dry-run --include-all
```

Resultado: codigo 0. La CLI declaro que no enviaria migraciones y mostro exactamente estas 14, en el orden autorizado:

1. `20260712090100_qb_local_empty_baseline.sql`
2. `20260712090200_fase_12a_security.sql`
3. `20260712090300_fase_12c_users_audit.sql`
4. `20260712090400_fase_15e_customer_accounts.sql`
5. `20260712090500_qb2_units_presentations.sql`
6. `20260712090600_qb3_product_configuration.sql`
7. `20260712090700_qb4_merchandise_receipts.sql`
8. `20260712090800_qb5_customer_catalog_orders.sql`
9. `20260712090900_qb6_order_preparation_delivery.sql`
10. `20260712091000_qb7_accumulated_receipts.sql`
11. `20260712091100_qb9_2_snapshot_actor_fix.sql`
12. `20260712091200_qb9_3_grants_report_fix.sql`
13. `20260712091300_qb9_4_baseline_product_access_fix.sql`
14. `20260712091400_qb9_5_service_role_contract.sql`

## Aplicacion

Comando ejecutado una sola vez:

```text
npx supabase db push --include-all
```

La CLI mostro las mismas 14 migraciones, recibio la confirmacion estandar y aplico las 14 en orden. El comando termino con codigo 0. No hubo una migracion SQL fallida.

Los mensajes `NOTICE` correspondieron principalmente a extensiones existentes, objetos que se eliminan condicionalmente y nombres largos de politicas truncados por PostgreSQL. No detuvieron ninguna migracion.

### Advertencia posterior a la aplicacion

Despues de aplicar Fase 25, la CLI no pudo cachear el catalogo pg-delta por ausencia de un certificado temporal local. El nucleo exacto del mensaje fue:

```text
Warning: failed to cache migrations catalog: error exporting pg-delta catalog: edge-runtime script produced no output:
Error: Failed to read certificate file '/workspace/supabase/.temp/pgdelta/pgdelta-target-ca.crt': ENOENT
```

La advertencia ocurrio despues de aplicar las 14 migraciones y el comando devolvio codigo 0. No se intento corregirla ni repetir el push. Las comprobaciones posteriores confirmaron el historial remoto completo y sin pendientes.

## Migration list

Comando:

```text
npx supabase migration list
```

Resultado: codigo 0. Las 14 versiones aparecen emparejadas local/remoto:

| Version | Local | Remota |
| --- | ---: | ---: |
| `20260712090100` | Si | Si |
| `20260712090200` | Si | Si |
| `20260712090300` | Si | Si |
| `20260712090400` | Si | Si |
| `20260712090500` | Si | Si |
| `20260712090600` | Si | Si |
| `20260712090700` | Si | Si |
| `20260712090800` | Si | Si |
| `20260712090900` | Si | Si |
| `20260712091000` | Si | Si |
| `20260712091100` | Si | Si |
| `20260712091200` | Si | Si |
| `20260712091300` | Si | Si |
| `20260712091400` | Si | Si |

## Dry-run posterior

Comando:

```text
npx supabase db push --dry-run --include-all
```

Resultado: codigo 0.

```text
Remote database is up to date.
DRY RUN: migrations will *not* be pushed to the database.
```

No quedan migraciones locales pendientes segun la CLI.

## Seeds, datos y Auth

- `--include-seed`: no usado.
- `--include-roles`: no usado.
- `seed.sql`: no ejecutado.
- Seeds externos: ninguno.
- Usuarios creados: ninguno.
- Datos de prueba creados: ninguno.
- RPCs operativas ejecutadas: ninguna.
- Auth users o configuracion Auth modificados: no.
- Fase 15E creo la funcion publica neutra `handle_new_user()` y referencias FK a `auth.users`; no creo un trigger sobre Auth ni altero usuarios.
- QB-2 inserto como parte de la migracion los datos de referencia canonicos de dimension peso y unidades kg, libra, arroba y cuartilla. Estos registros estaban incluidos y advertidos en el plan de las 14 migraciones; no proceden de un seed externo ni son datos de prueba.

## Confirmaciones de alcance

- Produccion legacy: no accedida.
- Staging legacy: no accedido.
- SQL manual adicional: no ejecutado.
- Seeds o roles adicionales: no ejecutados.
- Usuarios o datos de prueba: no creados.
- Aplicacion contra Staging: no ejecutada.
- Deploy: no realizado.
- Codigo operativo: no modificado.
- Migraciones: no modificadas.
- Migraciones correctivas: no creadas.
- Commit: no realizado.

## Riesgos pendientes

- La advertencia de cache pg-delta debe vigilarse, aunque no dejo migraciones pendientes y no afecto el resultado SQL observado.
- La existencia en historial no sustituye la validacion de esquema, RLS, grants y comportamiento.
- Todavia no se han probado Auth, usuarios ficticios, RPCs, rutas, reportes ni flujos QB en este Staging.
- Cualquier prueba que cree usuarios o datos requiere autorizacion independiente y plan de limpieza/retencion.
- El proyecto legacy debe permanecer fuera de cualquier operacion posterior.

## Veredicto y siguiente paso

**MIGRACIONES APLICADAS CORRECTAMENTE.**

Siguiente paso exacto: solicitar autorizacion independiente para una fase QB-9.10 de validacion de metadatos y pruebas controladas en el nuevo Staging, definiendo previamente usuarios ficticios, datos permitidos, alcance de Auth, limpieza o retencion y criterios de parada. No ejecutar pruebas ni desplegar antes de esa autorizacion.
