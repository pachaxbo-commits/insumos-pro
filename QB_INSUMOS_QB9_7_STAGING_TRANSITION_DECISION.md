# QB-9.7 - Decision de transicion de Staging

Fecha de preparacion: 2026-07-12

Estado: decision preparada localmente. No autoriza crear proyectos, backups, traslados, migraciones ni deploy.

## Punto de partida

QB-9.6 confirmo que el Staging actual:

- no tiene `supabase_migrations`;
- no contiene las 21 tablas QB;
- carece de `customer_accounts`;
- conserva un baseline legacy parcial;
- usa precision `numeric(14,2)` en productos/inventario;
- contiene objetos financieros y operativos legacy;
- no tiene conteos ni grants completos certificados;
- no puede recibir el baseline local sintetico de forma segura.

## Comparacion de opciones

### Opcion A - Nuevo proyecto Supabase Staging para QB Insumos

**Ventajas**

- Parte de una base vacia y controlada.
- Permite reproducir el orden canonico ya validado localmente.
- Separa por completo QB de objetos financieros legacy.
- Facilita RLS, grants y service role consistentes.
- Permite rollback eliminando el entorno nuevo sin tocar el legacy.

**Riesgos**

- Requiere decidir que datos se trasladan.
- Auth y Storage necesitan mecanismos soportados.
- Puede haber dependencias externas del project ref actual.
- La coexistencia temporal de dos Staging exige disciplina operativa.

**Impacto en datos:** ninguno sobre el proyecto legacy mientras se construye; el traslado futuro debe ser selectivo y auditado.

**Dificultad:** media.

**Reversibilidad:** alta antes del corte.

**Tiempo relativo:** medio.

**Backup:** backup completo del legacy antes de cualquier exportacion/traslado; snapshot del nuevo proyecto antes de pruebas destructivas.

**Confianza:** alta para la base QB; media para el traslado hasta completar inventario de datos.

**Autorizaciones:** crear proyecto; configurar secretos; backup; inventariar datos; exportar/importar cada dominio; probar; cambiar integraciones; deploy.

### Opcion B - Transformar Staging legacy con migraciones puente

**Ventajas**

- Conserva project ref e integraciones actuales.
- Puede evitar traslado de Auth/Storage.
- Mantiene los datos en el mismo proyecto.

**Riesgos**

- No existe historial de migraciones.
- Baseline y precision no coinciden.
- Requiere puentes especificos para cada tabla, funcion, grant y politica.
- Alto riesgo de colision con objetos legacy.
- Rollback complejo si una migracion modifica datos historicos.
- Puede dejar una base hibrida dificil de mantener.

**Impacto en datos:** alto; toca el mismo esquema que contiene historicos y stock.

**Dificultad:** muy alta.

**Reversibilidad:** baja o media, dependiente de backup/restauracion.

**Tiempo relativo:** alto.

**Backup:** snapshot restaurable obligatorio, exportaciones por dominio y prueba de restauracion.

**Confianza:** baja con la evidencia actual.

**Autorizaciones:** inventario ampliado; backup; copia aislada; diseño de puentes; pruebas de migracion; aplicacion; validacion y rollback.

### Opcion C - Borrar/recrear el esquema existente si fuera descartable

**Ventajas**

- Conserva project ref y configuracion externa.
- Permite construir el esquema QB desde cero.

**Riesgos**

- No se ha demostrado que sea descartable.
- Puede eliminar Auth, datos, Storage metadata, historicos e integraciones.
- Los conteos completos no estan disponibles.
- El borrado es de alto impacto y dificilmente reversible sin backup probado.

**Impacto en datos:** potencialmente total.

**Dificultad:** tecnica media, operativa y de gobernanza muy alta.

**Reversibilidad:** baja; depende completamente de restauracion.

**Tiempo relativo:** medio si fuera realmente descartable; alto si requiere rescate de datos.

**Backup:** snapshot y exportacion integral obligatorios, con restauracion probada.

**Confianza:** muy baja actualmente.

**Autorizaciones:** declaracion formal de descartabilidad; backup; borrado; recreacion; pruebas; reconfiguracion; deploy.

## Recomendacion inicial

**Preferir la Opcion A: crear un proyecto Staging nuevo y limpio para QB Insumos.**

Motivos:

- falta el historial de migraciones;
- no existe ningun objeto QB;
- el baseline QB ya fue validado desde una base vacia;
- el Staging actual contiene objetos legacy;
- el baseline sintetico no debe superponerse al esquema existente;
- la opcion A mantiene intacta la fuente legacy durante la construccion y comparacion.

Esta recomendacion no autoriza crear el proyecto ni trasladar datos.

## Matriz de preservacion y traslado

| Dato existente | Puede recrearse | Debe preservarse | Metodo de traslado futuro | Riesgo |
|---|---:|---:|---|---|
| Usuarios Auth | Parcialmente | Si, salvo decision contraria documentada | Mecanismo soportado de exportacion/migracion Auth; pendiente de inventario autorizado | Alto |
| profiles | Si, con mapeo | Si | Exportacion por UUID y validacion contra Auth/roles | Alto |
| Productos | Si | Si | Exportacion versionada, mapeo de columnas y normalizacion aprobada | Alto |
| Categorias | Si | Si | Exportacion/importacion preservando ids o tabla de equivalencias | Medio |
| Proveedores | Si | Si si tienen uso/historico | Pendiente de inventario autorizado y mapeo de dominio | Medio |
| Clientes legacy | Si | Si | Separar contacto historico de `customer_accounts`; mapeo aprobado | Alto |
| Stock | No debe recalcularse sin evidencia | Si | Snapshot de corte, conciliacion y carga inicial auditada | Muy alto |
| Movimientos de inventario | No como datos historicos equivalentes | Si | Archivo historico inmutable o importacion con precision/mapeo explicitos | Muy alto |
| Auditoria | No | Si segun retencion | Exportacion inmutable con checksums y acceso restringido | Alto |
| Ventas/compras/pagos legacy | No en el flujo QB | Si como historico | Mantener proyecto legacy read-only o archivo historico consultable | Muy alto |
| Configuraciones | Si | Si hasta validar reemplazo | Inventario, clasificacion y recreacion manual/mapeada | Medio |
| Archivos de Storage | Si | Pendiente de inventario autorizado | Exportacion de buckets/objetos y verificacion de hashes | Alto |

## Informacion faltante para decidir

- conteos por tabla y volumen;
- usuarios Auth e identidades a preservar;
- buckets y archivos Storage;
- integraciones que dependen del project ref;
- estructura exacta de categorias, proveedores y clientes;
- significado/precision de stock y movimientos;
- requisitos legales de auditoria y operaciones historicas;
- grants completos y propietarios;
- dependencias entre funciones legacy;
- existencia y calidad de backups restaurables.

Todo dato desconocido permanece **pendiente de inventario autorizado**.

## Autorizaciones independientes necesarias

1. Autorizar backup verificable del Staging legacy.
2. Autorizar inventario ampliado de datos/Auth/Storage e integraciones.
3. Autorizar o rechazar la creacion de un proyecto Staging QB nuevo.
4. Autorizar el plan de traslado por dominio.
5. Autorizar pruebas con datos trasladados.
6. Autorizar cambios de configuracion e integraciones.
7. Autorizar deploy por separado.

## Decision que no debe tomarse aun

No declarar descartable el Staging actual. No borrar esquemas. No aplicar migraciones puente. No crear el proyecto nuevo hasta recibir las autorizaciones correspondientes.

