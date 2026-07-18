# Creación segura de usuarios reales

Los usuarios internos son identidades de Supabase Auth vinculadas a
`public.profiles`. Los clientes externos usan `customer_accounts`; nunca se les
asigna un rol interno.

## Primer administrador

1. Confirmar visualmente el proyecto `tekfwbhvqtojpfqusosg`.
2. En Supabase Dashboard, enviar una invitación al correo real del responsable;
   no definir ni compartir una contraseña manualmente.
3. Vincular una sola vez esa identidad a un perfil `administrador` mediante el
   bootstrap revisado de `README_SETUP.md`.
4. La persona abre el enlace, define su contraseña y prueba `/login`.
5. Verificar perfil activo, rol y acceso a Configuración. Mantener dos
   administradores reales antes de retirar la cuenta de bootstrap.

## Usuarios posteriores

1. Ingresar como administrador.
2. Abrir **Configuración → Invitar usuario**.
3. Indicar correo, nombre y el rol mínimo: `administrador`, `ventas`,
   `inventario` o `finanzas`.
4. La aplicación crea el perfil y envía un enlace para que la persona defina su
   propia contraseña. No genera ni muestra contraseñas temporales.
5. Verificar membresía activa y probar el acceso permitido y denegado del rol.

## Desactivación

No borrar identidades con historial. Un administrador cambia `is_active` a
`false`, comprueba que el acceso queda restringido y conserva auditoría. Las
cuentas demo solo se desactivan con autorización explícita y una lista exacta.
La aplicación impide que un administrador se desactive a sí mismo o elimine el
último administrador activo.

No compartir contraseñas, tokens, cookies, enlaces de recuperación ni secretos
en documentos o canales de soporte.
