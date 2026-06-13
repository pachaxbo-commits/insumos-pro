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
3. Completar con credenciales reales de Supabase:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Si tu proyecto usa la nueva clave publishable de Supabase, tambien puedes definir `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; la app la toma como fallback del valor anon.

Si las variables no estan definidas, la aplicacion sigue compilando y `/login` muestra un mensaje claro indicando que falta configuracion.

## Supabase

1. Ir al SQL Editor del proyecto.
2. Ejecutar completo [`SUPABASE_SCHEMA.sql`](/C:/dev/insumos-pro/SUPABASE_SCHEMA.sql).
3. Verificar que se cree la tabla `public.profiles`, el trigger de alta automatica y las politicas RLS.

## Primer usuario administrador

1. Crear un usuario en Supabase Auth:
   Dashboard > Authentication > Users > Add user
2. El trigger creara automaticamente su fila en `public.profiles` con rol `ventas`.
3. Cambiar el rol a `administrador` con SQL:

```sql
update public.profiles
set role = 'administrador'
where id = 'UUID_DEL_USUARIO';
```

## Desarrollo

```bash
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).

Para probar autenticacion, abre tambien [http://localhost:3000/login](http://localhost:3000/login).

## Verificacion

```bash
npm run lint
npm run build
```

## Flujo de autenticacion

- `/login`: ingreso real con Supabase Auth
- `src/app/(private)`: rutas protegidas por sesion
- `/acceso-restringido`: mensaje profesional para usuarios sin permiso o perfil incompleto
- Header: nombre, rol y logout
- Sidebar: modulos filtrados por rol

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
