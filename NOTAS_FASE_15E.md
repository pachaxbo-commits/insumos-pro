# Fase 15E - Cuentas de cliente

## Alcance

- Registro, login, logout y recuperacion por correo/contrasena.
- Area publica `/mi-cuenta`, separada del panel de personal.
- Datos habituales editables mediante RPC limitada.
- Historial seguro de pedidos propios.
- "Pedir nuevamente" hacia carrito local con catalogo y precios vigentes.
- Checkout invitado intacto y prellenado cuando existe sesion de cliente.

## Seguridad

- `handle_new_user` es neutro: no crea perfiles/cuentas ni confia en metadata.
- Las cuentas publicas viven en `customer_accounts`.
- La Server Action de registro crea `customer_accounts` explicitamente desde servidor.
- El personal se crea con el flujo administrativo server-only y su `profile` se
  inserta explicitamente con `SUPABASE_SERVICE_ROLE_KEY`.
- El cliente no tiene lectura directa de `orders`/`order_items`; consume
  `get_my_customer_orders()`, filtrada internamente por `auth.uid()`.
- El checkout obtiene la identidad de la sesion en servidor. El navegador nunca
  envia un `customer_account_id`.

## Pendiente

- Aplicar y probar la migracion en staging.
- Configurar URLs de Auth.
- Pagos, comprobantes, recibo final, despacho y entrega quedan para Fase 15F.
