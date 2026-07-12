# CREACION_USUARIOS_REALES

## Roles disponibles

- `administrador`: acceso total, configuracion y bitacora.
- `ventas`: ventas, clientes y reportes comerciales permitidos.
- `inventario`: productos, inventario, proveedores y compras.
- `finanzas`: cuentas, pagos, caja, finanzas y reportes financieros.

## Crear usuario en Supabase Auth

Opcion recomendada despues de Fase 12C:

1. Ingresar a la app con un usuario `administrador`.
2. Abrir `/configuracion`.
3. Usar "Nuevo usuario".
4. Elegir nombre, email y rol.
5. Confirmar que el usuario recibe invitacion o restablecimiento segun configuracion SMTP/Auth de Supabase.

Esta opcion requiere `SUPABASE_SERVICE_ROLE_KEY` configurada como variable privada del servidor.

## Crear primer usuario administrador en Supabase Auth

1. Entrar a Supabase Dashboard.
2. Ir a Authentication > Users.
3. Seleccionar Add user.
4. Ingresar email real del usuario.
5. Definir contrasena temporal segura o enviar invitacion si el flujo esta habilitado.
6. Insertar una unica vez su perfil `administrador` con el SQL de bootstrap documentado en `README_SETUP.md`.

## Asignar rol

El trigger no crea perfiles internos ni asigna roles. Esto es intencional: evita que
el registro publico de clientes pueda escalar a personal. Para usuarios posteriores,
usar exclusivamente `/configuracion`, que crea Auth y `profiles` desde servidor.

La RPC protegida se usa para administrar perfiles internos ya existentes:

```sql
select public.admin_update_profile(
  'UUID_DEL_USUARIO',
  'Nombre Apellido',
  'ventas',
  true
);
```

Cambiar `role` por `administrador`, `ventas`, `inventario` o `finanzas`.

Las cuentas creadas desde `/mi-cuenta` viven en `customer_accounts`, no tienen rol
interno y no deben administrarse como personal.

## Desactivar usuario operativo

No borrar perfiles historicos si ya tuvieron actividad. Desactivar con administrador:

```sql
select public.admin_update_profile(
  'UUID_DEL_USUARIO',
  'Nombre Apellido',
  'ventas',
  false
);
```

Tambien se recomienda deshabilitar o eliminar el usuario en Supabase Auth si ya no debe ingresar.

Desde Fase 12C, la app bloquea que un administrador se desactive a si mismo o deje el sistema sin al menos un administrador activo.

## Buenas practicas

- No usar cuentas compartidas.
- No publicar contrasenas en documentos.
- Exigir contrasenas largas y unicas.
- Revocar accesos cuando una persona deje de operar.
- Mantener al menos dos administradores reales.
- Probar cada rol antes de entregar credenciales.
