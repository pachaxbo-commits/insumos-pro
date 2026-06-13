# NOTAS_FASE_1

## Alcance completado

- Se confirmo uso de Next.js con App Router en `src/app`.
- Se valido TypeScript por `tsconfig.json`.
- Se confirmo Tailwind CSS 4 por `postcss.config.mjs` y `src/app/globals.css`.
- Se confirmo shadcn/ui por `components.json` y componentes base en `src/components/ui`.
- Se construyo una base visual premium con datos demo y navegacion completa.

## Decisiones de implementacion

- Se uso un route group `src/app/(private)` para separar la capa privada sin afectar la URL.
- El dashboard principal vive en `/` y los demas modulos quedaron como placeholders listos para Fase 2.
- Los datos demo estan centralizados en `src/data/demo.ts`.
- Los helpers de Supabase no fallan si faltan credenciales; devuelven `null`.

## Pendientes intencionales

- No se implemento autenticacion.
- No se conecto logica real de ventas, compras o inventario.
- No se agregaron escrituras a base de datos.
- No se incorporaron permisos ni roles.

## Riesgos o limites actuales

- El dashboard muestra solo informacion demo, sin persistencia.
- El acceso "Nueva venta" navega al modulo placeholder de ventas.
- La integracion Supabase es solo preparatoria hasta contar con variables reales.
