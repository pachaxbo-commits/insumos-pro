# QB-9.2 - Actor creador de snapshots

## Defecto y causa raiz

`create_qb_catalog_order()` guardaba `auth.uid()` en `qb_conversion_snapshots.created_by`, campo nullable con FK a `public.profiles(id)`. Un cliente externo valido existe en `auth.users` y `customer_accounts`, pero no debe tener perfil interno; la FK bloqueaba su pedido.

## Auditoria de creadores

| Fase | Creador | Actor esperado |
| --- | --- | --- |
| QB-4 | Server Action de ingresos | administrador o inventario interno |
| QB-5 | `create_qb_catalog_order` | cliente externo autenticado |
| QB-6 | `save_qb_order_preparation` | administrador o inventario interno |
| QB-7 | No crea snapshots; conserva `conversion_snapshot_id` | actor historico del pedido/preparacion |

No hay lectores de `created_by` del snapshot ni interfaces TypeScript que dependan de su semantica. `created_by` ya era nullable y su FK era `profiles(id) ON DELETE SET NULL`.

## Modelo seleccionado

- `created_by`: perfil interno nullable, compatible con QB-4 y QB-6.
- `created_by_auth_user_id`: usuario autenticado interno o externo, FK a `auth.users(id) ON DELETE SET NULL`.
- Trigger `set_qb_conversion_snapshot_actor`: en cada insercion autenticada fuerza el actor Auth real; conserva `created_by` solo si ese UUID existe en `profiles`.
- Operaciones de sistema sin `auth.uid()` no reciben UUID ficticio.

La solucion es aditiva, no reescribe snapshots historicos, no cambia RLS y no crea perfiles falsos. `ON DELETE SET NULL` conserva el snapshot fisico si un actor se elimina.

## Redondeo

La formula comercial permanece compuesta. Para precio base 100 y factores 5/7/5/7:

```text
100 * 1.05 * 1.07 * 1.05 * 1.07 = 126.225225
```

`qb_compound_unit_price` redondea a escala 4: `126.2252`. La visualizacion a dos decimales es `126.23`. El total de linea multiplica la cantidad por el valor a escala 4 y redondea al final a escala 2.

## Validacion local

- `db reset`: OK, 11 migraciones.
- E2E funcional QB-2 a QB-7: OK.
- Ingreso QB-4 simple y clasificado: OK.
- Snapshot QB-4 interno: ambos campos contienen el administrador.
- Snapshot QB-5 externo: `created_by` NULL y `created_by_auth_user_id` contiene el cliente sin `profiles`.
- Snapshot QB-6 interno: ambos campos contienen el administrador.
- QB-7 conserva la referencia de conversion y no modifica snapshots.
- Eliminacion de actor Auth aislado: el UUID queda NULL y el snapshot fisico permanece.
- Lint, TypeScript y build: OK.

## Bloqueos posteriores

La auditoria ampliada encontro dos defectos anteriores e independientes: faltan grants SQL operativos para las tablas QB y QB-8 consulta tres nombres de columnas que no existen en el esquema canonico. Deben corregirse y volver a probarse localmente antes de preparar Staging.
