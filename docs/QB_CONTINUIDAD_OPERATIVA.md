# QB Insumos — continuidad operativa y hoja de ruta

**Estado de referencia:** 24 de julio de 2026, actualizado con respuestas del cliente

**Sistema:** `https://qb-insumos.vercel.app`

**Base técnica revisada:** commit `f210f7df3722a5f0274c42aa242e0039ffa0af7c`
**Propósito:** mantener una fuente de verdad para próximas tareas y evitar reinterpretaciones del flujo acordado con el cliente.

## 1. Resumen ejecutivo

El cliente está dispuesto a migrar, pero su modelo mental y el de su personal es una hoja de cálculo. La prioridad no es añadir más módulos: es hacer que la operación diaria se reconozca como la tabla que ya usan, conservando las ventajas del sistema —usuarios separados, permisos, trazabilidad, cálculos y una sola fuente de datos—.

La arquitectura principal ya está adelantada: existen los roles Administrador, Inventario y Entregador; la matriz operativa continua; la separación interna entre solicitado, preparado, externo y entregado; cantidades reales; observaciones; auditoría y recibos. La decisión más reciente es priorizar la réplica visual de la hoja antigua con solo `CANT | CHECK | OBSERVACIÓN` por cliente. La brecha de migración está en adaptar la superficie actual a esas tres columnas, carga masiva de inventario/productos, cierre visual del recibo y configuración completa de unidades, presentaciones y precios.

**Recomendación:** usar una sola plataforma. La interfaz puede parecer una hoja de cálculo sin depender de Google Sheets. Mantener dos plataformas produciría duplicidad, conflictos de sincronización, problemas de permisos y una auditoría incompleta.

## 2. Fuentes y jerarquía de decisiones

En caso de contradicción, usar este orden:

1. Decisión explícita del cliente registrada con fecha y captura.
2. Criterio de aceptación escrito y aprobado para la fase.
3. Flujo observado en la hoja actual.
4. Notas de reunión interpretativas.
5. Preferencia técnica o estética del equipo.

Las capturas son evidencia del comportamiento familiar, no una especificación completa de reglas de negocio. Antes de cambiar columnas, cálculos o responsabilidades debe actualizarse el registro de decisiones de este documento.

## 3. Contexto operativo confirmado

### Administrador

- Es el cliente dueño de la operación.
- Crea o corrige pedidos, asigna el orden de clientes y supervisa el día.
- Debe poder saber quién cambió una cantidad, un check o una observación.
- Revisa diferencias, emite y comparte el recibo digital.
- Puede corregir o reabrir procesos con motivo, sin borrar el historial.

### Inventario

- Prepara únicamente lo disponible en bodega.
- Registra cantidades preparadas, faltantes, check y observaciones.
- Puede finalizar con preparación completa, parcial o en cero.
- Su trabajo genera una copia/snapshot que recibe el Entregador.
- No debe alterar la entrega real.

### Entregador

- Trabaja con su propia cuenta.
- Recibe lo preparado en bodega y puede completar faltantes con producto externo o fresco.
- Registra la cantidad exacta entregada, aunque sea mayor o menor que la solicitada.
- Marca el check final y deja una observación cuando existe diferencia.
- No debe poder modificar lo que Inventario registró ni esconder su autoría.

## 4. Flujo objetivo de extremo a extremo

1. **Catálogo e inventario.** El Administrador crea/configura productos, colores, unidades, presentaciones, conversiones y precios. Los ingresos de mercadería deben poder cargarse en una tabla masiva.
2. **Pedido.** Se elige cliente y ubicación. El histórico ayuda a repetir el producto y la unidad exactos, pero el nuevo pedido sigue siendo editable.
3. **Matriz diaria.** Una sola cuadrícula muestra categorías y productos en filas, clientes hacia la derecha y totales al extremo derecho.
4. **Preparación.** En la superficie tipo Excel, Inventario usa `CANT | CHECK | OBSERVACIÓN`; en esta etapa `CANT` representa lo preparado en bodega.
5. **Entrega.** Entregador parte del snapshot de bodega y trabaja en una réplica visual `CANT | CHECK | OBSERVACIÓN`; en esta etapa `CANT` representa la cantidad realmente entregada. La separación de solicitado, preparado, externo y entregado debe conservarse internamente para trazabilidad, aunque no se exponga como siete columnas.
6. **Validación.** El sistema compara solicitado, preparado, externo y entregado; muestra completo o con diferencia sin depender solo del color.
7. **Recibo.** El Administrador revisa cantidades reales, completa precios si corresponde, emite y comparte el comprobante digital.
8. **Historial y auditoría.** Pedidos, movimientos, recibos y cambios quedan consultables por fecha, cliente, producto y actor.

