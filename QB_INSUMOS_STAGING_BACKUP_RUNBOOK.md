# QB Insumos - Runbook de backup de Staging

Este procedimiento no debe ejecutarse sin autorizacion humana independiente para cada etapa.

## Responsables

Registrar antes de iniciar:

- fecha y hora UTC/local;
- responsable que solicita;
- responsable que ejecuta;
- responsable que valida;
- project ref y host confirmados como Staging;
- ticket o autorizacion;
- ubicacion cifrada de los artefactos.

## Backup obligatorio

Exigir un backup consistente que cubra:

1. Esquema PostgreSQL completo, incluidas funciones, triggers, RLS, grants, constraints e indices.
2. Datos de todos los esquemas de aplicacion.
3. Objetos y metadatos de `auth`, siguiendo el mecanismo soportado por Supabase.
4. Historial de `supabase_migrations.schema_migrations`.
5. Storage metadata y objetos si el proyecto los usa.
6. Variables y configuracion operativa documentadas sin incluir secretos en el reporte.

Preferir snapshot administrado por Supabase y una exportacion independiente validable.

## Validacion del backup

No continuar hasta comprobar:

- archivo o snapshot existe;
- tamano mayor que cero y razonable frente al volumen esperado;
- checksum registrado;
- fecha/hora corresponde a la ventana aprobada;
- esquema exportado contiene tablas QB y baseline;
- datos exportados contienen conteos coherentes;
- Auth fue incluido por un metodo soportado;
- ubicacion de almacenamiento tiene acceso restringido;
- existe una prueba de restauracion en entorno aislado o evidencia reciente equivalente.

Un listado de archivos no reemplaza una restauracion probada.

## Preflight previo a migracion

1. Confirmar nuevamente que el host es Staging.
2. Ejecutar solo los scripts aprobados de `scripts/staging-preflight`.
3. Guardar sus resultados sin secretos.
4. Comparar con `QB_INSUMOS_STAGING_EXPECTED_SCHEMA.md`.
5. Clasificar el baseline como escenario A, B o C.
6. Crear migraciones de compatibilidad solo si el diff las justifica.
7. Obtener una nueva autorizacion antes de aplicar.

## Escenarios de baseline desconocido

### Escenario A: baseline completo

Staging ya contiene tipos, columnas y constraints equivalentes.

Accion: aplicar unicamente migraciones aditivas realmente pendientes, en orden y despues del diff.

### Escenario B: baseline parcial o distinto

Existen campos faltantes, nombres distintos o endurecimientos divergentes.

Accion: crear migraciones de compatibilidad especificas y probarlas en una copia restaurada. Nunca aplicar el baseline sintetico local sobre datos existentes.

### Escenario C: entorno vacio o descartable

No hay datos que conservar y el entorno fue declarado descartable.

Accion: evaluar reconstruccion desde el orden canonico completo solo con autorizacion explicita. No inferir que el entorno es descartable por conteos bajos.

## Criterios de detencion

Detener inmediatamente ante:

- host o project ref no confirmado;
- cualquier indicio de Produccion;
- backup ausente, vacio o no restaurable;
- migracion aplicada no inventariada;
- diferencia de esquema no entendida;
- funcion endurecida que seria sobrescrita;
- RLS deshabilitado o grants mas amplios que lo esperado;
- datos historicos que una migracion pudiera reinterpretar;
- error SQL;
- mutacion inesperada durante una prueba;
- discrepancia entre conteos antes y despues.

## Rollback

La estrategia primaria es restaurar el snapshot/backup completo de la ventana.

1. Detener app y pruebas que escriban.
2. Registrar migracion y error exactos.
3. No improvisar SQL manual.
4. Restaurar en el mecanismo aprobado.
5. Verificar esquema, Auth, conteos y funciones.
6. Repetir smoke tests de lectura.
7. Emitir incidente y no reintentar sin una nueva revision.

Una migracion inversa solo es aceptable si fue preparada y probada previamente con el mismo esquema.

## Evidencia de cierre

Guardar:

- backups y checksums;
- resultados de preflight;
- diff aprobado;
- migraciones exactas;
- logs de aplicacion;
- conteos antes/despues;
- pruebas por rol;
- decision final y responsables.

