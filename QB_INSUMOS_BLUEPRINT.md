# QB Insumos - Blueprint funcional

## Alcance oficial

QB Insumos reemplaza el enfoque comercial/financiero de Insumos Pro por un flujo operativo simple:

1. Cliente inicia sesion y completa nombre, telefono y una o mas ubicaciones.
2. Cliente navega catalogo sin precios.
3. Cliente elige productos, unidad de medida y cantidad.
4. Cliente puede ver productos frecuentes y repetir el ultimo pedido, editando cantidades antes de enviar.
5. El pedido se envia directamente a preparacion.
6. Preparacion registra por linea cantidad solicitada, cantidad realmente entregada, unidad, estado y observacion opcional.
7. Al entregar fisicamente, el stock baja solo por cantidad real entregada.
8. El pedido queda como entregado pendiente de recibo.
9. Administracion selecciona varios pedidos entregados de un mismo cliente.
10. Administracion genera un recibo acumulativo en borrador.
11. El recibo carga el precio base vigente de cada producto.
12. Administracion puede editar el precio base por linea.
13. Si cambia el precio, administracion decide si el cambio aplica solo al recibo o se guarda como nuevo precio base.
14. Los factores se aplican de manera compuesta.
15. Administracion emite un recibo digital no fiscal.
16. El cobro se gestiona fuera del sistema.

Fuera de alcance del flujo objetivo: efectivo, QR, pago mixto, caja, cuentas por cobrar, cuentas por pagar, POS, cotizaciones con token, confirmacion de precio por cliente y cualquier creacion automatica de venta/pago/caja antes de entrega y recibo.

## Flujos objetivo

### Cliente

- Accede a su cuenta.
- Completa o actualiza nombre, telefono y ubicaciones.
- Navega un catalogo sin precios.
- Crea un pedido con producto, unidad y cantidad.
- Repite el ultimo pedido o usa productos frecuentes, con cantidades editables.
- Envia el pedido sin ver precio, pago esperado ni confirmacion de precio.

### Preparacion

- Recibe pedidos enviados por cliente.
- Trabaja por linea.
- Registra cantidad solicitada, cantidad real entregable, unidad, estado y observacion opcional.
- Puede marcar una linea como completa, parcial o no disponible.
- No descuenta stock durante preparacion.
- Deja el pedido listo para entrega cuando todas las lineas tienen resolucion operativa.

### Entrega

- Confirma entrega fisica.
- Descuenta inventario solo por cantidades reales entregadas.
- Guarda trazabilidad para impedir doble descuento.
- Cambia el pedido a entregado pendiente de recibo.

### Recibo acumulativo

- Administracion filtra pedidos entregados pendientes de recibo de un mismo cliente.
- Genera un recibo acumulativo en borrador.
- El recibo toma precio base vigente por producto al momento de crear el borrador.
- Administracion puede editar precio base por linea.
- Si cambia precio, escoge entre cambio solo para este recibo o guardar como nuevo precio base del producto.
- El sistema calcula precio final con factores compuestos.
- Administracion emite recibo digital no fiscal.
- El recibo emitido no registra pago, caja, CxC ni CxP.

### Inventario y compras

- Existen unidades universales de peso: kg, libra, arroba y cuartilla.
- Conversiones oficiales iniciales: 1 arroba = 11.25 kg = 25 libras; 1 cuartilla = 2.7 kg = 6 libras.
- Existen presentaciones especificas por producto: carga, caja, saco, bandeja, bolsa u otras.
- Ejemplo obligatorio: 1 carga de papa = 10 arrobas = 112.5 kg.
- Una recepcion puede requerir clasificacion opcional.
- La clasificacion crea stock solo de productos resultado, sin duplicar stock del producto base.
- Debe permitir merma.
- Cantidades fisicas con minimo 3 decimales.
- Las conversiones usadas se guardan como snapshot.
- El costo no se mezcla con precios de venta ni factores del recibo.

## Estados recomendados

### Pedido

