# CONFIGURACION_PRODUCCION

> Referencia histórica de infraestructura. La guía operativa vigente es
> [docs/QB_GUIA_ENTREGA_FINAL.md](docs/QB_GUIA_ENTREGA_FINAL.md). Nunca ejecute
> `SUPABASE_SCHEMA.sql` en QB Insumos Production.

## Vercel

- Proyecto: completar con nombre final.
- URL de produccion: completar con URL final.
- Dominio personalizado: completar cuando DNS este apuntado.
- Rama de deploy: confirmar rama productiva.
- Comando build: `npm run build`.
- Framework: Next.js.

## Variables de entorno

Configurar en Vercel > Project Settings > Environment Variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ORDER_RATE_LIMIT_SALT=
```

Si Supabase entrega una clave publishable nueva, tambien se puede usar:

```bash
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY` debe configurarse solo como variable privada de servidor. Nunca usar prefijo `NEXT_PUBLIC_` ni mostrarla en logs, documentacion publica o cliente.

`ORDER_RATE_LIMIT_SALT` tambien es server-only, debe tener al menos 32 caracteres y ser
distinta en staging y produccion. Generar con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

No subir `.env.local` al repositorio.

## Supabase

- Proyecto correcto confirmado.
- Historial canónico de `supabase/migrations/` aplicado y sincronizado en el proyecto autorizado.
- Si staging ya tenia Fase 12A, aplicar `SUPABASE_MIGRATION_FASE_12C_USERS_AUDIT.sql` y validar `PLAN_PRUEBAS_STAGING_FASE_12C.md`.
- Para anulaciones seguras, aplicar `SUPABASE_MIGRATION_FASE_12D_SAFE_CANCELLATIONS.sql` y validar `PLAN_PRUEBAS_STAGING_FASE_12D.md`.
- Para pedidos moviles, aplicar `SUPABASE_MIGRATION_FASE_13_ORDERS.sql` y validar `PLAN_PRUEBAS_STAGING_FASE_13.md`.
- Para compras multiples en borrador, aplicar `SUPABASE_MIGRATION_FASE_14B_PURCHASE_BATCHES.sql` antes de habilitar `/compras/multiple`.
- Para confirmar compras multiples, aplicar `SUPABASE_MIGRATION_FASE_14C_CONFIRM_PURCHASE_BATCHES.sql` y validar `PLAN_PRUEBAS_STAGING_FASE_14C.md`.
- Para clasificacion de ingresos en compras multiples, aplicar `SUPABASE_MIGRATION_FASE_14D_PURCHASE_CLASSIFICATION.sql` y validar `PLAN_PRUEBAS_STAGING_FASE_14D.md`.
- Para precision decimal e integridad de clasificacion, aplicar despues `SUPABASE_MIGRATION_FASE_14D_1_PRECISION_INTEGRITY.sql` y validar `PLAN_PRUEBAS_STAGING_FASE_14D_1.md`.
- Para el catalogo publico, aplicar despues `SUPABASE_MIGRATION_FASE_15B_PUBLIC_CATALOG.sql` y validar `PLAN_PRUEBAS_STAGING_FASE_15B.md`. Todos los registros quedan ocultos por defecto.
- Para checkout invitado, aplicar despues `SUPABASE_MIGRATION_FASE_15C_PUBLIC_CHECKOUT.sql` y validar `PLAN_PRUEBAS_STAGING_FASE_15C.md`.
- Para resumen final y confirmacion del cliente, aplicar despues `SUPABASE_MIGRATION_FASE_15D_SECURE_ORDER_CONFIRMATION.sql` y validar `PLAN_PRUEBAS_STAGING_FASE_15D.md`.
- Para cuentas de cliente, aplicar despues `SUPABASE_MIGRATION_FASE_15E_CUSTOMER_ACCOUNTS.sql` y validar `PLAN_PRUEBAS_STAGING_FASE_15E.md`.
- Para la fundacion de fulfillment y pagos de pedidos, aplicar despues `SUPABASE_MIGRATION_FASE_15F_B_FULFILLMENT_FOUNDATION.sql` y validar `PLAN_PRUEBAS_STAGING_FASE_15F_B.md`. No habilita aun operaciones desde UI.
- Para habilitar el cierre de pedidos confirmados, aplicar despues `SUPABASE_MIGRATION_FASE_15F_C_FULFILL_CONFIRMED_ORDER.sql` y validar `PLAN_PRUEBAS_STAGING_FASE_15F_C.md`.
- Registrar `/mi-cuenta/auth/callback` de localhost, staging y produccion en Supabase Auth Redirect URLs.
- `SUPABASE_SEED_DEMO.sql` no aplicado en produccion real.
- RLS habilitado en tablas operativas.
- Usuario administrador real creado.
- Backups revisados segun plan contratado.
- Region del proyecto documentada.

## SQL aplicado

Registrar fecha y responsable:

| Fecha | Bloque SQL | Responsable | Observaciones |
| --- | --- | --- | --- |
| YYYY-MM-DD | SUPABASE_SCHEMA.sql completo | Nombre | Sin errores |
| YYYY-MM-DD | SUPABASE_MIGRATION_FASE_12A_SECURITY.sql | Nombre | Validado en staging |
| YYYY-MM-DD | SUPABASE_MIGRATION_FASE_12C_USERS_AUDIT.sql | Nombre | Validado en staging |
| YYYY-MM-DD | SUPABASE_MIGRATION_FASE_12D_SAFE_CANCELLATIONS.sql | Nombre | Validado en staging |
| YYYY-MM-DD | SUPABASE_MIGRATION_FASE_13_ORDERS.sql | Nombre | Validado en staging |
| YYYY-MM-DD | SUPABASE_MIGRATION_FASE_14B_PURCHASE_BATCHES.sql | Nombre | Validado en staging |
| YYYY-MM-DD | SUPABASE_MIGRATION_FASE_14C_CONFIRM_PURCHASE_BATCHES.sql | Nombre | Validado en staging |
| YYYY-MM-DD | SUPABASE_MIGRATION_FASE_14D_PURCHASE_CLASSIFICATION.sql | Nombre | Validado en staging |
| YYYY-MM-DD | SUPABASE_MIGRATION_FASE_14D_1_PRECISION_INTEGRITY.sql | Nombre | Validado en staging |
| YYYY-MM-DD | SUPABASE_MIGRATION_FASE_15B_PUBLIC_CATALOG.sql | Nombre | Validado en staging |
| YYYY-MM-DD | SUPABASE_MIGRATION_FASE_15C_PUBLIC_CHECKOUT.sql | Nombre | Validado en staging |
| YYYY-MM-DD | SUPABASE_MIGRATION_FASE_15D_SECURE_ORDER_CONFIRMATION.sql | Nombre | Validado en staging |
| YYYY-MM-DD | SUPABASE_MIGRATION_FASE_15E_CUSTOMER_ACCOUNTS.sql | Nombre | Validado en staging |
| YYYY-MM-DD | SUPABASE_MIGRATION_FASE_15F_B_FULFILLMENT_FOUNDATION.sql | Nombre | Validado en staging |
| YYYY-MM-DD | SUPABASE_MIGRATION_FASE_15F_C_FULFILL_CONFIRMED_ORDER.sql | Nombre | Validado en staging |

## Backups recomendados

- Antes de limpieza demo.
- Antes de carga masiva inicial.
- Antes de entregar credenciales reales.
- Semanal durante el primer mes de operacion.
- Mensual despues de estabilizar, ajustable segun volumen.

## Dominio personalizado

1. Agregar dominio en Vercel.
2. Configurar DNS segun instrucciones de Vercel.
3. Esperar propagacion.
4. Validar HTTPS.
5. Probar login y rutas privadas desde dominio final.

## Costo estimado mensual

Los costos dependen de los planes vigentes de Vercel y Supabase. Antes de contratar, confirmar precios actuales en los paneles oficiales.

Referencia operativa:

- Demo o bajo volumen: puede iniciar en planes gratuitos si el uso lo permite.
- Produccion real: recomendar plan pago de Supabase si se requiere backup, limites mayores o soporte operativo.
- Vercel: evaluar plan segun dominio, equipo, trafico y necesidades de soporte.

## Checklist final tecnico

- [ ] Variables configuradas en Production.
- [ ] Deploy productivo exitoso.
- [ ] Dominio final con HTTPS.
- [ ] Login probado.
- [ ] Roles probados.
- [ ] SQL aplicado.
- [ ] Datos reales cargados.
- [ ] Exportaciones probadas.
- [ ] Backup inicial creado.