## 5. Contrato visual de la matriz

Este contrato debe preservarse hasta que el cliente apruebe por escrito una modificación:

- Una sola matriz continua, reconociblemente similar a Google Sheets.
- Todos los clientes simultáneamente hacia la derecha.
- Scroll horizontal táctil también a 390 px.
- Ningún selector móvil obligatorio ni renderizado de un solo cliente.
- `N°`, `DESCRIPCIÓN` y `UD` sticky.
- Cabeceras sticky durante el scroll vertical.
- Categorías como filas separadoras y numeración visible.
- Productos y clientes nunca convertidos en cards verticales.
- El cliente enfocado solo puede recibir auto-scroll y resaltado; no puede ocultar otros clientes.
- Totales al extremo derecho de la misma cuadrícula.
- Color aplicado a la fila completa del producto, incluidas sus celdas operativas.
- Por ahora, cada grupo de cliente debe mostrar solamente `CANT | CHECK | OBSERVACIÓN`, igual que la hoja antigua.
- No añadir columnas visibles de preparado, externo, entregado o peso real hasta una fase posterior expresamente aprobada.

## 6. Estado actual frente a las notas

### Consolidado

| Necesidad | Estado y evidencia |
| --- | --- |
| Roles separados | Implementados Administrador, Inventario y Entregador, con rutas y permisos distintos. |
| Matriz tipo hoja de cálculo | Implementada como tabla continua en escritorio y móvil, con todos los clientes, overflow horizontal, columnas y cabeceras sticky. |
| Preparación parcial o en cero | Implementada; Inventario puede registrar faltantes y finalizar tras revisar las líneas. |
| Entrega real mayor o menor | Implementada; la diferencia exige observación y no altera silenciosamente lo solicitado. |
| Producto externo/fresco | Implementado como cantidad externa separada del stock de bodega. |
| Autoría y conflictos | Implementadas auditoría transaccional, versiones, idempotencia y avisos de cambios remotos. |
| Orden de clientes | El Administrador puede ordenar clientes por fecha; se conserva en la operación diaria. |
| Histórico para repetir pedido | “Repetir último pedido” carga producto y unidad exactos y deja las líneas editables. |
| Recibo basado en entrega | Los recibos nuevos toman la cantidad realmente entregada. La exportación de cliente oculta el código interno y enumera productos. |
| Catálogo y colores del Excel | Importados 159 productos de la hoja de referencia: 81 coincidencias actualizadas y 78 productos nuevos, sin eliminar el catálogo previo. |
| Color editable al crear producto | Disponible en alta y edición; la matriz usa el color guardado del producto. |
| Réplica visual de tres columnas | Implementada con `CANT | CHECK | OBSERVACIÓN` por cliente en todas las etapas, sin eliminar solicitado, preparado, externo o entregado del modelo interno. |
| Incremento temporal de `0,5` | Aplicado a productos vendibles y unidades permitidas para pedido; los pedidos por importe en Bs mantienen precisión monetaria. |
| Reapertura operativa | Administrador, Inventario y Entregador pueden reabrir sin límite temporal, con motivo, auditoría y bloqueo cuando el recibo ya fue emitido. |
| Recibo externo mínimo | La vista del cliente quedó limitada a logo/marca, cliente, fecha de entrega, productos, cantidad, precio final y total. |

### Parcial o pendiente de aceptación humana

