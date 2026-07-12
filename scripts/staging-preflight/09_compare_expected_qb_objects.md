# Comparacion futura de Staging

No ejecutar ninguna migracion durante esta inspeccion.

1. Obtener autorizacion humana exclusiva para acceso de solo lectura.
2. Confirmar el host y project ref de Staging por un canal independiente.
3. Ejecutar los scripts 01 a 08 uno por uno y guardar su salida con fecha.
4. Comparar columnas, funciones, RLS, grants, indices y conteos con `QB_INSUMOS_STAGING_EXPECTED_SCHEMA.md`.
5. Clasificar cada diferencia como:
   - objeto esperado presente;
   - migracion canonica pendiente;
   - baseline equivalente con otro nombre;
   - objeto legacy tolerado y suspendido;
   - incompatibilidad que exige migracion especifica.
6. Detenerse si una salida no se entiende, falta el backup aprobado o aparece Produccion.
7. No aplicar el baseline sintetico local sobre una base existente.
8. No ejecutar SQL distinto de los scripts de inventario aprobados.
9. Emitir un reporte de diferencias antes de solicitar otra autorizacion.

