# GUIA_ADMIN

## Configuracion inicial

1. Crear proyecto Supabase.
2. Ejecutar `SUPABASE_SCHEMA.sql`.
3. Configurar `.env.local`.
4. Crear usuarios en Supabase Auth.
5. Asignar roles en `public.profiles`.

## Roles

- Usar `administrador` solo para responsables del sistema.
- Usar `ventas` para personal comercial.
- Usar `inventario` para operaciones y abastecimiento.
- Usar `finanzas` para caja, cobros y pagos.

## Bitacora

La bitacora se revisa en `/configuracion`.

Filtros disponibles:

- Usuario
- Accion
- Entidad
- Fecha

## Seguridad

- No compartir usuarios.
- No subir `.env.local` al repositorio.
- Revisar RLS antes de crear nuevas tablas.
- Mantener usuarios inactivos fuera de operacion.

## Mantenimiento

- Revisar logs de Vercel y Supabase.
- Revisar cuentas vencidas semanalmente.
- Respaldar datos segun politica del cliente.
- Probar `npm run lint` y `npm run build` antes de despliegues.

## SQL de rol

```sql
update public.profiles
set role = 'administrador'
where id = 'UUID_DEL_USUARIO';
```
