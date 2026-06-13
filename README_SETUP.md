# README_SETUP

## Requisitos

- Node.js 20 o superior
- npm 10 o superior

## Instalacion

```bash
npm install
```

## Variables de entorno

1. Crear un archivo `.env.local`.
2. Copiar el contenido de `.env.example`.
3. Completar cuando existan credenciales reales:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

La Fase 1 no depende de Supabase para renderizar el dashboard demo. Si las variables no estan definidas, los helpers de `src/lib/supabase/` devuelven `null` y no bloquean la app.

## Desarrollo

```bash
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).

## Verificacion

```bash
npm run lint
npm run build
```

## Estructura principal

- `src/app`: rutas App Router y layouts
- `src/components/ui`: componentes base de shadcn/ui
- `src/components/layout`: sidebar, header y page header
- `src/components/dashboard`: bloques del dashboard demo
- `src/components/shared`: tabla simple, estados y placeholders
- `src/data`: datos demo del sistema
- `src/lib`: utilidades, navegacion y helpers de Supabase
- `src/types`: contratos TypeScript del dashboard
- `src/hooks`: hooks reutilizables