| Necesidad | Situación actual | Cierre requerido |
| --- | --- | --- |
| Borde más resaltado en “Nuevo pedido” | Existe contenedor con borde, pero la nota es visual y no tiene medida objetiva. | Comparar con captura y aprobar en escritorio/móvil. |
| Arrobas por carga | Existen presentaciones y conversiones, incluida “Carga”, pero el factor no puede ser fijo. | En cada ingreso por carga, pedir manualmente cuántas arrobas llegaron y calcular desde ese dato los pesos/porcentajes necesarios. |
| Numeración a la izquierda | Está en la matriz y en el recibo; no es visible como columna en la captura del formulario de nuevo pedido. | Confirmar si también se exige en ese formulario. |
| Sumas verde/rojo | Hay estados, diferencias, totales, texto e iconos. | Validar si el cliente exige colorear celdas/filas completas con una regla exacta. |
| Peso real | Existe una representación en la matriz operativa, pero la semántica final recién fue definida. | Conservar pedido original y registrar su equivalencia física real: p. ej. `5 tomates → 0,416 kg` o `Bs 12 de papa → 6 unidades → 1,102 kg`. No añadir una cuarta columna visible en esta primera réplica. |
| Compartir recibo digital | Existe flujo de exportación/imagen. | Probar en el dispositivo y canal real del Administrador. |
| Configuración del catálogo | 201 de 233 combinaciones producto/unidad quedaron configuradas de forma segura. | Resolver 32 combinaciones sin inventar factores para `BS`, `CARGA` y empaques entre dimensiones. |

### No implementado como experiencia final

| Necesidad | Brecha |
| --- | --- |
| Carga masiva de productos/stock tipo Excel | El catálogo se muestra en tabla, pero el alta y los movimientos siguen siendo formularios individuales. |
| Historiales horizontales | Pedidos, inventario y recibos todavía usan listados/tablas convencionales; no existe una matriz por fecha hacia la derecha para todos los históricos. |
| Recibos agrupados por fecha hacia la derecha | La gestión actual presenta recibos en secuencia/listado, no como hoja horizontal diaria. |
| Paridad visual firmada | La matriz está técnicamente alineada con el contrato, pero falta validación humana en escritorio y a 390 px. |
| Referencia del sistema anterior | No se ha inspeccionado el repositorio anterior; falta URL/acceso y definición del componente a estudiar. |
| Conversión variable de carga | La conversión actual se modela principalmente como presentación configurada; falta capturar arrobas reales por cada carga recibida. |

## 7. Decisiones aclaradas y reglas de interpretación

### Tres columnas heredadas

El cliente confirmó que, por ahora, quiere únicamente `CANT | CHECK | OBSERVACIÓN`, lo más idéntico posible a la hoja antigua. Esta decisión reemplaza temporalmente el contrato visual de cinco/siete columnas. La simplificación es de interfaz, no de modelo: solicitado, preparado, externo y entregado deben seguir diferenciados y auditados internamente.

- En Preparación, `CANT` es lo preparado por Inventario.
- En Entrega, `CANT` es lo realmente entregado.
- `CHECK` pertenece al actor y etapa correspondientes.
- `OBSERVACIÓN` explica faltantes, sustituciones, pérdidas o diferencias.
- El peso real se conserva como dato estructurado, pero no aparece como columna adicional en esta primera réplica.

### “Clonar” la tabla

El Entregador debe recibir un snapshot lógico de lo preparado, no una copia desconectada de datos. Una única base conserva la relación solicitado → preparado → externo → entregado y permite atribuir cada modificación.

### Peso real y pedido en otra unidad

El pedido conserva la forma expresada por el cliente y además registra su equivalencia física:

- `5 tomates` puede equivaler a `0,416 kg` reales.
- `Bs 12 de papa` puede equivaler a `6 unidades` y `1,102 kg` reales.

No se debe sobrescribir la cantidad original con el peso. Pedido, equivalencia en unidades y peso real son datos distintos.

### Reapertura

Por ahora, todos los usuarios operativos pueden reabrir una entrega durante tiempo ilimitado. Cada reapertura y cambio posterior debe conservar actor, fecha, valor anterior, valor nuevo y etapa; no se permite borrar el historial.

### Precio por cantidad o por importe

La regla general es bidireccional:

- Si el precio es `Bs 10/kg` y el cliente pide `Bs 5`, corresponde `0,5 kg`.
- Si se conoce cantidad y precio unitario, el importe es cantidad × precio.
- Si se conoce importe y precio unitario, la cantidad es importe ÷ precio.

La anotación “cebolla blanca cuesta 100/25 libras + 1,42” está en bolivianos, pero todavía debe validarse con el cliente antes de convertirla en fórmula productiva.

## 8. Hoja de ruta recomendada

