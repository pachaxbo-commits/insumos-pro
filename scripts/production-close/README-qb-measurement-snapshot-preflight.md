# Preflight de la migración de snapshots de peso

Este preflight es una consulta de catálogo para revisar, sin cambios, la compatibilidad de Production con `20261107100000_qb_measurement_snapshot_and_unit_guards.sql`.

## Ejecución

1. Abre Supabase Dashboard y selecciona el proyecto cuya referencia sea exactamente `tekfwbhvqtojpfqusosg` (`qb-insumos-staging-v2`). Comprueba la referencia antes de abrir SQL Editor.
2. Abre **SQL Editor**, crea una consulta nueva y pega el contenido completo de [qb-measurement-snapshot-preflight.sql](./qb-measurement-snapshot-preflight.sql).
3. Ejecuta la consulta completa. Empieza y termina con `BEGIN READ ONLY` / `COMMIT`; si el Editor rechaza la transacción de solo lectura o cualquier consulta falla, detente y comparte el error. No retires el modo `READ ONLY` ni ejecutes partes modificadas.
4. Comparte las tablas de resultados, en especial la matriz final `result / check_name / expected / observed`. También comparte las definiciones que el script devuelve para las dos vistas y las RPC. No copies resultados de otras consultas ni incluyas secretos si apareciera alguno inesperado.

## Cómo interpretar la matriz

- `COMPATIBLE`: la estructura de catálogo coincide con el contrato comprobable previo a la migración.
- `INCOMPATIBLE`: se informa el objeto y la diferencia observada; no aplicar la migración.
- `NO VERIFICABLE`: el objeto ya parece parcialmente aplicado, falta metadato, o el catálogo por sí solo no permite afirmar seguridad. Se necesita revisar el resultado antes de decidir.

La matriz requiere las migraciones predecesoras registradas y que `20261107100000` todavía no figure aplicada. Verifica firmas, delegación de RPC, `SECURITY DEFINER`, `search_path`, permisos efectivos a nivel de tabla, vista, columna y función, orden y tipos de columnas de vistas, columnas base, dependencias directas, triggers y restricciones. La cadena de entrega contempla `save_qb_matrix_delivery_item_with_weight_v2 → save_qb_matrix_delivery_item_with_weight_v1 → save_qb_matrix_delivery_item`, y valida cada función y sus permisos, incluido `PUBLIC`. No lee filas de clientes, pedidos, compras, Recibos, movimientos ni productos.

Este archivo no aplica migraciones, no ejecuta RPC de negocio y no cambia datos ni configuración.
