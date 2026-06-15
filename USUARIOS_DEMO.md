# USUARIOS_DEMO

## Advertencia

No documentar contrasenas reales en archivos publicos. Crear usuarios demo exclusivos en Supabase Auth y compartir credenciales por un canal seguro.

## Roles recomendados

### Administrador

- Recorre todos los modulos.
- Puede ver `/configuracion` y bitacora.
- Ideal para demo principal.

### Ventas

- Prueba clientes y ventas.
- Puede confirmar ventas y generar salidas de inventario.
- No debe gestionar finanzas completas ni compras.

### Inventario

- Prueba productos, inventario, proveedores y compras.
- Puede confirmar compras y generar entradas de inventario.
- No debe gestionar caja ni pagos financieros.

### Finanzas

- Prueba cuentas por cobrar, cuentas por pagar, pagos y caja.
- Puede ver reportes financieros.
- No debe modificar productos ni registrar movimientos de inventario.

## SQL para asignar rol

```sql
update public.profiles
set role = 'administrador'
where id = 'UUID_DEL_USUARIO';
```

Cambiar `administrador` por `ventas`, `inventario` o `finanzas` segun el caso.
