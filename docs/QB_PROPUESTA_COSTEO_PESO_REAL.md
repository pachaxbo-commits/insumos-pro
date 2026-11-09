# Propuesta: base de costo por peso real

## Estado

Propuesta funcional para revisión. No cambia precios, costos, datos históricos ni
la configuración de productos. No debe implementarse hasta aprobar la base de
costo y las unidades de referencia de cada producto afectado.

## Regla central

La base de costo y la base de precio de venta son configuraciones separadas.
La existencia de un peso medido nunca decide por sí sola cuál regla aplicar.

| Configuración aprobada | Cantidad comercial y venta | Costo de la línea |
| --- | --- | --- |
| Costo por unidad comercial | Conserva la cantidad, unidad y precio pactados | Cantidad comercial × costo guardado para esa misma unidad; normalizar solo con equivalencia física válida |
| Costo por peso real | Conserva la cantidad, unidad y precio de venta comercial | Peso real normalizado × costo por unidad de peso configurada |
| Costo sin referencia verificable | Conserva los valores originales | No calcula automáticamente; solicita revisión y bloquea la emisión si el costo requerido no puede determinarse |

## Configuración propuesta

Una regla explícita por producto, con una sustitución opcional por presentación:

- `cost_basis`: `commercial_unit` o `actual_weight`.
- `cost_reference_unit_id`: unidad en que se expresa el costo.
- `cost_reference_factor_to_base`: snapshot del factor aprobado, validado contra
  la unidad y su dimensión al guardar.
- `cost_source` y referencia de compra/recepción para rastrear el valor usado.
- Fecha de vigencia y responsable de cada cambio.

Para `actual_weight`, la unidad de referencia debe pertenecer a la dimensión de
peso y el sistema requiere una medición original válida o un peso normalizado
fiable. Para `commercial_unit`, la unidad del costo debe coincidir con la unidad
comercial o existir una conversión producto-presentación explícita y vigente.
Una asociación `legacy_dump`, una coincidencia de nombre o un factor de otra
dimensión nunca califica como equivalencia.

El servidor debe comprobar la regla vigente, la unidad, dimensión, factor,
medición y cantidad entregada dentro de la operación que crea el borrador del
Recibo. Debe guardar en cada línea el snapshot de la base seleccionada, tarifa,
unidad/factor, peso original y normalizado, cantidad comercial y resultado del
costo. El cliente no calcula ni puede cambiar la regla enviando otro payload.

## Presentación en Recibos

- La venta conserva su unidad y precio comercial pactado. Un producto vendido
  por unidad no se cobra por peso por el hecho de tener peso medido.
- `PESO REAL` se presenta como dato separado, con la unidad ingresada; por
  ejemplo, `8 UNIDADES · 12 LB`.
- El costo por peso se usa únicamente cuando la regla del producto o de la
  presentación lo establece expresamente.
- Si falta el peso requerido o hay una referencia ambigua, se muestra el motivo
  y no se inventa un costo.
- Los Recibos emitidos son snapshots inmutables para este cálculo. Una regla
  futura no recalcula recibos emitidos; una corrección requiere un procedimiento
  de rectificación aprobado y auditado.
- El rol Supervisor solo recibe los campos unitarios autorizados por su política.
  No se agregan utilidades, márgenes ni resúmenes acumulados.

## Papa Holandesa y referencias heredadas

La referencia `legacy_6` no se interpreta automáticamente como arroba física.
No se asigna el factor de 11,25 KG sin confirmación comercial explícita de que
el costo citado corresponde a una arroba física con esa equivalencia. Hasta
entonces, la normalización de ese costo se mantiene bloqueada y el usuario debe
revisar la unidad de referencia.

## Aprobaciones necesarias antes de implementar el costeo

1. Confirmar por producto/presentación qué costos se determinan por peso real y
   cuáles por unidad comercial.
2. Confirmar la unidad y equivalencia de cada tarifa de costo. En particular,
   aclarar la referencia `legacy_6` de Papa Holandesa.
3. Confirmar quién puede editar estas reglas y qué roles pueden ver cada
   snapshot unitario.
4. Aprobar el tratamiento operativo cuando falte el dato requerido: impedir la
   emisión del Recibo hasta completar peso/referencia, sin cambiar la venta.

La migración y los cálculos deben quedar en un cambio separado, con contrato
PostgreSQL y pruebas de recibos, antes de habilitar esta regla en Production.
