# Limpieza segura de datos piloto/demo

No se ejecutó ninguna limpieza. El único artefacto preparado es la vista previa
READ ONLY `scripts/production-close/cleanup-preview.sql`.

## Clasificación obligatoria

**Conservar siempre:** catálogo maestro, productos, categorías, unidades,
presentaciones, conversiones confirmadas, configuración por producto,
fotografías, precios reales, usuarios y clientes reales y configuración
operativa.

**Candidatos solo con autorización por UUID:** pedidos QA y sus preparaciones,
entregas y movimientos; ingresos QA; recibos QA; cuentas cliente QA; usuarios
demo explícitos; movimientos de stock demostrablemente creados por fixtures.
Un nombre parecido no convierte un producto ni una operación en dato de prueba.

## Procedimiento futuro

1. Confirmar `tekfwbhvqtojpfqusosg`, Production, responsables y backup probado.
2. Acordar fecha/hora de corte, responsable, motivo y listas exactas de UUID;
   no usar patrones amplios.
3. Completar esos metadatos, marcar la confirmación explícita de alcance y
   ejecutar únicamente las consultas de vista previa.
4. Revisar conteos, dependencias, actividad posterior al corte y candidatos
   ambiguos. Si la fecha de corte está vacía o existe ambigüedad, detenerse.
5. Preparar un ejecutor separado dentro de una transacción, con bloqueo y una
   validación inicial que aborte si aparece catálogo maestro o actividad
   posterior al corte.
6. Eliminar primero hijos y luego padres, únicamente para los UUID autorizados.
   Los movimientos se incluyen solo si el vínculo QA/fixture es inequívoco.
7. Obtener una segunda revisión y autorización antes de `COMMIT`; ante cualquier
   diferencia usar `ROLLBACK`.
8. Emitir reporte de filas afectadas y repetir los conteos de verificación.

Quedan prohibidos `TRUNCATE`, filtros generales por nombre, cambios directos a
`stock_current`, limpieza de Auth por lote y cualquier borrado del catálogo.
