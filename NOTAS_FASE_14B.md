# NOTAS FASE 14B - Compra multiple en borrador

## Objetivo

Se preparo la estructura y experiencia de captura para compras multiples sin afectar inventario, caja, cuentas por pagar, reportes ni dashboard.

La compra multiple funciona como una planilla de borrador:

- una entidad padre `purchase_batches`;
- lineas editables `purchase_batch_lines`;
- proveedor obligatorio por linea;
- metodo de pago por linea;
- subtotal calculado automaticamente en base de datos;
- totales por metodo y proveedor en UI.

## Implementado

- Ruta `/compras/multiple`.
- Acceso desde `/compras` mediante boton `Compra multiple`.
- Tabla responsive para PC/tablet.
- Cards editables para movil.
- Crear borrador.
- Editar fecha/notas del borrador.
- Agregar lineas.
- Editar lineas.
- Eliminar lineas.
- Reabrir borradores existentes.
- Totales:
  - total general;
  - efectivo;
  - QR/transferencia;
  - credito;
  - agrupado por proveedor.
- Campo `products.requires_classification` para marcar productos que necesitaran clasificacion futura.
- Advertencia visual cuando una linea requiere clasificacion.

## Seguridad

- `administrador` e `inventario` pueden crear/editar borradores.
- `finanzas` conserva lectura por tener acceso actual a compras.
- RLS permite lectura a `administrador`, `inventario` y `finanzas`.
- RLS permite insertar/editar/eliminar lineas solo a `administrador` e `inventario` y solo cuando el batch esta en `borrador`.
- Server Actions vuelven a validar rol y estado de borrador.
- No se usa `service_role` en cliente.

## SQL

Para staging existente, aplicar:

```sql
SUPABASE_MIGRATION_FASE_14B_PURCHASE_BATCHES.sql
```

Para proyecto limpio, `SUPABASE_SCHEMA.sql` ya incluye el bloque de Fase 14B.

## Importante

Esta fase no confirma compras multiples. Por tanto:

- no crea compras hijas;
- no ingresa inventario;
- no crea pagos;
- no mueve caja;
- no crea cuentas por pagar;
- no afecta reportes ni dashboard;
- no modifica `confirm_purchase`;
- no modifica anulacion segura Fase 12D.

## Pendiente

- Fase 14C: confirmar batch y crear compras hijas agrupadas por proveedor + metodo de pago.
- Fase 14D: clasificacion de ingreso para productos como papa holandesa.
- Fase 14E: anulacion segura de batch y relacion con compras hijas.
