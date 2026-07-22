# QB Insumos — configuración SMTP de Production

Esta configuración se realiza manualmente en Supabase Auth. No guardar host
privado, usuario, contraseña, token o API key en el repositorio, Vercel,
capturas, chats o tickets.

## Estado comprobable sin secretos

- Proyecto autorizado: `tekfwbhvqtojpfqusosg`.
- Site URL requerida: `https://qb-insumos.vercel.app`.
- Redirect permitido por el código:
  `https://qb-insumos.vercel.app/mi-cuenta/auth/callback`.
- La API pública de Auth informa correo habilitado, registro habilitado y
  autoconfirmación desactivada.

| Campo | Valor público |
|---|---|
| Site URL | `https://qb-insumos.vercel.app` |
| Redirect permitido | `https://qb-insumos.vercel.app/mi-cuenta/auth/callback` |
- La API pública no demuestra qué proveedor SMTP está activo ni que un correo
  haya sido entregado. Eso permanece pendiente de verificación manual.

## Elegir proveedor

Usar un proveedor transaccional con dominio verificado, métricas de entrega y
soporte para SMTP cifrado. Resend, Postmark, SendGrid, Mailgun y Amazon SES son
opciones posibles; la elección depende del dominio, volumen, soporte y política
del cliente. No se confirma ninguno como configurado desde este repositorio.

Solicitar al proveedor, sin copiar secretos a documentación:

- host SMTP;
- puerto y modo de cifrado (`465` con TLS implícito o `587` con STARTTLS);
- usuario SMTP;
- contraseña o token SMTP;
- dirección remitente verificada;
- nombre del remitente, recomendado `QB Insumos`;
- dominio autorizado y estado de SPF/DKIM;
- política DMARC cuando corresponda;
- límites de envío y rate limits.

## Configuración exacta en Supabase

1. Verificar visualmente la ref `tekfwbhvqtojpfqusosg`.
2. En el proveedor, confirmar dominio y remitente; revisar SPF, DKIM y DMARC.
3. Abrir **Authentication → SMTP Settings** y habilitar Custom SMTP.
4. Introducir directamente host, puerto, usuario y secreto proporcionados.
5. Seleccionar el cifrado compatible con el puerto.
6. Definir el nombre del remitente como `QB Insumos` y una dirección verificada.
7. En **Authentication → URL Configuration**, establecer:
   - Site URL: `https://qb-insumos.vercel.app`
   - Redirect URL: `https://qb-insumos.vercel.app/mi-cuenta/auth/callback`
8. No añadir localhost, previews, comodines ni dominios anteriores a Production.
9. Guardar y revisar los logs sin copiar destinatarios, tokens ni contenido.

## Plantilla de recuperación

Asunto sugerido: `Restablece tu contraseña de QB Insumos`

```html
<h2>Restablece tu contraseña de QB Insumos</h2>
<p>Recibimos una solicitud para cambiar la contraseña de tu cuenta.</p>
<p><a href="{{ .SiteURL }}/mi-cuenta/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Crear una nueva contraseña</a></p>
<p>El enlace es temporal y solo puede utilizarse una vez. Si no solicitaste el cambio, ignora este correo.</p>
```

El enlace debe usar HTTPS y comenzar exactamente con
`https://qb-insumos.vercel.app/`.

## Prueba manual obligatoria

1. Usar una cuenta controlada, nunca una contraseña del cliente.
2. Solicitar recuperación desde `/mi-cuenta/recuperar`.
3. Confirmar que el mensaje de pantalla sea neutral.
4. Verificar entrega en bandeja y revisar Spam.
5. Confirmar remitente, dominio, HTTPS y destino `qb-insumos.vercel.app`.
6. Abrir el enlace, cambiar la contraseña y comprobar retorno a `/login`.
7. Iniciar sesión con la nueva contraseña.
8. Reutilizar el enlace y confirmar rechazo.
9. Probar un enlace realmente vencido y confirmar rechazo.
10. Repetir solicitudes hasta el límite acordado, sin abuso, y comprobar el
    comportamiento de rate limiting en Supabase y en el proveedor.

## Checklist SMTP

- [ ] Dominio autorizado por el cliente.
- [ ] Remitente verificado.
- [ ] SPF aprobado.
- [ ] DKIM aprobado.
- [ ] DMARC revisado cuando corresponda.
- [ ] Cifrado y puerto confirmados.
- [ ] Site URL exacta.
- [ ] Redirect URL exacta.
- [ ] Plantilla con `token_hash` y `type=recovery`.
- [ ] Enlace HTTPS dirigido a `qb-insumos.vercel.app`.
- [ ] Entrega y Spam comprobados.
- [ ] Token usado y vencido rechazados.
- [ ] Login posterior aprobado.
- [ ] Rate limits revisados.
