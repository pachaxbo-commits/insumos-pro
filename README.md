# QB Insumos

Sistema operativo web para gestionar el flujo diario de QB Insumos: catálogo,
pedidos, preparación, entrega, ingresos, inventario, recibos, clientes,
parametrización, usuarios y auditoría.

Producción: [qb-insumos.vercel.app](https://qb-insumos.vercel.app)

## Inicio para desarrollo

1. Leer [docs/ONBOARDING_DESARROLLO.md](docs/ONBOARDING_DESARROLLO.md).
2. Confirmar accesos propios a GitHub, Supabase y Vercel. No compartir cuentas,
   tokens ni archivos `.env`.
3. Instalar Node.js 24, npm y, si se usará Supabase local, Docker Desktop.
4. Preparar el repositorio:

```powershell
git clone https://github.com/pachaxbo-commits/insumos-pro.git
Set-Location insumos-pro
npm ci
Copy-Item .env.example .env.local
```

5. Completar `.env.local` con credenciales del entorno de desarrollo autorizado.
   No copiar los archivos `.env.local` de otra computadora.
6. Ejecutar:

```powershell
npm run dev
```

Abrir `http://localhost:3000`.

## Verificación mínima

```powershell
npm run lint
npm run build
npm run test:matrix
npm run test:matrix-units
npm run test:delivery-polish
npm run test:receipt-calculations
npm run test:main-flow
npm run test:receipt-market
```

La prueba funcional completa y los roles están documentados en
[docs/FLUJO_PRUEBA_E2E.md](docs/FLUJO_PRUEBA_E2E.md).

## Arquitectura resumida

- Next.js 16 App Router, React 19 y TypeScript.
- Supabase Auth, PostgreSQL, RLS, RPC, Storage y Realtime.
- Server Components para lectura y Server Actions/RPC para escrituras.
- Vercel para Production.
- Google Maps opcional para ubicaciones y SMTP externo para correos de Auth.

Directorios principales:

- `src/app`: rutas públicas, privadas y endpoints.
- `src/components`: interfaz por dominio.
- `src/lib`: acceso a datos, Server Actions y reglas de negocio.
- `src/types`: contratos TypeScript.
- `supabase/migrations`: único historial SQL canónico.
- `scripts`: pruebas de contrato y utilidades controladas.
- `docs`: operación, continuidad, configuración y pruebas.

## Documentación canónica

- [Onboarding de desarrollo](docs/ONBOARDING_DESARROLLO.md)
- [Mensaje de traspaso listo para enviar](docs/MENSAJE_TRASPASO_HERMANO.md)
- [Flujo de prueba E2E](docs/FLUJO_PRUEBA_E2E.md)
- [Guía final de entrega](docs/QB_GUIA_ENTREGA_FINAL.md)
- [Matriz operativa](docs/QB_MATRIZ_OPERATIVA.md)
- [Pendientes controlados](PENDIENTES_CONTROLADOS.md)

Los archivos de fases y los SQL de la raíz son históricos. Nunca ejecutar
`SUPABASE_SCHEMA.sql` ni migraciones sueltas históricas en Production.