- `borrador_cliente`: el cliente aun edita.
- `enviado`: pedido enviado a preparacion.
- `en_preparacion`: preparacion inicio trabajo.
- `preparado_completo`: todas las lineas completas.
- `preparado_parcial`: una o mas lineas parciales o no disponibles.
- `entregado_pendiente_recibo`: entrega fisica confirmada y stock descontado.
- `incluido_en_recibo`: el pedido pertenece a un recibo en borrador o emitido.
- `cancelado`: pedido cancelado antes de entrega.

### Linea de pedido

- `pendiente`: sin preparacion.
- `completa`: cantidad real entregada igual a solicitada.
- `parcial`: cantidad real entregada mayor a cero y menor que solicitada.
- `no_disponible`: cantidad real entregada igual a cero.

### Recibo

- `borrador`: creado, editable, no emitido.
- `emitido`: digital no fiscal emitido.
- `anulado`: recibo invalidado.
- `reemplazado`: recibo anulado con nuevo recibo sucesor.

### Ingreso de mercaderia

- `borrador`: captura editable.
- `clasificacion_pendiente`: lineas que requieren clasificacion aun no estan listas.
- `listo_para_confirmar`: cantidades, merma y resultados validados.
- `confirmado`: stock registrado.
- `cancelado`: descartado antes de afectar inventario.

## Roles

- `cliente`: gestiona cuenta, ubicaciones y pedidos propios; no ve precios.
- `preparacion`: resuelve lineas, cantidades reales y observaciones; no emite recibos.
- `entrega`: confirma entrega fisica y dispara descuento de stock por cantidad real.
- `administracion`: gestiona clientes, recibos, precios base y parametros.
- `inventario`: gestiona productos, unidades, presentaciones, ingresos, clasificacion y stock.
- `auditoria`: consulta eventos y trazabilidad.
- `admin_sistema`: configuracion, permisos y parametros tecnicos.

Los roles actuales `ventas` y `finanzas` deben mapearse o retirarse gradualmente del diseno objetivo.

## Modulos activos objetivo

- Productos.
- Inventario.
- Ingresos de mercaderia.
- Clasificacion opcional.
- Clientes.
- Catalogo sin precios.
- Pedidos.
- Preparacion.
- Entregas.
- Recibos acumulativos.
- Parametrizacion.
- Auditoria.
- Configuracion.

## Reglas de precio

- El catalogo publico/cliente no muestra precios.
- El precio base vive en producto o en una tabla equivalente de precio base vigente.
- El recibo toma snapshot del precio base al crear borrador.
- El precio base editable por linea pertenece al recibo.
- Si se edita el precio base por linea, administracion elige:
  - aplicar solo en este recibo;
  - guardar como nuevo precio base del producto para usos futuros.
- El precio final se calcula con factores compuestos:

```text
precio final =
precio base
* (1 + distancia)
* (1 + exigencia)
* (1 + clima)
* (1 + extraordinario)
```

- Los factores se guardan por linea o recibo con snapshot suficiente para auditoria.
- El costo de compra no modifica el precio base, el precio final ni los factores del recibo.

## Reglas de inventario

- El stock baja una sola vez: al confirmar entrega fisica.
- El descuento usa `cantidad_real_entregada`, nunca `cantidad_solicitada`.
- Preparacion no descuenta stock.
- Recibo no descuenta stock.
- Los movimientos deben tener llave de idempotencia o referencia unica por pedido/linea/entrega.
- Las cantidades fisicas requieren minimo 3 decimales.
- Las unidades universales de peso y presentaciones especificas deben tener conversiones versionadas o snapshot.
- En clasificacion, el producto base recibido no debe quedar como stock vendible si se reparte en productos resultado.
- La merma debe registrarse de forma explicita y auditable.

## Reglas de recibos

- Un recibo agrupa uno o mas pedidos entregados de un mismo cliente.
- No puede mezclar clientes.
- No puede incluir pedidos no entregados.
- No puede incluir pedidos ya incluidos en otro recibo emitido activo.
- Debe permitir borrador antes de emision.
- Debe permitir anulacion y reemplazo, sin borrar el recibo original.
- Debe ser digital no fiscal.
- No registra cobros ni afecta caja, CxC o CxP.
- Debe conservar snapshots de cantidades reales, unidades, precio base aplicado, factores y precio final.
