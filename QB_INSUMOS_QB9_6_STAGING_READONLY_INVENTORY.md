# QB-9.6 - Inventario de Staging en solo lectura

Fecha de cierre documental: 2026-07-12

## Alcance autorizado

Se inspecciono exclusivamente el proyecto confirmado como Staging:

- project ref: `wfhvuzigmkgojdoofjib`;
- host relacionado: `wfhvuzigmkgojdoofjib.supabase.co`;
- responsable de ejecucion: operacion autorizada por el usuario;
- metodo: conexion PostgreSQL temporal de solo lectura;
- protecciones: transaccion `READ ONLY`, `statement_timeout`, `lock_timeout` y `ROLLBACK`.

La cuenta PostgreSQL temporal fue eliminada y sus credenciales fueron limpiadas al terminar.

No se incluyen contrasenas, variables PG, usuarios de conexion, tokens ni cadenas de conexion.

## Garantias de ejecucion

- No se ejecutaron migraciones.
- No se crearon, alteraron o eliminaron objetos.
- No se insertaron datos ficticios.
- No se probaron RPCs operativas.
- No se modifico Auth.
- No se ejecuto la aplicacion contra Staging.
- No hubo deploy.
- Todos los scripts autorizados se ejecutaron en modo read-only y finalizaron con rollback.

## Resultado por script

| Script | Estado | Resultado |
|---|---|---|
| 01 - esquema | Completo | Inventario visible de columnas y tablas. Confirmo baseline legacy parcial y ausencia de objetos QB. |
| 02 - migraciones | Incompleto/no aplicable | El esquema `supabase_migrations` no existe; no pudo obtenerse historial canonico. |
| 03 - funciones | Completo para objetos visibles | No aparecen las RPC criticas QB. Se observaron familias de funciones legacy. |
| 04 - RLS | Completo para objetos visibles | Permitio observar RLS/politicas del baseline legacy; no existe RLS QB porque las tablas QB estan ausentes. |
| 05 - grants | Parcial | El usuario temporal no permitio reconstruir con confianza los grants completos de `anon`, `authenticated` y `service_role`. |
| 06 - indices y constraints | Completo para objetos visibles | Inventario legacy disponible; no existen constraints o indices de tablas QB. |
| 07 - conteos | Incompleto | La consulta conjunta fallo al referenciar las tablas QB ausentes. No se obtuvieron conteos completos. |
| 08 - legacy | Completo | Confirmo objetos de ventas, compras, pagos, caja, CxC, CxP y otros flujos legacy. |

## Baseline encontrado

Se confirmaron al menos:

- `profiles`;
- `products`;
- `inventory_movements`;
- objetos de categorias/configuracion asociados al baseline legacy, cuyo traslado requiere inventario autorizado;
- tablas y funciones de ventas, compras, pagos, caja, cuentas por cobrar y cuentas por pagar.

`customer_accounts` esta ausente.

No debe inferirse que las tablas no enumeradas aqui esten vacias o sean descartables.

## Objetos QB ausentes

No aparece ninguna de las 21 tablas esperadas:

### QB-2/QB-3

- `qb_unit_dimensions`
- `qb_units`
- `qb_product_unit_settings`
- `qb_product_presentations`
- `qb_product_allowed_units`
- `qb_product_classification_outputs`
- `qb_conversion_snapshots`

### QB-4

- `qb_merchandise_receipts`
- `qb_merchandise_receipt_lines`
- `qb_merchandise_receipt_classification_results`
- `qb_merchandise_receipt_movements`

### QB-5

- `qb_customer_locations`
- `qb_orders`
- `qb_order_items`

### QB-6

- `qb_order_preparations`
- `qb_order_preparation_items`
- `qb_order_delivery_movements`

### QB-7

- `qb_receipts`
- `qb_receipt_orders`
- `qb_receipt_lines`
- `qb_receipt_events`

## Diferencias criticas

### products

