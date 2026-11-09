# Propuesta: base de costo por peso real

## Estado

La estructura y el cálculo están implementados localmente en la migración
`20261109110000_qb_explicit_receipt_cost_basis.sql`; no se aplicaron a
Production. Las reglas no se precargan a partir de precios ni de datos
históricos: Administración debe parametrizar cada presentación aprobada.
Los recibos existentes no se recalculan.

## Regla central

La base de costo y la base de precio de venta son configuraciones separadas.
La existencia de un peso medido nunca decide por sí sola cuál regla aplicar.

| Configuración aprobada | Cantidad comercial y venta | Costo de la línea |
| --- | --- | --- |
| Costo por unidad comercial | Conserva la cantidad, unidad y precio pactados | Cantidad comercial × costo guardado para esa misma unidad; normalizar solo con equivalencia física válida |
| Costo por peso real | Conserva la cantidad, unidad y precio de venta comercial | Peso real normalizado × costo por unidad de peso configurada |
| Costo sin referencia verificable | Conserva los valores originales | No calcula automáticamente; solicita revisión y bloquea la emisión si el costo requerido no puede determinarse |

## Configuración propuesta

Una regla explícita por producto y presentación de Pedido (la asociación de
unidad permitida identifica la presentación):

- `cost_basis`: `commercial_unit` o `actual_weight`.
- `cost_reference_unit_id`: unidad en que se expresa el costo.
- `cost_reference_factor_to_base`: snapshot del factor aprobado, validado contra
  la unidad y su dimensión al guardar.
- Snapshot de la tarifa configurada, unidad y factor para rastrear el valor
  usado en cada nueva línea de recibo.
- Fecha, responsable y versión para auditar cambios concurrentes.

Para `actual_weight`, la unidad de referencia debe pertenecer a la dimensión de
peso normalizada a KG y el sistema requiere una medición original válida o un
peso normalizado fiable. Para `commercial_unit`, la tarifa se aplica a la
cantidad y unidad comercial capturadas para esa presentación; no se infiere una
conversión física.
Una asociación `legacy_dump`, una coincidencia de nombre o un factor de otra
dimensión nunca califica como equivalencia.

El servidor comprueba la regla vigente, unidad, dimensión, factor, medición y
cantidad entregada al crear cada línea. Guarda el snapshot de la base
seleccionada, tarifa, unidad/factor, peso original y normalizado, cantidad
comercial y resultado del costo. Administración guarda reglas mediante una RPC
con autorización, auditoría y versión esperada. El cliente no decide ni puede
alterar el resultado enviando otro payload. Si el costo por peso no tiene
medición, o la referencia no es válida, el costo queda pendiente y se bloquea
la emisión del recibo hasta resolverlo.

La interfaz no copia automáticamente `products.purchase_price`, precios de
venta, costos FIFO ni costos de compras a las nuevas reglas. Esos campos
existentes continúan atendiendo sus flujos actuales; el costo configurado se
activa únicamente cuando Administración lo parametriza para una presentación.

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

## Decisiones comerciales todavía pendientes

1. Confirmar por producto/presentación qué costos se determinan por peso real y
   cuáles por unidad comercial.
2. Confirmar la unidad y equivalencia de cada tarifa de costo. En particular,
   aclarar la referencia `legacy_6` de Papa Holandesa.
3. Para Papa Holandesa, confirmar qué representa la tarifa de Bs 95 asociada a
   `legacy_6`, a qué presentación de pedido aplica y si existe una equivalencia
   física aprobada. El sistema no la trata como arroba ni asigna 11,25 KG.
4. Confirmar por presentación si el costo debe calcularse con la regla nueva o
   continuar con el flujo existente de costo manual/FIFO/compra. No hay
   parametrización automática para productos actuales.

## Validación y publicación

La migración tiene un contrato PostgreSQL local sobre una base aislada y pruebas
de cálculos decimales. No está aplicada en Production. Antes de publicarla aún
se necesita restaurar y probar el esquema completo vigente, instalar la
migración en QA conectado a la aplicación y completar un recorrido autenticado
de creación/cálculo/emisión de recibos.
