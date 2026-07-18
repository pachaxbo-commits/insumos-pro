# Auditoría canónica del catálogo maestro para QB-17

## Fuente preservada

- Archivo maestro: `data/catalog/products_units.csv`
- Origen de incorporación: `temp/products_units.csv`
- Fecha de incorporación: 2026-07-17
- SHA-256: `3D65E8F7C0168D21029279BEEE73EA5D77141B1EE906BDE2C2B4A60BC153BF57`
- Contenido: 687 relaciones de catálogo y modalidades, 316 productos únicos y 10 categorías.
- Este archivo no representa existencias, precios ni stock inicial.

La actualización del maestro exige conservar el archivo fuente recibido, calcular su hash, normalizar únicamente para auditar y revisar explícitamente cualquier cambio de identidad. No se fusionan productos por similitud de nombre.

## Clasificación completa

| Grupo | Productos | Relaciones | BS | Otras físicas |
| --- | ---: | ---: | ---: | ---: |
| A | 166 | 354 | 0 | 354 |
| B | 31 | 102 | 31 | 71 |
| C | 1 | 1 | 1 | 0 |
| D | 118 | 230 | 27 | 203 |

- A: presentes con relaciones físicas y sin BS.
- B: presentes con relación física segura y modalidad BS adicional.
- C: únicamente BS, sin relación física soportada.
- D: ausentes porque sus presentaciones físicas requieren conversión/configuración no definida.
- E, F y G: cero casos demostrados con la comparación exacta categoría + nombre; no se usó coincidencia aproximada.

El detalle completo y la razón por producto están en `data/catalog/QB17_PRODUCT_CLASSIFICATION.csv`. Hay **119 productos ausentes**: 1 del grupo C y 118 del grupo D.

## Relaciones BS

Las 59 relaciones BS son 59 modalidades monetarias de 59 productos distintos:

- 31 pertenecen a productos ya publicados con relaciones físicas seguras (grupo B).
- 1 producto solo tiene BS y no posee relación física utilizable (grupo C).
- 27 pertenecen a productos ausentes con presentaciones físicas aún no configuradas (grupo D).

BS no se importa ni se modela como unidad física.

## Auditoría de precios en Staging autorizada

La comparación exacta de los 31 productos del grupo B contra `qb-insumos-staging-v2` encontró:

- 31 coincidencias exactas.
- 31 con unidad de precio configurada.
- 0 con precio base positivo.
- 0 actualmente elegibles para pedidos por importe.

Por tanto, QB-17 puede desplegar el contrato y la habilitación fuente sin inventar precios, pero la opción por importe permanecerá inactiva hasta que un administrador configure un precio base positivo real. Los productos C y D permanecen pendientes de definición física, aunque más adelante reciban precio.

## Regla de elegibilidad QB-17

Un producto solo puede aceptar importe en bolivianos cuando se cumplen simultáneamente:

1. La modalidad BS está respaldada por el catálogo maestro.
2. Existe una relación física de pedido para la unidad interna de precio.
3. El producto y su configuración están activos y visibles.
4. El precio base interno es positivo.

El catálogo público puede exponer únicamente el booleano de disponibilidad por importe; nunca el precio, la unidad interna de precio ni factores.
