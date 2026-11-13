# Correcciones operativas y revisión histórica

| Anotación | Resultado |
| --- | --- |
| Edición antes y durante Preparación | Ya correcta según las pruebas de edición, versiones y alcance por pedido. Los pedidos de fechas pasadas mantienen su restricción ordinaria. |
| Fecha operativa entre módulos y aviso de pendientes anteriores | Ya correctos según los contratos de navegación y pendientes. |
| Hoja de Provisión | Defecto reproducido: una equivalencia visual podía reemplazar la unidad comercial de Entrega. Corregido. Excel generado con clientes múltiples, unidades mixtas y peso original. |
| Impresión | Ya existe división de dos clientes por página en Hoja de Provisión, comprobada por contrato. Se generó PDF de recibo ficticio con 8 UNIDADES y 12 LB. |
| Check autocompletado y cantidad manual | Defecto reproducido con stock parcial. La RPC acepta una cantidad parcial y conserva el valor anterior. Se comprobó la restauración con rollback. Las ediciones manuales mantienen su comportamiento. |
| Checks, bordes y cantidades | Defecto reproducido. El check queda compacto y el pie de cada cliente explica qué falta. Los campos de cantidad incompleta muestran el borde de atención. |
| Tamaño de letras | Mejora visual pendiente. |
| Encabezados y columnas principales fijos | Ya existen en la tabla. |
| Confirmación individual al lado del cliente | Ya existe y su alcance se verifica por pedido. |
| Reportes y permisos de Supervisor | Los contratos preservan el alcance existente. La proyección operativa para planificar stock excluye tarifas. |
| Móvil, tableta y tabla horizontal | Defecto reproducido: el teléfono abría la tabla por defecto. Ahora abre Formulario y permite seleccionar Tabla. Verificado con fixtures a 1440, 768 y 390 px. |

Las capturas usan clientes y pedidos ficticios. Las pruebas visuales ejercitan el componente real mediante una ruta local temporal. Los contratos SQL con identidad y roles verifican permisos, persistencia e idempotencia. Queda pendiente una pasada autenticada de navegador por todos los módulos y la impresión completa de Hoja de Provisión.

## Correcciones administrativas

- **Equivalencia histórica.** La RPC administrativa review_qb_historical_order_equivalence permite previsualizar un pedido abierto con una equivalencia heredada. Requiere la unidad comercial exacta, habilitada físicamente para el producto, y una base que coincida con inventario. Enviar p_apply = false con el ID de línea, versión y unidad permitida devuelve el factor propuesto y versiones de Preparación y Entrega. Para aplicar, reenviar esos valores, p_apply = true y un motivo. Se registra el antes y después, se conserva la cantidad comercial y se exige reverificar origen y cantidades. Los pedidos confirmados, con movimientos o incluidos en recibos quedan excluidos.
- **Costo histórico.** El administrador abre «Revisar costo histórico» en el borrador, introduce un costo aprobado por KG, coteja los importes, confirma el precio de venta y guarda con motivo. El servidor vuelve a verificar unidad, tarifa, valores previos, estado y permiso. Los emitidos conservan sus importes.
- **Publicación.** Las cuatro migraciones deben aplicarse en orden antes del nuevo código. La rama de revisión tiene deshabilitado el despliegue Git automático.
# Cierre de revisión de la PR

