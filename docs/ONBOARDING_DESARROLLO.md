# Onboarding y traspaso de desarrollo — QB Insumos

Esta guía permite continuar el proyecto desde otra computadora y otra cuenta
de Codex sin depender del historial privado de un chat anterior.

Estado verificado el 27 de septiembre de 2026:

- rama canónica: `main`;
- commit de referencia al preparar este traspaso: `e10150d`;
- repositorio privado: `pachaxbo-commits/insumos-pro`;
- Production: `https://qb-insumos.vercel.app` (respuesta HTTP 200 verificada);
- proyecto Vercel enlazado: `qb-insumos`;
- único Supabase productivo autorizado: `tekfwbhvqtojpfqusosg`;
- stack local verificado: Node.js 24, npm 11 y Supabase CLI 2.109.1;
- Docker Desktop no estaba activo al preparar la guía.

## 1. Qué contexto sí se transfiere

Una cuenta nueva de Codex no hereda automáticamente esta conversación ni su
memoria. El contexto transferible está versionado en:

- `AGENTS.md`: reglas que Codex carga automáticamente al trabajar en el repo;
- este documento: accesos, instalación, arquitectura y riesgos;
- `docs/FLUJO_PRUEBA_E2E.md`: recorrido funcional para entender el producto;
- `docs/QB_GUIA_ENTREGA_FINAL.md`: referencia operativa amplia;
- `docs/QB_MATRIZ_OPERATIVA.md`: semántica de preparación y entrega;
- `PENDIENTES_CONTROLADOS.md`: deuda y límites conocidos.

Los documentos `NOTAS_FASE_*`, `PLAN_PRUEBAS_STAGING_FASE_*`,
`QB_INSUMOS_QB*` y los SQL de la raíz preservan historia, pero no sustituyen
la documentación canónica anterior.

Para saber qué está habilitado en la interfaz actual, la fuente de verdad es
`src/lib/auth/roles.ts`, `src/lib/qb-insumos/transition-policy.ts` y
`src/components/layout/app-sidebar.tsx`. La guía final describe capacidades
más amplias que siguen en el código o en el historial, pero varias están
pausadas durante la transición del piloto.

## 2. Accesos que deben quedar listos

No usar una contraseña compartida como mecanismo normal de trabajo. Cada
persona debe tener su propia identidad, 2FA y permisos auditables.

### 2.1 GitHub

Situación actual: el repositorio es privado, pertenece a una cuenta personal y
en la auditoría sólo aparecía `pachaxbo-commits`.

Para empezar hoy:

1. El hermano crea o usa su propia cuenta de GitHub.
2. En el repositorio, abrir **Settings → Collaborators → Add people**.
3. Invitar su usuario y esperar que acepte.
4. Confirmar desde su PC que puede clonar y crear una rama.

En un repositorio de cuenta personal, un colaborador puede leer y escribir,
pero la propiedad total sigue siendo de la cuenta propietaria. Si ambos deben
tener control administrativo real, la solución correcta es transferir el repo
a una organización de GitHub y hacerlos propietarios de la organización o
asignar el rol `Admin` al repositorio. No transferir antes de revisar la
integración con Vercel.

Referencia oficial: [administrar personas con acceso a un repositorio](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/managing-teams-and-people-with-access-to-your-repository).

### 2.2 Supabase

1. El hermano crea o usa su propia cuenta de Supabase con su correo.
2. En **Organization Settings → Team**, enviar una invitación.
3. Para trabajo técnico completo, asignar `Administrator` al proyecto
   `tekfwbhvqtojpfqusosg`; usar `Owner` sólo si también administrará membresía,
   transferencia y configuración de la organización.
4. Confirmar que puede abrir Database, Auth, Storage, Logs y Project Settings.
5. No descargar ni enviar claves por chat. Debe obtenerlas directamente del
   panel del entorno autorizado.

