# QB-15.1 — Confirmación de correo para cuentas de cliente

## Objetivo

QB Insumos dispone de un endpoint server-side que confirma el correo mediante
`token_hash` y establece la sesión en cookies SSR. Este flujo no depende del
verificador PKCE almacenado en el navegador donde comenzó el registro.

La ruta implementada es:

```text
/mi-cuenta/auth/confirm
```

## Cambio remoto pendiente

No se debe realizar este cambio hasta contar con autorización operativa. En el
proyecto autorizado, ingresar a:

```text
Authentication → Email Templates → Confirm signup
```

Reemplazar el enlace basado únicamente en `{{ .ConfirmationURL }}` por:

```html
<a href="{{ .SiteURL }}/mi-cuenta/auth/confirm?token_hash={{ .TokenHash }}&type=email&redirect_to={{ .RedirectTo }}">
  Confirmar mi cuenta
</a>
```

Configuración exacta de producción:

- Site URL: `https://qb-insumos.vercel.app`
- Variable de Vercel Production:
  `NEXT_PUBLIC_SITE_URL=https://qb-insumos.vercel.app`
- Redirect URL correspondiente al `emailRedirectTo` vigente:
  `https://qb-insumos.vercel.app/mi-cuenta/auth/callback`

`{{ .RedirectTo }}` proviene exclusivamente del `emailRedirectTo` seguro generado
por `registerCustomerAction`. Actualmente contiene el callback del mismo origen,
`registration=1` y uno de estos valores normalizados en `next`:

- `/mi-cuenta`
- `/catalogo`
- `/catalogo/checkout`

El endpoint vuelve a validar el origen, la ruta exacta del callback y el valor de
`next`. Cualquier destino externo o arbitrario termina en `/mi-cuenta`. No se debe
agregar manualmente un `returnTo` recibido libremente del usuario a la plantilla.

Los comodines amplios pueden configurarse de forma opcional para desarrollo
local o previews de Vercel cuando el equipo los necesite. No sustituyen la URL
exacta requerida para producción y deben limitarse a esos entornos no productivos.

## Compatibilidad temporal

La ruta existente `/mi-cuenta/auth/callback` continúa procesando enlaces con
`code` mediante `exchangeCodeForSession`. Esto permite consumir enlaces ya
emitidos antes del cambio de plantilla.

Cuando el correo se abrió en otro navegador o dispositivo y falta el verificador
PKCE, el sistema no presenta el enlace como vencido: dirige al login con el aviso
“Tu correo fue confirmado. Inicia sesión para continuar.”

## Reenvío de confirmación

El reenvío no forma parte de QB-15.1. Implementarlo de forma segura requiere una
acción separada con respuesta no enumerativa, protección de doble envío y manejo
explícito de los límites de Supabase. Se mantiene como mejora posterior para no
ampliar el cambio de autenticación ni alterar el login aprobado.

## Seguridad y datos

- El endpoint usa el cliente Supabase SSR con la clave pública configurada.
- No utiliza `service_role`.
- La cuenta se completa únicamente mediante `register_own_customer_account`.
- No crea `public.profiles`, roles, ubicaciones ni pedidos.
- Los parámetros `token_hash` y `code` nunca se copian a la URL final ni a logs.
- El carrito local no se lee, modifica ni elimina durante la confirmación.