- Pertenece a un baseline legacy parcial.
- Cantidades/stock observables usan precision `numeric(14,2)`.
- El modelo QB local validado requiere al menos tres decimales para cantidades fisicas.
- No existe la parametrizacion QB asociada.
- No puede asumirse que sus columnas, constraints, visibilidad o grants coincidan con Fase 24.

### profiles

- Existe como parte del baseline legacy.
- No existe historial de migraciones para probar su origen o version.
- La compatibilidad de roles, constraints, RLS y relacion con Auth requiere un inventario de preservacion independiente.
- No debe sobrescribirse con el baseline local sintetico.

### inventory_movements

- Usa precision `numeric(14,2)`.
- QB-4 y QB-6 requieren conversiones y movimientos con al menos tres decimales.
- No existen relaciones de trazabilidad hacia ingresos/entregas QB.
- Convertir movimientos historicos sin estrategia explicita puede alterar significado y redondeos.

### customer_accounts

- Ausente.
- No se puede habilitar cuenta cliente QB-5 sobre este esquema sin una migracion de compatibilidad o un proyecto nuevo.

## Funciones y RPCs

Faltan las funciones criticas QB, incluidas las familias de:

- catalogo y creacion de pedidos QB;
- confirmacion de ingresos;
- preparacion y entrega;
- recibos acumulativos;
- conversiones/snapshots QB.

El inventario encontro funciones legacy asociadas a ventas, compras, pedidos antiguos, pagos, caja, CxC y CxP. No se invocaron. Sus firmas exactas deben conservarse como evidencia del inventario original antes de cualquier traslado o retiro.

## Estado observable de RLS

- El script 04 permitio observar politicas sobre objetos existentes.
- No existe cobertura RLS QB porque no existen tablas QB.
- La ausencia de historial impide asegurar que las politicas legacy correspondan a una version canonica conocida.
- No se modifico ni deshabilito RLS.

## Limitaciones de grants

El usuario temporal fue suficiente para inventario de metadatos, pero no para afirmar la matriz completa efectiva de:

- `anon`;
- `authenticated`;
- `service_role`;
- propietarios y privilegios heredados no visibles.

No debe aprobarse una migracion basandose en la salida parcial del script 05.

## Limitaciones de conteos

El script 07 agrupa tablas base y QB en una sola consulta. Al faltar tablas QB, PostgreSQL rechazo la consulta antes de devolver el conjunto completo.

Por tanto:

- no hay conteos completos certificados;
- ninguna tabla puede asumirse vacia;
- no puede concluirse que Staging sea descartable;
- los conteos futuros necesitan un script tolerante a objetos ausentes y otra autorizacion de solo lectura.

## Objetos legacy

Se confirmo presencia de objetos relacionados con:

- ventas;
- compras;
- pagos;
- caja;
- cuentas por cobrar;
- cuentas por pagar;
- pedidos/catalogo legacy.

Estos objetos pueden contener datos historicos que deben preservarse aunque no se reactiven en QB Insumos.

## Riesgos

1. No existe historial `supabase_migrations`.
2. El baseline real no coincide con el baseline local validado.
3. Aplicar el baseline sintetico podria duplicar, sobrescribir o invalidar objetos existentes.
4. Cambiar precision de 2 a 3 decimales requiere estrategia de datos.
5. Auth, perfiles, productos, stock e historicos pueden requerir traslado.
6. Grants y conteos siguen parcialmente desconocidos.
7. Objetos legacy pueden tener dependencias no inventariadas.
8. No existe backup autorizado ni restauracion verificada.

## Conclusion

El proyecto inspeccionado se clasifica como:

**STAGING LEGACY EXISTENTE, PARCIAL E INCOMPATIBLE CON EL BASELINE CANONICO QB ACTUAL**.

No esta autorizado para migraciones. Esta prohibido aplicar sobre el cualquier baseline local sintetico o el orden canonico completo sin backup, diff de datos y una decision de transicion independiente.

