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

El trigger crea el perfil por defecto. Ajustar el rol con SQL:

```sql
update public.profiles
set full_name = 'Nombre Apellido',
    role = 'ventas',
    is_active = true,
    updated_at = now()
where id = 'UUID_DEL_USUARIO';
```

Cambiar `role` por `administrador`, `ventas`, `inventario` o `finanzas`.

## Desactivar usuario operativo

No borrar perfiles historicos si ya tuvieron actividad. Desactivar:

```sql
update public.profiles
set is_active = false,
    updated_at = now()
where id = 'UUID_DEL_USUARIO';
```

Tambien se recomienda deshabilitar o eliminar el usuario en Supabase Auth si ya no debe ingresar.

## Buenas practicas

- No usar cuentas compartidas.
- No publicar contrasenas en documentos.
- Exigir contrasenas largas y unicas.
- Revocar accesos cuando una persona deje de operar.
- Mantener al menos dos administradores reales.
- Probar cada rol antes de entregar credenciales.

