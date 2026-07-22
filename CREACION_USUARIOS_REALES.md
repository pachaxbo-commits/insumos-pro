# Creación segura de usuarios reales

Los usuarios internos son identidades de Supabase Auth vinculadas a
`public.profiles`. Ese perfil funciona como membresía interna: contiene rol y
estado activo. Los clientes externos usan `customer_accounts` y nunca reciben
un rol interno.

## Primer administrador

1. Confirmar visualmente `tekfwbhvqtojpfqusosg`.
2. En Supabase Dashboard, invitar al responsable; no definir ni compartir clave.
3. Vincular una sola vez la identidad a un perfil `administrador` mediante el
   bootstrap revisado de `README_SETUP.md`.
4. La persona confirma el correo, define su contraseña y entra en `/login`.
5. Verificar perfil activo, rol y acceso a Configuración.
6. Mantener dos administradores reales antes de retirar el bootstrap.

## Usuarios internos posteriores

1. Ingresar como administrador y abrir **Configuración → Usuarios**.
2. Elegir **Invitar usuario** e introducir correo, nombre y rol mínimo necesario.
3. Confirmar que se creó exactamente un perfil/membresía activo.
4. La persona confirma el correo y define su propia contraseña.
5. Probar inicio de sesión.
6. Verificar módulos permitidos y, al menos, una ruta expresamente denegada.
7. Probar recuperación de contraseña con SMTP ya validado.
8. Para cambiar rol o estado, editar el perfil desde la misma interfaz.
9. Para revocar acceso, establecer `is_active=false`.
10. No borrar la identidad si tiene historial; conservar auditoría y referencias.

La aplicación impide auto-desactivación, cambio del propio rol y dejar el
sistema sin un administrador activo. Si el envío de la invitación falla durante
un alta nueva, la identidad incompleta se revierte para evitar cuentas huérfanas.

## Cliente externo

El cliente se registra en `/registro`, confirma su correo y completa
`customer_accounts`. No crear `profiles` para clientes ni asignarles roles
internos. Validar Catálogo, Mi cuenta, ubicaciones, pedidos propios y repetir
pedido; comprobar que una ruta interna redirige o deniega acceso.

## Desactivación y cuentas demo

No borrar usuarios con historial. Desactivar únicamente mediante una lista
exacta y autorización. Una cuenta no se considera demo por el nombre o correo
aparente. No compartir contraseñas, tokens, cookies ni enlaces de recuperación.
