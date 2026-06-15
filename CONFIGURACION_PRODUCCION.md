# CONFIGURACION_PRODUCCION

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
```

Si Supabase entrega una clave publishable nueva, tambien se puede usar:

```bash
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

No subir `.env.local` al repositorio.

## Supabase

- Proyecto correcto confirmado.
- SQL `SUPABASE_SCHEMA.sql` aplicado.
- RLS habilitado en tablas operativas.
- Usuario administrador real creado.
- Backups revisados segun plan contratado.
- Region del proyecto documentada.

## SQL aplicado

Registrar fecha y responsable:

| Fecha | Bloque SQL | Responsable | Observaciones |
| --- | --- | --- | --- |
| YYYY-MM-DD | SUPABASE_SCHEMA.sql completo | Nombre | Sin errores |

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

