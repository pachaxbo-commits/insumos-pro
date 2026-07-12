# NOTAS FASE 14D - Clasificacion segura de ingresos

## Objetivo

Se implemento la clasificacion de ingreso para lineas de compra multiple cuyo producto base tenga `requires_classification = true`.

Ejemplo operativo:

- se compra `Papa Holandesa para clasificar`;
- ese producto base no ingresa a stock vendible;
- se registran productos resultantes como `Papa Holandesa Grande` y `Papa Holandesa Pequena`;
- se registra merma/descarte si corresponde;
- al confirmar la compra multiple, solo los productos resultantes ingresan a inventario.

## Tablas nuevas

- `purchase_batch_line_classifications`: cabecera de clasificacion por linea de batch.
- `purchase_batch_classification_results`: productos resultantes, cantidades reales, costo asignado y costo unitario.

La clasificacion queda vinculada a:

- `purchase_batches`;
- `purchase_batch_lines`;
- producto base;
- productos resultantes;
- usuario que clasifico;
- auditoria.

## Reglas implementadas

- Solo `administrador` e `inventario` pueden clasificar.
- Solo se puede clasificar una linea en batch `borrador`.
- Solo se clasifican lineas cuyo producto base tenga `requires_classification = true`.
- El producto base no puede ser producto resultante.
- No se permiten productos resultantes repetidos.
- Las cantidades resultantes aceptan tres decimales.
- Si la unidad de salida coincide con la unidad base, `cantidad resultante + merma` debe coincidir con la cantidad original.
- Si la unidad cambia, el sistema no inventa conversiones: el usuario debe registrar peso/cantidad real de salida.
- La clasificacion reemplaza la clasificacion anterior de la linea, manteniendo solo una version vigente para confirmar.

## Distribucion de costos

El metodo por defecto es `valor_venta`.

Si el usuario no asigna costos manualmente:

- el sistema toma el precio de venta vigente de cada producto resultante;
- calcula `cantidad resultante * precio venta`;
- reparte el costo total original proporcionalmente al valor de venta;
- corrige diferencias de redondeo para que la suma asignada coincida con el subtotal original.

Si el usuario asigna costos manualmente:

- debe asignar costo a todos los productos resultantes;
- la suma debe coincidir con el subtotal original con tolerancia de Bs 0.01.

La merma no recibe stock vendible. Su costo queda absorbido por los productos resultantes, lo que refleja mejor el margen real.

## Confirmacion de compra multiple

La RPC `confirm_purchase_batch` fue actualizada:

- las lineas normales generan items normales;
- las lineas clasificadas generan items usando solo los productos resultantes;
- el producto base no crea `purchase_item` ni movimiento de inventario;
- se mantienen agrupaciones por proveedor y metodo de pago;
- cada compra hija reutiliza `confirm_purchase`.

## Atomicidad e idempotencia

- `save_purchase_batch_line_classification` bloquea la linea y el batch con `for update`.
- `confirm_purchase_batch` bloquea el batch con `for update`.
- Si una clasificacion falta o es invalida, no se crea ninguna compra hija.
- Si falla una compra hija, Postgres revierte toda la confirmacion.
- Si hay doble clic, la segunda ejecucion encuentra el batch confirmado y no duplica compras, stock, caja ni CxP.

## Auditoria

Se registra:

- `save_purchase_batch_line_classification`;
- `confirm_purchase_batch`;
- `confirm_purchase` de cada compra hija con metadata `origin = purchase_batch`.

## No incluido

- Pago parcial real en compra multiple.
- Anulacion de batch completo.
- Clasificacion despues de confirmar.
- Conversion automatica entre cargas, bolsas, kg u otras unidades.

## SQL

Aplicar en staging despues de Fase 14C:

```sql
SUPABASE_MIGRATION_FASE_14D_PURCHASE_CLASSIFICATION.sql
```

En un proyecto limpio, `SUPABASE_SCHEMA.sql` ya incluye el bloque 14D.
