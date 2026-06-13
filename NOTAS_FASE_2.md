# NOTAS_FASE_2

## Alcance completado

- Login real con Supabase Auth en `/login`.
- Logout desde el header.
- Proteccion de todas las rutas dentro de `src/app/(private)`.
- Permisos por rol con sidebar dinamico y validacion server-side por pagina.
- Ruta `/acceso-restringido` para usuarios sin autorizacion o con perfil incompleto.
- Base SQL para `profiles`, trigger de alta automatica y RLS basica.

## Roles implementados

- `administrador`
- `ventas`
- `inventario`
- `finanzas`

## Notas tecnicas

- Se agrego `src/proxy.ts` para refresco de sesion con `@supabase/ssr`, alineado con Next 16.
- La proteccion principal vive en `src/lib/auth/session.ts`.
- Si faltan variables de Supabase, la aplicacion no rompe compilacion y `/login` muestra una advertencia clara.
- El perfil se consulta desde `public.profiles`; si falta la tabla o el perfil, el usuario es redirigido a `/acceso-restringido`.

## Pendientes intencionales

- No se implemento registro publico de usuarios.
- No se agrego gestion administrativa de perfiles desde UI.
- No se conectaron modulos reales de productos, ventas, compras, inventario o finanzas.
