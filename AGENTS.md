<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# QB Insumos: contexto obligatorio

Antes de cambiar el sistema:

1. Leer `docs/ONBOARDING_DESARROLLO.md`.
2. Para cambios de flujo o datos, leer `docs/FLUJO_PRUEBA_E2E.md` y la sección
   relacionada de `docs/QB_GUIA_ENTREGA_FINAL.md`.
3. Revisar `git status` y preservar cambios ajenos.

La verdad vigente sobre rutas y módulos habilitados está en
`src/lib/auth/roles.ts`, `src/lib/qb-insumos/transition-policy.ts` y
`src/components/layout/app-sidebar.tsx`. Si una guía histórica contradice esos
archivos, detenerse y documentar la discrepancia antes de ampliar accesos.

Reglas no negociables:

- Production es `https://qb-insumos.vercel.app` y usa exclusivamente el
  proyecto Supabase `tekfwbhvqtojpfqusosg`.
- No copiar, imprimir, versionar ni pegar secretos, tokens, cookies o archivos
  `.env`. `.env.local` puede apuntar a un entorno histórico: no asumir que es
  seguro ni canónico.
- `supabase/migrations/` es el único historial SQL canónico. No ejecutar
  `SUPABASE_SCHEMA.sql` ni los SQL históricos de la raíz en Production.
- No probar escrituras, reseteos, seeds ni flujos destructivos en Production.
  Usar Supabase local o un staging autorizado y fixtures con rollback.
- Mantener autorización en las cuatro capas: ruta, Server Action, RLS y RPC.
  Ocultar controles en UI nunca reemplaza validación del servidor.
- Las cantidades solicitada, preparada, externa y entregada son conceptos
  distintos. No fusionarlas ni inferir una desde otra.
- Preparar no descuenta stock. La entrega descuenta una sola vez lo preparado
  en bodega. El abastecimiento externo no mueve stock.
- Los recibos usan entregado real, no solicitado ni preparado, y no registran
  pagos o caja.
- Los cambios de esquema deben ser migraciones nuevas e idempotentes; nunca
  editar una migración ya aplicada.

Antes de entregar un cambio ejecutar, como mínimo, `npm run lint`,
`npm run build` y las pruebas del dominio modificado. Documentar cualquier
validación manual o de base de datos que no se haya podido ejecutar.