Las invitaciones de Supabase expiran y los roles con alcance por proyecto
dependen del plan. Referencia oficial: [Supabase Access Control](https://supabase.com/docs/guides/platform/access-control).

### 2.3 Vercel

La sesión local auditada no podía abrir el proyecto enlazado `qb-insumos`; por
lo tanto, este acceso debe corregirse antes del primer deploy.

1. El propietario abre el equipo correcto en Vercel.
2. En **Team Settings → Members**, invita el correo de la cuenta Vercel del
   hermano.
3. Asignar `Developer` si sólo necesita deploys y variables, `Member` si debe
   administrar proyectos y la mayoría de ajustes, u `Owner` únicamente si
   también administrará el equipo y sus miembros.
4. Confirmar acceso al proyecto `qb-insumos`, sus Deployments, Logs, Domains y
   Environment Variables.
5. Después de clonar, ejecutar `vercel link` con su propia sesión y seleccionar
   el equipo/proyecto existentes; no crear otro proyecto por accidente.

La colaboración de equipo requiere el plan compatible de Vercel. Referencias:
[gestionar miembros](https://vercel.com/docs/rbac/managing-team-members) y
[roles de acceso](https://vercel.com/docs/rbac/access-roles).

### 2.4 Google Cloud / Maps

Google Maps es opcional: el formulario manual de dirección sigue funcionando.
Si modificará mapas o restricciones de claves:

1. Agregar su propia cuenta Google al proyecto correcto desde **IAM**.
2. Conceder sólo los roles necesarios para Maps, API Keys y uso del proyecto.
3. Confirmar restricciones HTTP para localhost y Production según
   `docs/QB16_GOOGLE_MAPS_SETUP.md`.
4. No quitar restricciones ni crear claves sin límites.

Referencia oficial: [administrar acceso con Google Cloud IAM](https://cloud.google.com/iam/docs/granting-changing-revoking-access).

### 2.5 SMTP, dominio y cuenta interna

- Si continuará autenticación/correos, necesita acceso propio al proveedor SMTP
  utilizado y, si corresponde, al DNS del dominio. El estado de SMTP debe
  confirmarse; no asumir que Resend u otro proveedor está activo.
- La aplicación también requiere una cuenta interna distinta de las cuentas de
  infraestructura. En la versión actual la interfaz de gestión de usuarios no
  está montada en una ruta habilitada. Crear la identidad desde Supabase Auth y
  vincularla a un perfil `administrador` siguiendo el bootstrap revisado de
  `CREACION_USUARIOS_REALES.md` y `README_SETUP.md`.
- Nunca compartir una cuenta interna de QB Insumos ni una contraseña temporal.

## 3. Preparar la computadora

Instalar:

- Git;
- Node.js 24 y npm;
- Codex, iniciando sesión con su propia cuenta;
- Docker Desktop, sólo si levantará Supabase local;
- opcional: GitHub CLI y Vercel CLI.

Clonar e instalar:

```powershell
git clone https://github.com/pachaxbo-commits/insumos-pro.git
Set-Location insumos-pro
git status -sb
npm ci
Copy-Item .env.example .env.local
```

Después debe abrir la carpeta raíz en Codex. `AGENTS.md` cargará las reglas del
proyecto. Primer mensaje sugerido:

> Lee AGENTS.md, docs/ONBOARDING_DESARROLLO.md,
> docs/FLUJO_PRUEBA_E2E.md y docs/QB_GUIA_ENTREGA_FINAL.md. Revisa git status,
> confirma el entorno y explícame el flujo afectado antes de cambiar código.

## 4. Variables de entorno

Variables reconocidas:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
# Alternativa moderna a ANON_KEY:
# NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=
SUPABASE_SERVICE_ROLE_KEY=
ORDER_RATE_LIMIT_SALT=
```

`SUPABASE_SERVICE_ROLE_KEY` y `ORDER_RATE_LIMIT_SALT` son secretos exclusivos
del servidor. El salt debe tener al menos 32 caracteres y ser distinto en cada
entorno. Se puede generar localmente:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Reglas:

- nunca copiar `.env.local` de esta computadora: se detectó que puede apuntar a
  un proyecto remoto histórico y no al Production canónico;
- no usar credenciales productivas para desarrollar o ejecutar pruebas que
  escriben;
- no imprimir valores con `Get-Content .env.local`, `vercel env pull` en una
  terminal compartida ni comandos equivalentes;
- las variables productivas se gestionan en Vercel, no en Git.

## 5. Entorno de desarrollo seguro

Opción recomendada: Supabase local.

```powershell
npx supabase start
npx supabase db reset
npx supabase status
```

Requiere Docker Desktop activo. `db reset` es destructivo para la base local,
pero aplica desde cero el historial canónico `supabase/migrations/`. Copiar a
`.env.local` únicamente la URL y claves que muestre `supabase status` para ese
entorno local. No ejecutar el comando contra un proyecto enlazado sin confirmar
el destino.

Alternativa: un proyecto Supabase de staging separado y autorizado. Debe usar
sus propias claves, salt, redirect URLs y datos sintéticos. Para imágenes de
otro host Supabase puede ser necesario actualizar `next.config.ts`; revisar
primero la guía de imágenes incluida con esta versión de Next.js.

No se considera entorno de desarrollo seguro:

- Production;
- el host histórico mencionado en documentos QB9;
- una copia de `.env.local` recibida por correo o chat;
- una base cuyo project ref no se haya confirmado explícitamente.

## 6. Ejecutar y verificar

```powershell
npm run dev
```

Abrir `http://localhost:3000`. Antes de entregar cambios:

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

Hay pruebas adicionales en `scripts/*.test.mjs` y contratos SQL/PowerShell en
`supabase/tests/`. Algunas requieren flags de Node, Supabase local o una base
expresamente autorizada. Seleccionar las del dominio modificado y documentar
qué se ejecutó.

## 7. Arquitectura para orientarse

### Frontend y rutas

- `src/app/(private)`: rutas internas protegidas por sesión y rol.
- `src/app/catalogo`: catálogo y checkout públicos.
- `src/app/mi-cuenta`: cuenta, ubicaciones, pedidos y recuperación del cliente.
- `src/app/pedido/confirmar`: confirmación pública con token en fragmento URL.
- `src/app/api`: exportación Excel y plantillas operativas.
- `src/components`: UI agrupada por dominio.

### Backend

- `src/lib/*/data.ts`: lecturas.
- `src/lib/*/actions.ts`: Server Actions, validaciones y escrituras.
- `src/lib/supabase`: clientes browser, server y admin.
- `src/lib/auth`: sesión, permisos y roles.
- `supabase/migrations`: tablas, RLS, funciones, RPC e integridad.

Las acciones críticas se vuelven a validar en ruta, Server Action, RLS y RPC.
El cliente nunca es la autoridad de permisos, precios, stock o estado.

### Servicios externos

- GitHub: fuente del código.
- Vercel: build, variables y deploy de Production.
- Supabase: Auth, PostgreSQL, RLS, RPC, Storage y Realtime.
- Google Maps: ayuda opcional para ubicaciones.
- SMTP: confirmación y recuperación de cuentas.

### Mapa funcional vigente

| Área | Ruta | Estado actual |
| --- | --- | --- |
| Pedidos internos | `/pedidos` | Administrador crea y consulta pedidos |
| Preparación y entrega | `/matriz-operativa` | Administrador, Inventario y Entregador según etapa |
| Hoja de mercado | `/matriz-operativa/mercado` | Administrador; vista imprimible y Excel |
| Productos | `/productos` | Administrador |
| Unidades y presentaciones | `/parametrizacion` | Administrador |
| Directorio de clientes | `/clientes` | Administrador |
| Recibos acumulativos | `/recibos` | Administrador |
| Catálogo y checkout | `/catalogo`, `/catalogo/checkout` | Público/cliente |
| Cuenta del cliente | `/registro`, `/mi-cuenta` | Cliente externo |
| Recuperación | `/mi-cuenta/recuperar` | Pública; depende de SMTP |
| Activación operativa | `/configuracion/activacion-operativa` | Soporte directo para Administrador; no aparece en menú |

Roles `ventas` y `finanzas` están en pausa y sólo reciben la pantalla inicial
sin espacio operativo. Las rutas de Ingresos, Inventario legacy, Compras,
Ventas, Proveedores, Finanzas, Reportes, Configuración general y confirmación
pública conservan código o pantallas históricas, pero no forman parte del menú
y el guard vigente puede denegar su acceso. No reactivarlas ampliando
`roleRouteAccess` sin una decisión explícita y pruebas de permisos.

## 8. Reglas de dominio que evitan los errores más graves

- Solicitado, preparado, externo y entregado son cuatro datos distintos.
- Preparar no cambia stock.
- Confirmar entrega descuenta una sola vez lo preparado en bodega.
- Externo no crea entradas ni salidas de inventario.
- El recibo toma entregado real.
- Un recibo no es factura fiscal y no registra pagos, caja ni CxC.
- Las confirmaciones usan versión esperada e idempotencia; un conflicto debe
  recargar, no sobrescribir silenciosamente.
- RLS y RPC deben conservarse incluso si la UI oculta una acción.
- Nunca editar una migración ya aplicada; agregar una nueva.
- No editar `stock_current` directamente.

## 9. Flujo de trabajo recomendado

```powershell
git switch main
git pull --ff-only
git switch -c codex/descripcion-corta
```

Después de cambiar:

1. revisar `git diff`;
2. ejecutar lint, build y pruebas del dominio;
3. verificar manualmente el flujo con datos sintéticos;
4. crear commit pequeño y descriptivo;
5. subir la rama y abrir Pull Request;
6. dejar que Vercel genere Preview;
7. probar Preview contra staging/local, nunca contra Production para escrituras;
8. fusionar sólo con las validaciones registradas.

## 10. Estado y límites conocidos

- `main` estaba limpio y sincronizado con `origin/main` al iniciar el traspaso.
- Production respondió HTTP 200.
- No había otro colaborador de GitHub registrado.
- La sesión Vercel local auditada no tenía acceso al proyecto enlazado.
- El flujo interno visible hoy está intencionalmente reducido a Administrador,
  Inventario y Entregador; Ventas y Finanzas están en pausa.
- La interfaz de administración de usuarios existe como componente/acciones,
  pero no está montada en una ruta habilitada.
- SMTP externo no debe darse por confirmado sin revisar el panel.
- Google Maps es opcional y el formulario manual debe seguir funcionando.
- El piloto puede operar con stock provisional; activar control estricto es una
  acción peligrosa y requiere el checklist de activación.
- Las reversiones de ventas/pagos originados en pedidos tienen límites; revisar
  `PENDIENTES_CONTROLADOS.md` antes de tocar anulaciones.
- Búsqueda global y costeo histórico siguen pendientes controlados.

## 11. Cuándo está realmente listo para empezar

- [ ] Su cuenta GitHub puede clonar, crear rama y abrir PR.
- [ ] Su cuenta Supabase abre el proyecto correcto con el rol acordado.
- [ ] Su cuenta Vercel ve `qb-insumos`, logs, deploys y variables.
- [ ] Tiene cuenta interna `administrador` separada.
- [ ] Si tocará mapas, tiene IAM del proyecto Google correcto.
- [ ] Si tocará correos, tiene acceso al SMTP y DNS necesarios.
- [ ] Instaló dependencias con `npm ci`.
- [ ] Preparó un `.env.local` propio para local o staging.
- [ ] `npm run lint` y `npm run build` pasan en su PC.
- [ ] Leyó y ejecutó el recorrido de `docs/FLUJO_PRUEBA_E2E.md`.

Sólo quedan fuera del repositorio las invitaciones y secretos. Esas acciones
requieren conocer el usuario/correo propio del nuevo desarrollador y deben
hacerse desde los paneles de los propietarios.
