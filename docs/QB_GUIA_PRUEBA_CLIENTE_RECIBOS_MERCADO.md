# QB Insumos — prueba guiada de hoja de mercado y recibos

Esta prueba valida las funciones solicitadas para compras en el mercado y recibos sin cambiar el flujo de pedidos ya aprobado.

## Preparación antes de la reunión

- Usar una cuenta de administrador de prueba, nunca compartir la contraseña por chat.
- Elegir un cliente y entre 5 y 8 productos conocidos por el cliente.
- Revisar en **Productos** únicamente los productos elegidos para la prueba. En cada uno responder primero **¿En qué unidad se entrega y cobra?** con una unidad física como KG, LIBRA, CUARTILLA o UNIDAD. `BS` o `BOB` expresan dinero y no deben usarse como cantidad.
- Después registrar **¿Cuál es el precio base por esa unidad?**. Ejemplo: LIBRA + 25 significa Bs 25 por libra. No es obligatorio cargar todo el catálogo para comenzar la prueba.
- Mantener el control de stock en el modo acordado para el piloto.
- Avisar que el recibo es un documento no fiscal y que el estado de pago es un control manual.

## Prueba completa

### 1. Crear pedidos

1. Crear dos pedidos de prueba para el mismo cliente y la misma fecha.
2. Repetir al menos un producto en ambos pedidos.
3. Confirmar que crear el pedido no modifica el stock.

Resultado esperado: los dos pedidos quedan disponibles para la operación diaria y conservan sus cantidades y unidades.

### 2. Generar la hoja para comprar en el mercado

1. Abrir **Preparación y entregas** para la fecha elegida.
2. Abrir **Hoja para comprar en el mercado**.
3. Revisar productos en filas, clientes en columnas y totales.
4. Confirmar que el producto repetido se suma sin mezclar unidades incompatibles.
5. Descargar el Excel y abrirlo.
6. Confirmar que todos los compradores reciben la misma hoja.

Resultado esperado: la hoja muestra lo solicitado antes de preparar y entregar, y el Excel se puede imprimir.

### 3. Preparar y entregar

1. Registrar la preparación siguiendo el flujo ya aprobado.
2. Registrar una cantidad real entregada diferente de la solicitada en al menos un producto.
3. Confirmar la entrega una sola vez.

Resultado esperado: el recibo utiliza la cantidad real entregada, no la cantidad originalmente solicitada.

### 4. Crear el recibo acumulativo

1. Abrir **Recibos → Por crear**.
2. Elegir el cliente.
3. Seleccionar los dos pedidos y generar el borrador.
4. Abrir **Borradores**.

Resultado esperado: ambos pedidos quedan incluidos y no vuelven a aparecer como pendientes para otro recibo.

### 5. Completar el borrador

1. En **1. Precios de venta**, revisar cantidad real, precio y total.
2. Ingresar o corregir el precio de venta.
3. Si el precio debe quedar para futuros recibos, marcar la opción correspondiente.
4. Revisar los ajustes porcentuales visibles en la parte superior; si se usan, los porcentajes se suman y se aplican a todo el recibo.
5. Escribir, si corresponde, la nota para el cliente o la nota interna visibles debajo de los ajustes.
6. Guardar precios.
7. En **2. Costos y utilidad**, ingresar el costo total de compra.
8. Elegir arroba, cuartilla o libra únicamente cuando se quiera registrar la comparación manual.
9. Registrar el costo comparativo calculado con el peso real de bodega y guardar.

Resultado esperado: costo y utilidad se ven únicamente en administración y no modifican el precio de venta.

### 6. Revisar y emitir

1. Abrir **3. Revisar y emitir**.
2. Abrir la vista previa administrativa.
3. Revisar cliente, periodo, productos, cantidades y total.
4. Emitir el recibo.
5. Descargar la imagen destinada al cliente.
6. Abrir también la **Nota sin precios**.

Resultado esperado: el documento para el cliente no muestra costos, utilidad, precio base, factores ni códigos internos. La nota sin precios muestra productos y cantidades entregadas.

### 7. Control manual e historial

1. En **Emitidos**, marcar el recibo como enviado.
2. Cambiar el pago de pendiente a pagado y guardar.
3. Abrir **Historial por cliente** y seleccionar cliente y mes.

Resultado esperado: se ven pedidos, recibos, total, estado de envío y estado pendiente/pagado. No se crea ningún movimiento de caja.

## Preguntas de aceptación para el cliente

1. En el recibo final, ¿los productos repetidos deben aparecer en una sola fila acumulada o prefiere conservar una fila por pedido?
2. ¿La hoja de mercado necesita espacio adicional para observaciones escritas al imprimir?
3. ¿La nota sin precios debe llamarse “Nota de entrega”, “Nota de recepción” o conservar el nombre actual?
4. ¿El costo comparativo por arroba, cuartilla o libra está presentado con las etiquetas que usa diariamente?
5. ¿La imagen del recibo para WhatsApp tiene el tamaño y la información esperados?

## Qué no probar todavía con datos reales

- Activación del control estricto de stock.
- Inventario de apertura.
- Limpieza o eliminación de datos piloto.
- Envío de correos o recuperación de contraseña si el correo de producción aún no fue validado.

Estas operaciones requieren una prueba y autorización separadas.
