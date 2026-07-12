# Plan de pruebas Staging - Fase 15E

Aplicar `SUPABASE_MIGRATION_FASE_15E_CUSTOMER_ACCOUNTS.sql` despues de las
migraciones 15C y 15D. No usar produccion.

## Configuracion previa

1. Confirmar backup o proyecto staging descartable.
2. Configurar en Supabase Auth:
   - Site URL: URL de staging.
   - Redirect URLs: `http://localhost:3000/mi-cuenta/auth/callback`.
   - Redirect URLs: `https://STAGING/mi-cuenta/auth/callback`.
3. Configurar `NEXT_PUBLIC_SITE_URL=http://localhost:3000` localmente.
4. Mantener `SUPABASE_SERVICE_ROLE_KEY` solo en `.env.local`, nunca con prefijo
   `NEXT_PUBLIC_`.

## Casos obligatorios

1. Registrar un cliente nuevo y comprobar confirmacion de correo.
2. Iniciar sesion desde `/mi-cuenta`.
3. Abrir `/` con esa sesion y comprobar que no accede al panel interno.
4. Confirmar en SQL Editor que el usuario tiene `customer_accounts` y no `profiles`;
   cambiar su metadata no debe crear ningun perfil o rol.
5. Enviar un pedido autenticado y comprobar que aparece solo en su historial.
6. Crear una segunda cuenta y comprobar que no puede leer el pedido anterior ni
   llamar `get_my_customer_orders` para obtenerlo.
7. Cerrar sesion y enviar un pedido invitado; debe funcionar y no vincular cuenta.
8. Ocultar o agotar un producto de un pedido anterior y usar "Pedir nuevamente";
   debe omitirse con advertencia.
9. Cambiar el precio publico y repetir; el carrito debe mostrar el precio vigente.
10. Solicitar recuperacion, abrir el enlace permitido y cambiar la contrasena.
11. Editar datos habituales; un pedido anterior conserva su snapshot y el checkout
    nuevo queda prellenado con los datos actuales.
12. Desde un administrador interno, crear personal y comprobar que se inserta
    `profiles`, no `customer_accounts`, y conserva su rol elegido.

## Consultas de verificacion

```sql
select id, email, full_name, is_active from public.customer_accounts;
select id, full_name, role, is_active from public.profiles;
select id, public_reference, customer_account_id, customer_id
from public.orders
order by created_at desc;
```

No editar estas tablas manualmente durante la prueba funcional.
