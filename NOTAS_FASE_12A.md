# NOTAS_FASE_12A

## Objetivo

Endurecer seguridad y preparar el esquema para produccion real sin ejecutar SQL remoto ni modificar instancias Supabase existentes.

## Cambios principales

- Se bloqueo el update directo de `profiles` por usuarios autenticados.
- Se agrego RPC `admin_update_profile` para administracion de perfiles por rol administrador.
- Se bloquearon mutaciones directas en tablas operativas criticas.
- Se separo el seed demo en `SUPABASE_SEED_DEMO.sql`.
- Se creo migracion incremental `SUPABASE_MIGRATION_FASE_12A_SECURITY.sql` para staging.
- Se actualizo documentacion operativa de limpieza, produccion y usuarios reales.
- Se agrego override compatible para `next > postcss` en `package.json` para resolver el advisory moderado reportado por `npm audit --production` sin usar `--force`.

## Regla operativa temporal

Compras y ventas confirmadas no se editan ni eliminan. Las correcciones se realizan mediante movimientos compensatorios autorizados y auditados.

## Pendiente de aplicar

- Aplicar `SUPABASE_MIGRATION_FASE_12A_SECURITY.sql` en staging.
- Ejecutar `PLAN_PRUEBAS_STAGING_FASE_12A.md`.
- No tocar produccion hasta aprobar staging.

## Dependencias

`next@16.2.9` sigue siendo la ultima version publicada por npm al momento de esta fase. Como Next declara `postcss@8.4.31`, se agrego override local a `postcss@8.5.10` para corregir el advisory sin salto mayor de framework.
