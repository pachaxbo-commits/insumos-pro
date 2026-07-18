# QB Insumos — SMTP con Resend

Esta guía configura manualmente el correo transaccional de Supabase Auth para
QB Insumos. No copie la credencial SMTP en el repositorio, Vercel, capturas,
chats ni tickets.

## Valores operativos

| Campo | Valor |
| --- | --- |
| Proyecto Supabase | `qb-insumos-staging-v2` (`tekfwbhvqtojpfqusosg`) |
| Dominio verificado en Resend | `mail.pachax.net` |
| Host SMTP | `smtp.resend.com` |
| Puerto recomendado | `465` |
| Cifrado | SSL/TLS implícito (SMTPS) |
| Usuario | `resend` |
| Contraseña | Introducir manualmente una API key de Resend; no compartirla |
| Remitente recomendado | `no-reply@mail.pachax.net` |
| Nombre del remitente | `QB Insumos` |
| Site URL | `https://qb-insumos.vercel.app` |

Resend también admite STARTTLS en el puerto `587`. Para esta configuración se
recomienda `465` con SSL/TLS implícito, que evita una conexión inicial sin cifrar.
La dirección remitente debe pertenecer al dominio verificado; si Resend tiene
autorizada una dirección distinta bajo `mail.pachax.net`, use esa dirección.

## Configuración manual

1. Ingrese a Resend y confirme que `mail.pachax.net` figure como verificado.
2. Cree una API key exclusiva para SMTP de QB Insumos o seleccione una credencial
   vigente. Cópiela directamente al formulario de Supabase y no la guarde en un
   archivo local.
3. Abra Supabase Dashboard y compruebe visualmente que el proyecto sea
   `qb-insumos-staging-v2`, ref `tekfwbhvqtojpfqusosg`.
4. Abra **Authentication → SMTP Settings** (Custom SMTP), habilite SMTP
   personalizado y complete los valores de la tabla anterior.
5. En **Authentication → URL Configuration**, establezca exactamente:
   - Site URL: `https://qb-insumos.vercel.app`
   - Redirect URL requerida por el código actual:
     `https://qb-insumos.vercel.app/mi-cuenta/auth/callback`
6. No agregue localhost, deployments antiguos, comodines de producción ni URLs
   de otros proyectos. Las rutas `/mi-cuenta/auth/confirm` y
   `/mi-cuenta/restablecer` son rutas internas de la aplicación; la primera se
   construye desde `SiteURL` en las plantillas y no necesita añadirse como un
   `redirectTo` adicional.
7. Guarde los cambios sin copiar la contraseña SMTP a ningún registro de trabajo.

## Plantilla: confirmar registro

Asunto recomendado: `Confirma tu cuenta de QB Insumos`

```html
<h2>Confirma tu cuenta de QB Insumos</h2>
<p>Para completar tu registro, confirma tu correo mediante el siguiente botón.</p>
<p><a href="{{ .SiteURL }}/mi-cuenta/auth/confirm?token_hash={{ .TokenHash }}&type=email&redirect_to={{ .RedirectTo }}">Confirmar mi cuenta</a></p>
<p>Este enlace es temporal. Si no solicitaste esta cuenta, ignora este correo.</p>
<p>Si necesitas ayuda, comunícate con el administrador de QB Insumos.</p>
```

## Plantilla: recuperar contraseña

Asunto recomendado: `Restablece tu contraseña de QB Insumos`

```html
<h2>Restablece tu contraseña de QB Insumos</h2>
<p>Recibimos una solicitud para cambiar la contraseña de tu cuenta.</p>
<p><a href="{{ .SiteURL }}/mi-cuenta/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Crear una nueva contraseña</a></p>
<p>Este enlace es temporal y solo puede utilizarse una vez. Si no solicitaste el cambio, ignora este correo.</p>
<p>Si necesitas ayuda, comunícate con el administrador de QB Insumos.</p>
```

Esta plantilla usa `token_hash`; por ello funciona aunque el correo se abra en
otro navegador o dispositivo. El callback anterior con `code` se conserva solo
para enlaces emitidos antes del cambio.

## Cambio de correo

QB Insumos no ofrece actualmente una acción de interfaz para cambiar el correo.
No habilite ni pruebe ese flujo como parte de esta puesta en marcha. Si se adopta
después, debe diseñarse y probarse por separado, manteniendo la verificación de
ambas direcciones y mensajes no enumerativos.

## Prueba manual después de configurar SMTP

1. Use una dirección QA autorizada y realice un registro desde `/registro`.
2. Confirme que el mensaje aparece en Resend sin revelar su contenido en logs.
3. Abra el enlace de confirmación en otro navegador y confirme el acceso.
4. Cierre sesión y solicite recuperación desde `/mi-cuenta/recuperar`.
5. Compruebe que la respuesta sea neutral, exista o no la cuenta.
6. Abra el enlace en otro navegador, establezca una contraseña nueva y confirme
   que vuelve a `/login` con el aviso de éxito.
7. Compruebe que un segundo uso del enlace muestre que venció o ya fue utilizado
   y permita solicitar uno nuevo.

## Solución de problemas

- **No llega el correo:** revise Auth Logs de Supabase y el registro de envíos de
  Resend, sin copiar destinatarios ni contenido sensible. Compruebe límites de
  envío y carpeta de spam.
- **Dominio o remitente rechazado:** confirme la verificación de
  `mail.pachax.net`, DKIM/SPF/DMARC y que el remitente pertenezca a ese dominio.
- **Redirect incorrecto:** confirme Site URL y la URL exacta del callback; no use
  localhost ni una URL de preview en producción.
- **Token vencido o usado:** solicite un enlace nuevo. No intente reutilizarlo ni
  modificar el token.
- **Enlaces alterados:** desactive el tracking de enlaces del proveedor para los
  correos de autenticación.
- **Límite de envío:** ajuste los límites de Auth solo a un valor operativo
  razonable y revise también los límites de Resend.
