# Guía de activación operativa

> Complemento técnico. El orden operativo canónico está en
> [QB_GUIA_ENTREGA_FINAL.md](QB_GUIA_ENTREGA_FINAL.md).

La herramienta está disponible para administradores en **Configuración → Activación operativa**.

1. Descargue la plantilla actualizada del tipo requerido.
2. Conserve el archivo original entregado por el cliente.
3. Complete únicamente las columnas editables: `new_base_price`, los datos de conversión requeridos o `initial_quantity` y `cutoff_date`.
4. No cambie IDs, nombres, unidades, saldos ni otras columnas informativas.
5. Suba el CSV y revise todas las filas de la vista previa.
6. Corrija el archivo si aparecen IDs desconocidos, duplicados, ambigüedades o valores inválidos.
7. Cuando no existan errores, escriba `APLICAR` y confirme el lote.
8. Verifique el resultado en Productos o Ingresos.

## Reglas importantes

- Un precio vacío significa **sin cambio**. La retirada de precios se realiza individualmente desde Productos.
- Un precio positivo puede activar “Pedido por Bs” cuando el producto y su unidad cumplen QB-17.
- Los precios internos nunca se incluyen en el catálogo público y no cambian pedidos históricos.
- Las conversiones solo habilitan unidades o presentaciones existentes; no crean stock ni movimientos.
- El stock inicial nunca actualiza directamente el saldo. Genera y confirma un **Ingreso de apertura** con snapshots y movimientos normales.
- Un mismo archivo aplicado queda bloqueado por su hash SHA-256 y tipo de importación.
- Ningún dato se escribe durante la vista previa ni sin confirmación explícita.

Límites: CSV UTF-8, máximo 1 MB y 500 filas. No use fórmulas ni cambie los encabezados.
