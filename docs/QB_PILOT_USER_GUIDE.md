# Guía operativa del piloto de QB Insumos

> Documento histórico del piloto. Para operación y entrega vigentes use
> [QB_GUIA_ENTREGA_FINAL.md](QB_GUIA_ENTREGA_FINAL.md), que es la guía canónica.

Esta guía resume el flujo disponible para el piloto. QB Insumos organiza productos, pedidos, preparación, entregas, inventario informativo y recibos acumulativos. No registra caja, cobros, pagos ni comprobantes fiscales.

## Administrador

1. En **Productos**, revise que el producto esté activo, visible en Catálogo y tenga sus unidades de pedido configuradas.
2. En **Clientes**, consulte las cuentas registradas y sus ubicaciones. Google Maps es opcional: la dirección siempre puede escribirse manualmente.
3. En **Pedidos**, cree solicitudes internas cuando sea necesario o revise las recibidas desde el Catálogo.
4. Inicie la preparación, registre la cantidad física realmente preparada y guarde el avance. Puede volver a abrir el pedido antes de confirmarlo.
5. Confirme la preparación y después la entrega. El inventario se descuenta solamente al confirmar la entrega, usando la cantidad real.
6. En **Recibos**, agrupe pedidos registrados entregados, complete los precios pendientes y emita el recibo acumulativo. La imagen para el cliente omite información interna.
7. En **Reportes**, revise existencias, ingresos, pedidos, entregas y recibos. En **Configuración**, consulte accesos y bitácora.

## Personal de Inventario

1. Use **Pedidos** para revisar la lista de preparación y registrar cantidades reales.
2. Guarde el avance antes de confirmar. Compruebe producto, unidad y cantidad física.
3. Confirme la entrega una sola vez. Un reintento no debe producir un segundo descuento.
4. Use **Ingresos** solo cuando el producto tenga una unidad de recepción y conversión configuradas.
5. Consulte las existencias desde **Reportes**. Los saldos pueden ser negativos durante el piloto porque el inventario es informativo y no bloquea pedidos.

## Reglas del piloto

- Crear o preparar un pedido no modifica stock; la entrega confirmada sí lo modifica.
- No se registran pagos, caja ni métodos de pago.
- Los pedidos de clientes registrados se consolidan en recibos acumulativos.
- Cuando un producto muestre **Por importe en Bs**, el cliente puede indicar el importe objetivo. QB Insumos calcula internamente una cantidad física estimada; si la opción no aparece, falta completar el precio o la configuración física del producto.
- En preparación siempre se registra la cantidad física real. El importe solicitado se conserva como referencia y no obliga al recibo a cobrar exactamente ese valor.
- No deben inventarse saldos iniciales. Cuando existan conversiones de recepción confiables, el stock se regulariza mediante Ingresos.
- Google Maps ayuda a ubicar una dirección, pero nunca sustituye el formulario manual.
- Si un precio aparece pendiente, el recibo no puede emitirse hasta completar un precio positivo.
- Los usuarios de prueba identificados como demo se conservan para soporte del piloto; no deben usarse como datos operativos reales.

## Funciones fuera de esta versión

La gestión de proveedores y las funciones de finanzas, caja, cobros y pagos no forman parte del piloto. Las solicitudes se gestionan desde **Pedidos**, la mercadería recibida desde **Ingresos** y los importes consolidados desde **Recibos**.
