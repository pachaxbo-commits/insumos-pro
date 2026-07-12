# NOTAS FASE 14C - Confirmacion segura de compra multiple

## Objetivo

Se implemento la confirmacion de `purchase_batches` en borrador.

El usuario sigue viendo una sola compra multiple, pero internamente el sistema crea compras hijas normales en `purchases` y `purchase_items`, agrupadas por:

- proveedor;
- metodo de pago.

Cada compra hija se confirma usando la funcion existente `confirm_purchase`, por lo que se conserva la logica actual de:

- entradas de inventario;
- caja para compras pagadas;
- cuentas por pagar para compras a credito;
- reportes;
- dashboard;
- auditoria;
- anulacion segura Fase 12D sobre cada compra hija.

## Reglas implementadas

- Solo `administrador` e `inventario` pueden confirmar.
- El batch debe estar en `borrador`.
- Debe tener al menos una linea.
- Todas las lineas deben tener producto, proveedor, cantidad, costo y metodo valido.
- Si una linea tiene `requires_classification = true`, se bloquea toda la confirmacion.
- El batch confirmado queda bloqueado para edicion.
- Se guarda `purchase_batch_id` en cada compra hija.
- Se guarda resumen en `purchase_batches.confirmation_summary`.
- Se guardan IDs en `purchase_batches.child_purchase_ids`.

## Atomicidad e idempotencia

La RPC `confirm_purchase_batch`:

- bloquea el batch con `for update`;
- valida todo antes de crear compras;
- crea compras hijas y llama `confirm_purchase` dentro de la misma transaccion;
- si cualquier paso falla, Postgres revierte todo;
- si hay doble clic, la segunda ejecucion espera el bloqueo y luego encuentra el batch `confirmada`, evitando duplicados.

## SQL

Aplicar en staging existente, despues de Fase 14B:

```sql
SUPABASE_MIGRATION_FASE_14C_CONFIRM_PURCHASE_BATCHES.sql
```

## No incluido

- Clasificacion de ingreso.
- Pago parcial real.
- Anulacion de batch completo.
- Cambios a `confirm_purchase`.
- Cambios a anulacion segura Fase 12D.
