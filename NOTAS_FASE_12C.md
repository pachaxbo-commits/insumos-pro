# NOTAS_FASE_12C

## Objetivo

Preparar administracion interna de usuarios, endurecer auditoria y cerrar errores silenciosos antes de crear Supabase Staging.

## Implementado localmente

- Administracion de usuarios en `/configuracion`, visible solo para `administrador`.
- Acciones server-side para crear usuarios, actualizar nombre/rol/estado y solicitar restablecimiento de acceso.
- Validaciones servidor:
  - nadie puede cambiar su propio rol;
  - nadie puede desactivarse a si mismo;
  - no se puede dejar el sistema sin al menos un administrador activo;
  - roles no administradores no pueden ejecutar acciones administrativas.
- Cliente Supabase admin server-only en `src/lib/supabase/admin.ts`.
- Bitacora escrita desde servidor con `SUPABASE_SERVICE_ROLE_KEY`, no desde cliente autenticado.
- Migracion pendiente `SUPABASE_MIGRATION_FASE_12C_USERS_AUDIT.sql`.
- Errores visibles en productos, reportes, administracion de usuarios y bitacora.

## Variable privada requerida

```bash
SUPABASE_SERVICE_ROLE_KEY=
```

Debe configurarse solo en `.env.local` de desarrollo/staging y en variables privadas de Vercel. Nunca debe tener prefijo `NEXT_PUBLIC_`.

## SQL pendiente para staging

- Proyecto staging nuevo y vacio: ejecutar `SUPABASE_SCHEMA.sql`.
- Proyecto staging existente con Fase 12A aplicada: ejecutar solo `SUPABASE_MIGRATION_FASE_12C_USERS_AUDIT.sql`.
- No ejecutar `SUPABASE_SEED_DEMO.sql` salvo que se quiera poblar una demo/staging controlada.

## Regla operativa temporal

Compras y ventas confirmadas no se editan ni eliminan. Las correcciones se realizan mediante movimientos compensatorios autorizados y auditados.