### Paso 1 — Congelar el flujo de migración

**Acción inicial:** hacer validación humana de la matriz con una fecha real recreada.
- Probar Administrador, Inventario y Entregador con cuentas distintas.
- Validar escritorio y 390 px.
- Firmar columnas, colores, orden de clientes, estados y reglas de diferencia.
- Confirmar que Preparación y Entrega muestran solo `CANT | CHECK | OBSERVACIÓN`.

**Salida:** captura aprobada y checklist firmado; no añadir módulos antes de cerrar este paso.

### Paso 2 — Completar datos operativos

- Resolver las 32 combinaciones de unidad/presentación pendientes.
- Aplicar temporalmente incremento global de `0,5`.
- Capturar manualmente arrobas por cada carga recibida; no usar un factor fijo.
- Confirmar conversiones posteriores de arroba, libra y empaques.
- Cargar precios/fórmulas aprobados, incluida la regla de cebolla blanca.

**Salida:** catálogo utilizable sin decisiones improvisadas por el personal.

### Paso 3 — Carga masiva tipo Excel

- Crear una cuadrícula editable para múltiples ingresos/productos.
- Permitir pegar filas desde Excel/Sheets.
- Validar producto, unidad, cantidad, costo y conversión por celda.
- Mostrar errores sin perder las filas válidas.
- Guardar en una transacción o lote auditado.

**Salida:** alta diaria rápida y trazable.

### Paso 4 — Recibo y cierre diario

- Ajustar el recibo a la captura aprobada.
- Definir fecha de entrega como fecha principal visible.
- Conservar cantidad pedida, equivalencia en unidades y peso real como datos separados.
- Mostrar solo logo, cliente, fecha de entrega, productos, cantidad, precio final y total.
- Probar exportación/compartir desde el teléfono del Administrador.

**Salida:** comprobante digital aceptado por el cliente.

### Paso 5 — Histórico para repetir pedido

- Al seleccionar un cliente en “Nuevo pedido”, cargar su último pedido.
- Conservar producto, unidad y forma de pedido exactos.
- Permitir editar, agregar o quitar líneas antes de crear el pedido.
- Mantener la lógica existente de “Repetir último pedido”, que ya cubre la necesidad principal.

**Salida:** repetición editable del último pedido del cliente.

### Paso 6 — Referencia del sistema anterior

- Inspeccionar el repositorio anterior cuando se entregue acceso.
- Documentar comportamiento, atajos y reglas; no copiar secretos ni dependencias obsoletas.
- Reutilizar ideas de interacción, no duplicar la arquitectura ni crear una segunda fuente de verdad.

## 9. Checklist de aceptación del flujo prioritario

### Administrador

- [ ] Puede ordenar clientes para una fecha.
- [ ] Ve todos los clientes y totales en una sola matriz.
- [ ] Identifica quién cambió cada valor sensible.
- [ ] Reabre/corrige solo con motivo registrado.
- [ ] Emite y comparte un recibo sin exponer código o factores internos.

### Inventario

- [ ] Solo puede editar preparación, check y observación autorizados.
- [ ] Puede registrar cero o parcial sin bloquear el día.
- [ ] Ve faltante y estado con texto, no solo color.
- [ ] Al finalizar, Entregador recibe el snapshot correcto.

### Entregador

- [ ] Ingresa con cuenta propia.
- [ ] No puede alterar la preparación de bodega.
- [ ] Registra externo, cantidad exacta entregada, check y observación.
- [ ] Puede entregar más o menos con motivo obligatorio.
- [ ] La confirmación no duplica stock, entrega ni auditoría.
- [ ] Puede reabrir sin límite de tiempo y el sistema conserva toda la auditoría.

### Visual

- [ ] La tabla se reconoce como la hoja actual del cliente.
- [ ] Todos los clientes permanecen visibles hacia la derecha.
- [ ] La matriz funciona a 390 px con scroll táctil.
- [ ] `N°`, `DESCRIPCIÓN`, `UD` y cabeceras permanecen sticky.
- [ ] Categorías, numeración, colores y totales son legibles.
- [ ] Cada cliente muestra únicamente `CANT | CHECK | OBSERVACIÓN`.

## 10. Respuestas confirmadas el 24/07/2026

