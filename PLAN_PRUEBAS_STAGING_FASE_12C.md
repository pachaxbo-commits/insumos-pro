# PLAN_PRUEBAS_STAGING_FASE_12C

## Preparacion

1. Crear o usar un proyecto Supabase Staging, nunca produccion.
2. Hacer backup si el proyecto ya tiene datos.
3. Aplicar SQL segun caso:
   - Staging nuevo: `SUPABASE_SCHEMA.sql`.
   - Staging existente con 12A: `SUPABASE_MIGRATION_FASE_12C_USERS_AUDIT.sql`.
4. Configurar `.env.local` contra staging:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

5. Crear usuarios de prueba: administrador, ventas, inventario, finanzas, inactivo y sin perfil.
6. Asignar roles desde Supabase SQL o con la UI admin cuando ya exista el primer administrador.

## Pruebas obligatorias

1. Login administrador y abrir `/configuracion`.
2. Crear usuario desde la UI admin.
3. Cambiar nombre y rol de un usuario no actual.
4. Intentar cambiar el propio rol: debe fallar.
5. Intentar desactivar el propio usuario: debe fallar.
6. Intentar desactivar o degradar el ultimo administrador activo: debe fallar.
7. Solicitar restablecimiento de acceso y verificar mensaje claro.
8. Login ventas: no debe abrir `/configuracion` ni ejecutar acciones admin.
9. Login inventario/finanzas: no deben abrir `/configuracion` ni ejecutar acciones admin.
10. Usuario inactivo: debe ir a `/acceso-restringido`.
11. Usuario sin perfil: debe ir a `/acceso-restringido`.
12. Intentar insertar directo en `audit_logs` con cliente autenticado: debe fallar por RLS/permisos.
13. Confirmar compra: stock sube una sola vez y aparece auditoria.
14. Confirmar venta: stock baja una sola vez y aparece auditoria.
15. Registrar pago/cobro/caja: saldos y auditoria correctos.
16. Forzar RLS o desconexion en productos/reportes: debe verse alerta de error, no solo empty state.

## Rollback si falla

- No tocar produccion.
- Guardar mensaje exacto de error y captura.
- Restaurar backup de staging si la migracion deja un estado inconsistente.
- Si solo falla UI, revertir commit local o crear hotfix antes de probar otra vez.
- Si falla SQL, no aplicar a produccion y corregir una nueva migracion incremental.
