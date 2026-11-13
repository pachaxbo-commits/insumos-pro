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
