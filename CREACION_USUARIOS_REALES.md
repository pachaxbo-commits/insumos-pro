# CREACION_USUARIOS_REALES

## Roles disponibles

- `administrador`: acceso total, configuracion y bitacora.
- `ventas`: ventas, clientes y reportes comerciales permitidos.
- `inventario`: productos, inventario, proveedores y compras.
- `finanzas`: cuentas, pagos, caja, finanzas y reportes financieros.

## Crear usuario en Supabase Auth

1. Entrar a Supabase Dashboard.
2. Ir a Authentication > Users.
3. Seleccionar Add user.
4. Ingresar email real del usuario.
5. Definir contrasena temporal segura o enviar invitacion si el flujo esta habilitado.
6. Confirmar que se crea el registro en `public.profiles`.

## Asignar rol

El trigger crea el perfil por defecto. En staging/produccion, ajustar el rol con la RPC protegida ejecutada por un administrador:

```sql
select public.admin_update_profile(
  'UUID_DEL_USUARIO',
  'Nombre Apellido',
  'ventas',
  true
);
```

Cambiar `role` por `administrador`, `ventas`, `inventario` o `finanzas`.

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

## Buenas practicas

- No usar cuentas compartidas.
- No publicar contrasenas en documentos.
- Exigir contrasenas largas y unicas.
- Revocar accesos cuando una persona deje de operar.
- Mantener al menos dos administradores reales.
- Probar cada rol antes de entregar credenciales.
