# Mensaje de traspaso listo para enviar

Puedes copiar y enviar desde “Hola” hasta el final.

---

Hola. Ya puedes continuar el desarrollo de QB Insumos desde tu propia cuenta de
Codex y tu PC. La cuenta de Codex es independiente de GitHub, Supabase y Vercel:
usa tu Codex para trabajar, y para la infraestructura inicia sesión con las
cuentas autorizadas de Pachax que ya tienes.

## Proyecto correcto

- GitHub: `https://github.com/pachaxbo-commits/insumos-pro`
- Rama principal: `main`
- Production: `https://qb-insumos.vercel.app`
- Vercel: proyecto `qb-insumos`
- Supabase correcto: project ref `tekfwbhvqtojpfqusosg`

En Supabase no te guíes sólo por el nombre visible. En documentación antigua el
proyecto correcto aparece como `qb-insumos-staging-v2`. Abre el proyecto y
confirma en **Project Settings → General → Reference ID** que sea exactamente:

`tekfwbhvqtojpfqusosg`

No uses ni modifiques estos proyectos históricos:

- `wfhvuzigmkgojdoofjib`
- `epxmrfwtssbcqsytuwhf`

No ejecutes SQL, migraciones, seeds ni pruebas para intentar descubrir cuál es
el correcto. Tampoco uses `SUPABASE_SCHEMA.sql`. El único historial SQL válido
está en `supabase/migrations/`.

## Preparación de tu PC

Instala Git, Node.js 24, npm y Codex. Docker Desktop sólo es necesario si vas a
usar Supabase local.

```powershell
git clone https://github.com/pachaxbo-commits/insumos-pro.git
Set-Location insumos-pro
npm ci
Copy-Item .env.example .env.local
```

No copies un `.env.local` de otra computadora. Obtén las variables desde el
entorno local/staging autorizado o desde los paneles correspondientes. Nunca
pegues service-role keys, tokens, contraseñas o cookies en Codex, GitHub o un
chat.

Abre la carpeta raíz en Codex y envíale este primer mensaje:

> Lee AGENTS.md, docs/ONBOARDING_DESARROLLO.md,
> docs/FLUJO_PRUEBA_E2E.md y docs/QB_GUIA_ENTREGA_FINAL.md. Revisa git status,
> confirma el entorno y explícame el flujo afectado antes de cambiar código.

## Qué hace el sistema actualmente

El flujo interno visible del piloto es:

1. Administrador configura productos, unidades, presentaciones, precios y
   clientes.
2. Administrador crea el pedido en `/pedidos`.
3. La hoja de mercado consolida lo solicitado por producto y cliente.
4. Inventario registra preparación en `/matriz-operativa`.
5. Entregador registra cantidad real y confirma entrega en la misma matriz.
6. La entrega descuenta una sola vez lo preparado en bodega.
7. Administrador crea el recibo acumulativo usando lo realmente entregado.

Conceptos que nunca debes mezclar:

- pedido no es venta;
- solicitado no es preparado;
- preparado no es entregado;
- producto externo no mueve inventario;
- recibo no es pago ni factura fiscal;
- ocultar un botón no reemplaza permisos de servidor, RLS o RPC.

El catálogo, checkout, registro, cuenta y recuperación del cliente son públicos
o externos. Los módulos legacy de Compras, Ventas, Finanzas, Proveedores e
Inventario antiguo conservan código histórico, pero están pausados. Ventas y
Finanzas no tienen espacio operativo en esta transición. No amplíes accesos en
`src/lib/auth/roles.ts` sin una solicitud explícita y pruebas de permisos.

## Cómo probar sin riesgo

Usa Supabase local o un staging expresamente autorizado con datos sintéticos.
No ejecutes pruebas que escriben sobre Production. Sigue, en orden:

`docs/FLUJO_PRUEBA_E2E.md`

Antes de entregar cualquier cambio:

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

Trabaja siempre en una rama:

```powershell
git switch main
git pull --ff-only
git switch -c codex/descripcion-corta
```

Haz cambios pequeños, revisa `git diff`, ejecuta las pruebas del dominio y abre
un Pull Request. No empujes cambios incompletos directamente a `main` y no
reactives módulos pausados como efecto secundario.

## Archivos que debes consultar

- `AGENTS.md`: reglas obligatorias que Codex recibe automáticamente.
- `docs/ONBOARDING_DESARROLLO.md`: accesos, arquitectura y seguridad.
- `docs/FLUJO_PRUEBA_E2E.md`: recorrido de prueba completo.
- `docs/QB_GUIA_ENTREGA_FINAL.md`: operación detallada.
- `docs/QB_MATRIZ_OPERATIVA.md`: solicitado, preparado, externo y entregado.
- `PENDIENTES_CONTROLADOS.md`: límites y deuda conocida.

Si una guía histórica contradice al código actual, consulta primero:

- `src/lib/auth/roles.ts`
- `src/lib/qb-insumos/transition-policy.ts`
- `src/components/layout/app-sidebar.tsx`

Detente antes de cualquier acción destructiva, cambio de permisos, migración
productiva, activación de control estricto o manejo de secretos.

---