1. **Columnas:** mantener solo las tres originales —`CANT | CHECK | OBSERVACIÓN`—, lo más idénticas posible a la hoja antigua.
2. **Peso real:** equivalencia física del pedido, sin reemplazar la cantidad original; puede relacionar importe, unidades y kilogramos.
3. **Incrementos:** usar `0,5` para todos los productos por ahora.
4. **Carga:** las arrobas varían; deben ingresarse manualmente en cada recepción.
5. **Precio:** trabajar en bolivianos con conversión bidireccional cantidad/importe. La fórmula específica de cebolla blanca aún requiere validación.
6. **Histórico:** la necesidad inmediata es cargar el último pedido al elegir cliente y permitir repetirlo/editado.
7. **Reapertura:** todos los usuarios operativos, sin límite temporal y con auditoría.
8. **Recibo de cliente:** logo, nombre del cliente, fecha de entrega, productos, cantidad, precio final y total.

## 11. Registro de decisiones

| Fecha | Decisión | Estado |
| --- | --- | --- |
| 24/07/2026 | Mantener una sola plataforma y una sola base de datos; replicar la familiaridad de Sheets dentro del sistema. | Recomendación vigente |
| 24/07/2026 | Mantener todos los clientes en una matriz continua también en móvil; sin selector obligatorio. | Contrato vigente |
| 24/07/2026 | Mantener columnas visibles separadas para solicitado, preparado, externo y entregado mientras no exista un cambio explícito aprobado. | Reemplazada por la decisión de tres columnas del 24/07/2026 |
| 24/07/2026 | No inventar conversiones ni precios para completar el catálogo. | Regla de seguridad |
| 24/07/2026 | Reemplazar temporalmente las cinco/siete columnas visibles por `CANT | CHECK | OBSERVACIÓN`. | Decisión confirmada |
| 24/07/2026 | Mantener pedido original, equivalencia en unidades y peso real como datos diferentes. | Decisión confirmada |
| 24/07/2026 | Usar incremento global de `0,5` hasta que las pruebas indiquen excepciones. | Decisión temporal |
| 24/07/2026 | Capturar manualmente las arrobas reales de cada carga recibida. | Decisión confirmada |
| 24/07/2026 | Permitir reapertura a todos los usuarios operativos, sin límite temporal y con auditoría. | Decisión temporal |
| 24/07/2026 | Limitar el recibo del cliente a logo, cliente, fecha de entrega, productos, cantidad, precio final y total. | Decisión confirmada |
| Pendiente | Aprobar visualmente la matriz con datos reales en escritorio y 390 px. | Requiere cliente |
| Pendiente | Validar la fórmula específica de cebolla blanca. | Requiere cliente |
| Pendiente | Definir carga masiva tipo Excel. | Próxima fase |

## 12. Instrucción de continuidad para una nueva tarea

Al abrir una tarea nueva, indicar:

> Continúa QB Insumos desde `docs/QB_CONTINUIDAD_OPERATIVA.md`. La prioridad es replicar la hoja antigua con una matriz continua y solo `CANT | CHECK | OBSERVACIÓN` visibles por cliente, sin perder internamente solicitado/preparado/externo/entregado ni auditoría. Usa incremento temporal global de `0,5`; captura arrobas reales por carga; conserva pedido, equivalencia y peso real por separado; permite reapertura auditada a todos los usuarios operativos; y limita el recibo externo a logo, cliente, fecha de entrega, productos, cantidad, precio final y total. Revisa commit y producción antes de cambiar código y actualiza este documento con cada decisión nueva.

## Anexo — Lectura de las capturas de reunión

- **Nuevo pedido:** se pide un borde más visible, histórico del cliente con producto/unidad exactos y numeración a la izquierda.
- **Nuevo ingreso:** se pide una captura de cantidades más humana y soporte correcto de arrobas por carga.
- **Hoja diaria:** categorías y productos en filas, colores por producto, clientes en grupos horizontales y `CANT | CHECK | OBSERVACIÓN`.
- **Operación:** Inventario prepara bodega; Entregador completa faltantes, registra entrega exacta y explica diferencias.
- **Recibo:** fecha de entrega como dato principal, productos enumerados, código conservado solo internamente y cabeceras resaltadas.
- **Histórico:** navegación por fecha y hacia la derecha, evitando una secuencia extensa de cards.