- El panel de Entrega abre primero las líneas con origen pendiente. Los orígenes resueltos se abren individualmente desde «Cambió el origen de un producto».
- El administrador abre «Revisar equivalencia histórica» en la línea de Entrega. Previsualiza la cantidad y el factor, escribe el motivo y confirma. La RPC vuelve a comprobar el rol, el estado del pedido, el factor y las versiones, y guarda el antes y después en auditoría. Para inventario heredado ya expresado en KG, la aprobación corrige solo el pedido abierto. El producto, sus tarifas y sus movimientos se conservan.
- Se comprobó que align_qb_receipt_weight_pricing_unit está activo como trigger BEFORE INSERT. Para los borradores del flujo actual, usa la cantidad comercial entregada y su equivalencia guardada para el cobro. La RPC de Entrega calcula el peso para inventario en la unidad base del pedido cuando el producto controla peso. La medición original permanece separada.
- Ensayo incremental: copia local del esquema Production con 127 versiones, cuatro migraciones aplicadas y 131 versiones registradas. Comparación de conteos y huellas de filas sin diferencias en pedidos, líneas, preparaciones, entregas, recibos, productos, movimientos y usuarios.
- Contrato SQL con identidad de administrador y rollback: CUARTILLA, 8 unidades con 12 libras y 25 KG con 20 de almacén y 5 externos. Verifica importes comerciales y cantidades de inventario. También se ensayó la revisión del pedido histórico sobre la copia.
- Impresión integral en Edge: PDF de dos páginas horizontales con cuatro clientes ficticios, dos por página, y todos los productos y sus unidades. Véase hoja-provision-qa.pdf.
- Pendiente: recorrido autenticado de extremo a extremo en navegador sobre la misma base migrada. El servicio HTTP local existente usa otra base. El contrato SQL y la impresión no sustituyen esa comprobación.

## QA autenticado de 131 migraciones

- Aplicación local independiente en http://127.0.0.1:3381 con Auth y REST conectados a qb_pr19_final_qa. Se verificó el destino por la auditoría escrita desde la interfaz con un administrador ficticio. El historial de la aplicación sigue en 131 migraciones. Para iniciar GoTrue en la copia se completó el registro local de Auth con 27 versiones faltantes del mismo runtime, tras comparar las columnas de ambos esquemas Auth. Production quedó fuera de este entorno.
- Revisión histórica comprobada en el navegador. Se previsualizó, se indicó el motivo, se confirmó y se verificó que el registro de auditoría persistió en la copia.
- La matriz autenticada se comprobó a 1440, 768 y 390 px. Las entradas de cantidad y peso mantienen 16 px también en tableta. El tamaño de las casillas quedó intacto. Se comprobó el indicador al final de la tabla.
- Con datos ficticios creados por el contrato SQL, se abrió el recibo en el navegador con 8 UNIDAD y 12 LIBRA, se descargó el Excel interno y se generó un PDF. Las capturas del entorno restaurado se conservan localmente por contener datos de la copia.
- Falta ejecutar desde el navegador las escrituras de Pedido, Preparación y Entrega de un pedido nuevo, y comprobar el ajuste excepcional del origen durante esa misma secuencia. Las pruebas autenticadas de lectura y el contrato SQL cubren partes distintas.

## Resultado final de escritura en navegador

PASS en QA aislado de 131 versiones. El pedido ficticio QB-20261113-C12478 se creó con el formulario real. Preparación guardó 1 CUARTILLA, 8 UNIDAD y 20 de 25 KG. Los 5 KG restantes se clasificaron como compra externa. Los dos productos con existencias suficientes quedaron asignados a almacén. El pie mostró 3 productos y 3 checks con el indicador de cantidad parcial.

El navegador reprodujo y permitió corregir un fallo: salir de un campo decimal sin editarlo disparaba un cambio y desmarcaba la preparación. Se repitió Preparación sobre el mismo pedido y persistieron las tres marcas.

Entrega recuperó el plan. Se abrió el ajuste excepcional de la línea parcial y se guardaron 19 KG de almacén y 6 KG externos. La confirmación generó una sola confirmación y tres movimientos distintos, de 2,7 KG, 8 unidades y 19 KG de almacén. Se verificó Resumen y se creó el recibo con los controles de la aplicación.

El recibo conservó 1 CUARTILLA, 8 UNIDAD, 12 LIBRA y 25 KG. Los costos de QA (8,10; 24; 75 Bs) quedaron separados de las ventas (27; 80; 250 Bs). Se generó PDF, se descargó y leyó el Excel interno y se recargó el recibo para confirmar persistencia. SQL se usó para cotejar los resultados del pedido, no para ejecutar el flujo.
