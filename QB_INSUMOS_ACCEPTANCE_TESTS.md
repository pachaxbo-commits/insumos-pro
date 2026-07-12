# QB Insumos - Casos de aceptacion funcional

## Unidades y conversiones

### AT-001 - Unidades universales obligatorias

Dado un sistema parametrizado para QB Insumos, cuando administracion consulta unidades universales, entonces existen kg, libra, arroba y cuartilla activas.

Criterios:

- 1 arroba equivale a 11.25 kg.
- 1 arroba equivale a 25 libras.
- 1 cuartilla equivale a 2.7 kg.
- 1 cuartilla equivale a 6 libras.
- Las conversiones usadas en transacciones quedan guardadas como snapshot.

### AT-002 - Presentacion especifica por producto

Dado un producto papa con presentacion carga, cuando se registra 1 carga, entonces el sistema convierte a 10 arrobas y 112.5 kg usando snapshot de conversion.

Criterios:

- La presentacion pertenece al producto.
- La conversion historica de la transaccion no cambia si despues se edita la presentacion.
- La cantidad fisica conserva minimo 3 decimales.

### AT-QB2-003 - Ruta privada de parametrizacion

Dado un usuario administrador autenticado, cuando abre `/parametrizacion`, entonces ve el modulo QB-2 de unidades universales, conversiones y presentaciones por producto.

Criterios:

- `/parametrizacion` existe como ruta privada real.
- El sidebar muestra Parametrizacion para roles autorizados.
- `/parametrizacion` contiene dimensiones, unidades universales, conversiones y presentaciones por producto.
- `/productos` conserva gestion basica de productos y un enlace claro hacia las reglas de unidades.

### AT-QB2-004 - Unidades base y factores oficiales

Dado un usuario autorizado en `/parametrizacion`, cuando consulta unidades universales de peso, entonces existen kg, lb, @ y cuartilla.

Criterios:

- `kg` es la unidad base de peso.
- `lb` representa libra con factor 0.453592 kg.
- `@` representa arroba con factor 11.25 kg.
- `cuartilla` representa cuartilla con factor 2.7 kg.
- Se rechazan factores menores o iguales a 0.

### AT-QB2-005 - Presentaciones especificas obligatorias de ejemplo

Dado productos configurados para QB Insumos, cuando administracion define presentaciones por producto, entonces el modelo soporta papa, tomate y vaina sin convertir sus envases en unidades universales.

Criterios:

- Papa permite presentacion `carga` con `1 carga = 10 arrobas = 112.5 kg`.
- Tomate permite presentacion `caja` con `1 caja = 18 kg`.
- Vaina permite presentacion `saco` con `1 saco = 25 kg`.
- Caja, saco y carga quedan como presentaciones por producto, no como unidades universales globales.

### AT-QB2-006 - Duplicados y consistencia

Dado un producto con una presentacion registrada, cuando se intenta registrar otra presentacion con el mismo nombre o simbolo para el mismo producto, entonces el sistema rechaza el duplicado.

Criterios:

- No se duplican unidades universales por dimension y codigo.
- No se duplican unidades universales por dimension y simbolo.
- No se duplican presentaciones por producto y nombre.
- No se duplican presentaciones por producto y simbolo.
- No se permiten cantidades, equivalencias o factores menores o iguales a 0.

### AT-QB2-007 - Permisos de parametrizacion

Dado un usuario sin permiso de administracion o inventario, cuando intenta acceder o mutar parametrizacion QB-2, entonces el sistema bloquea la operacion.

Criterios:

- Un usuario no autenticado es enviado a login.
- Un usuario no autorizado no ve `/parametrizacion` en el sidebar.
- Un usuario no autorizado no puede crear unidades.
- Un usuario no autorizado no puede editar unidades.
- Un usuario no autorizado no puede desactivar unidades o presentaciones.

### AT-QB2-008 - Aislamiento operativo antes de QB-4

Dado solo QB-2 parametrizado, cuando se navega la aplicacion antes de habilitar QB-4, entonces no se activan compras, pedidos, recibos, stock ni flujos operativos suspendidos.

Criterios:

- No aparecen formularios operativos de compras.
- No aparecen formularios operativos de pedidos.
- No aparecen formularios operativos de recibos.
- No aparecen formularios operativos de ventas, pagos, caja, CxC, CxP o fulfillment.
- No se ejecutan acciones que modifiquen `stock_current`.
- No se conecta parametrizacion con ingresos de mercaderia hasta QB-4.

### AT-QB3-001 - Configuracion de producto QB

Dado un producto existente, cuando administracion lo configura en `/productos`, entonces puede guardar unidad base de inventario, unidad base de precio, precio base QB, estado QB y notas internas.

Criterios:

- La configuracion vive en tablas QB y no modifica `products.stock_current`.
- El precio base QB no modifica ventas historicas ni `products.sale_price`.
- La unidad legacy `products.unit_id` se conserva.
- El producto puede quedar activo o inactivo para uso QB.

### AT-QB3-002 - Visibilidad futura en catalogo sin precios

Dado un producto QB configurado como visible en catalogo futuro, cuando se guarda la configuracion, entonces solo queda persistido el flag futuro.

Criterios:

- No se habilita `/catalogo`.
- No se muestran precios a clientes.
- No se crea carrito, checkout ni pedido.
- La configuracion queda disponible para QB-5.

### AT-QB3-003 - Unidades permitidas por contexto

Dado un producto QB, cuando se configuran unidades permitidas, entonces se aceptan contextos `pedido`, `recepcion`, `recibo` e `inventario`.

Criterios:

- Papa grande permite pedido en kg, arroba o cuartilla.
- Tomate permite pedido en kg o caja.
- Vaina permite pedido en kg o saco.
- Recepcion puede usar presentaciones como caja, saco o carga.
- Recibo puede usar la unidad base de precio.
- Inventario puede usar la unidad base de inventario.
- No se habilita ventas POS/manuales.

### AT-QB3-004 - Clasificacion futura de productos

Dado un producto `Papa para clasificar`, cuando administracion define salidas de clasificacion, entonces puede registrar `Papa grande`, `Papa mediana`, `Papa pequena` y `Merma`.

Criterios:

- Las salidas producto apuntan a productos existentes.
- La merma no apunta a producto resultado.
- El producto resultado no puede ser el mismo producto origen.
- Se puede guardar porcentaje esperado opcional entre 0 y 100.
- No se crea stock ni movimiento de inventario.

### AT-QB3-005 - Compatibilidad con productos existentes

Dado un producto legacy sin configuracion QB, cuando se abre Productos o Parametrizacion, entonces el producto sigue visible sin migrar datos historicos.

Criterios:

- No se modifica stock.
- No se modifica precio historico.
- No se modifica categoria legacy.
- No se modifica unidad legacy.
- La configuracion QB puede crearse de forma incremental.

### AT-QB3-006 - Permisos y aislamiento

Dado un usuario no autorizado, cuando intenta editar productos QB o unidades permitidas, entonces la operacion se bloquea.

Criterios:

- Usuario no autenticado redirige a login.
- Rol sin permiso no ve acciones de edicion.
- No se activan compras, pedidos, preparacion, entrega, recibos, ventas, pagos, caja, CxC, CxP ni fulfillment.

### AT-QB3-007 - Separacion entre Parametrizacion y Productos

Dado un usuario autorizado, cuando navega entre `/parametrizacion` y `/productos`, entonces cada ruta mantiene su responsabilidad visual y funcional.

Criterios:

- `/parametrizacion` muestra reglas generales de dimensiones, unidades universales, conversiones y presentaciones.
- `/parametrizacion` no concentra precio base QB, visibilidad futura de catalogo, unidades permitidas por contexto ni salidas de clasificacion futura.
- `/productos` muestra datos base del producto, estado de configuracion QB pendiente/configurada, unidades permitidas por contexto y clasificacion futura.
- La separacion no crea tablas duplicadas ni migra datos automaticamente.
- La separacion no habilita compras, ingresos, catalogo, pedidos, entregas, recibos, ventas, pagos, caja, CxC, CxP ni fulfillment.

### AT-QB4-001 - Ruta privada de ingresos

Dado un usuario administrador o inventario autenticado, cuando abre `/ingresos`, entonces ve el modulo QB-4 de recepcion fisica.

Criterios:

- `/ingresos` existe como ruta privada real.
- El sidebar muestra Ingresos para roles autorizados.
- Usuario no autenticado redirige a login.
- RLS limita lectura y mutacion de tablas QB-4 a roles internos autorizados.
- `/compras` y `/compras/multiple` siguen suspendidas.
- No se muestran pagos, caja, CxP, ventas, pedidos, checkout, recibos ni fulfillment.

### AT-QB4-002 - Ingreso directo con conversion

Dado un producto QB activo con unidad o presentacion permitida para `recepcion`, cuando inventario crea y confirma un ingreso directo, entonces el sistema convierte a unidad base y crea movimiento de inventario de entrada.

Criterios:

- La cantidad original conserva unidad o presentacion recibida.
- La cantidad base conserva minimo 3 decimales.
- Se guarda snapshot en `qb_conversion_snapshots`.
- La confirmacion revalida producto activo, configuracion QB, unidad/presentacion permitida para `recepcion` y snapshot vigente.
- Se crea un movimiento `entrada` para el producto recibido.
- No se crea compra, CxP, pago, caja ni venta.
- El costo de ingreso no modifica precio base de venta ni precios historicos.

### AT-QB4-003 - Clasificacion opcional sin duplicar stock base

Dado un producto recibido marcado como clasificable, cuando se guarda clasificacion y se confirma el ingreso, entonces solo los productos resultado aumentan stock.

Criterios:

- El producto base recibido no aumenta stock.
- Cada producto resultado recibe su cantidad base.
- La suma de productos resultado mas merma coincide con la cantidad base recibida.
- La merma queda trazada sin movimiento de entrada a inventario.
- La confirmacion se bloquea si la clasificacion no suma la cantidad base.
- La confirmacion revalida que cada resultado use una salida de clasificacion activa configurada para el producto recibido.

### AT-QB4-004 - Proteccion contra doble confirmacion

Dado un ingreso QB confirmado, cuando se intenta confirmar otra vez, entonces el sistema bloquea la operacion.

Criterios:

- No se crea segundo movimiento de inventario.
- No cambia `stock_current` por segunda vez.
- El ingreso conserva estado `confirmado`.

### AT-QB4-005 - Anulacion limitada

Dado un ingreso QB en borrador sin movimientos, cuando se anula con motivo, entonces queda `anulado` sin afectar inventario.

Criterios:

- Solo se anulan borradores.
- Un ingreso confirmado no se revierte en QB-4.
- La anulacion no crea ventas, compras, pagos, caja, CxC ni CxP.

## Clasificacion de papa

### AT-003 - Clasificacion crea solo productos resultado

Dado un ingreso de 1,125 kg de papa que requiere clasificacion, cuando se clasifica 60% grande, 20% mediana y 20% pequena, entonces se crean movimientos de entrada solo para papa grande, papa mediana y papa pequena.

Criterios:

- Papa grande recibe 675.000 kg.
- Papa mediana recibe 225.000 kg.
- Papa pequena recibe 225.000 kg.
- El producto base papa no aumenta stock vendible.
- La clasificacion guarda conversiones y porcentajes usados.

### AT-004 - Clasificacion con merma

Dado un ingreso de papa con merma, cuando se confirma la clasificacion, entonces la suma de resultados mas merma coincide con la cantidad base recibida.

Criterios:

- La merma queda registrada como cantidad fisica.
- La merma no aumenta stock vendible.
- El sistema rechaza resultados que excedan cantidad recibida menos merma.

## QB-5 - Cuenta cliente, catalogo sin precios y pedidos

### AT-QB5-001 - Cliente crea o actualiza perfil

Dado un cliente autenticado, cuando guarda nombre y telefono en `/mi-cuenta`, entonces `customer_accounts` conserva sus datos sin tocar `profiles` internos.

Criterios:

- El cliente solo modifica su propia cuenta.
- No se solicita metodo de pago.
- No se muestran precios.

### AT-QB5-002 - Cliente crea ubicacion

Dado un cliente autenticado, cuando crea una ubicacion, entonces se guarda en `qb_customer_locations` asociada a su cuenta.

Criterios:

- La ubicacion puede marcarse como principal.
- El cliente solo ve ubicaciones propias.
- Una ubicacion es obligatoria para enviar pedido.

### AT-QB5-003 - Catalogo QB sin precios

Dado productos QB configurados, cuando el cliente abre `/catalogo`, entonces ve solo productos activos, vendibles, visibles en catalogo QB y con unidad permitida para `pedido`.

Criterios:

- No se muestra precio base.
- No se muestra precio final.
- No se muestra subtotal ni total.
- No se muestra descuento, metodo de pago, QR, efectivo, caja ni recibo.

### AT-QB5-004 - Unidad permitida para pedido

Dado un producto con unidades permitidas para `pedido`, cuando el cliente agrega un producto, entonces debe elegir una unidad activa permitida y cantidad valida.

Criterios:

- Cantidad mayor a cero.
- Maximo 3 decimales.
- Respeta minimo e incremento configurados.
- Si la unidad deja de estar activa, el envio se rechaza.

### AT-QB5-005 - Enviar pedido QB

Dado un carrito con productos validos y una ubicacion activa, cuando el cliente envia el pedido, entonces se crea un registro en `qb_orders` y sus items en `qb_order_items`.

Criterios:

- Estado inicial `pendiente_preparacion`.
- Origen `catalogo_qb`.
- Guarda snapshot de cliente, ubicacion y conversion.
- No descuenta stock.
- No crea venta.
- No crea pago.
- No crea caja.
- No crea CxC ni CxP.
- No crea recibo.
- No llama fulfillment legacy.

### AT-QB5-006 - Cliente ve solo sus pedidos

Dado dos clientes con pedidos QB, cuando cada uno abre `/mi-cuenta`, entonces solo ve sus propios pedidos.

Criterios:

- RLS impide lectura cruzada.
- El portal cliente filtra por `customer_account_id` aun si el usuario autenticado tuviera rol interno.
- El historial no muestra precios.

### AT-QB5-007 - Repetir ultimo pedido editable

Dado un cliente con pedidos anteriores, cuando pulsa repetir ultimo pedido, entonces el carrito se carga con producto, unidad, cantidad y observacion.

Criterios:

- No copia precios.
- No copia estados.
- No copia preparacion, entrega, recibos ni inventario.
- El cliente puede editar antes de enviar.
- Productos no disponibles se omiten.

### AT-QB5-008 - Productos frecuentes

Dado un cliente con historial QB, cuando abre `/mi-cuenta`, entonces ve productos frecuentes calculados desde `qb_order_items`.

Criterios:

- No usa ventas legacy.
- No usa recibos.
- No muestra precios.

### AT-QB5-009 - Vista interna de pedidos antes de QB-6

Dado un usuario `administrador` o `inventario`, cuando aplica solo QB-5 y abre `/pedidos`, entonces ve pedidos QB recibidos en modo lectura.

Criterios:

- Ve cliente, telefono, ubicacion, productos, cantidades y unidades.
- No puede preparar.
- No puede entregar.
- No descuenta stock.
- No genera venta, pago, caja, recibo, CxC, CxP ni fulfillment.

### AT-QB5-010 - Rutas legacy siguen suspendidas

Dado QB-5 activo, cuando se revisa `/pedido/confirmar`, entonces sigue suspendida la confirmacion publica por token y precio.

Criterios:

- No se usa cotizacion con token.
- No se llama `handle_public_order_quote`.
- No se llama `fulfill_confirmed_order`.

## Ingreso por caja/saco/carga

### AT-005 - Ingreso por presentacion

Dado un producto con presentaciones caja, saco y carga, cuando inventario registra ingreso usando una presentacion, entonces el stock se expresa en la unidad base definida y conserva snapshot de conversion.

Criterios:

- Se acepta cantidad con 3 decimales.
- Se registra costo de ingreso separado.
- No se actualizan precios de venta ni factores de recibo.

## Pedido sin precios

### AT-006 - Catalogo no muestra precios

Dado un cliente autenticado, cuando navega el catalogo, entonces ve productos, unidad y disponibilidad operativa, pero no ve precio base, precio referencial, subtotal, total ni metodo de pago.

Criterios:

- El carrito permite producto, unidad y cantidad.
- El envio no solicita efectivo, QR, mixto ni forma de pago.
- El pedido queda enviado a preparacion.

## Repetir pedido

### AT-007 - Repetir ultimo pedido

Dado un cliente con un pedido anterior, cuando elige repetir ultimo pedido, entonces el sistema precarga productos, unidades y cantidades del ultimo pedido editable.

Criterios:

- El cliente puede cambiar cantidades antes de enviar.
- Productos inactivos o no disponibles se marcan para revision sin inventar reemplazos.
- El pedido nuevo no copia precios ni recibos anteriores.

## Preparacion parcial

### AT-008 - Preparacion por linea

Dado un pedido enviado con 10 kg de papa y 5 kg de tomate, cuando preparacion registra 8 kg de papa y 0 kg de tomate, entonces las lineas quedan parcial y no disponible respectivamente.

Criterios:

- La cantidad solicitada se conserva.
- La cantidad real entregada se guarda por linea.
- La unidad queda guardada.
- La observacion opcional puede quedar por linea.
- No hay descuento de stock al guardar preparacion.

## QB-6 - Preparacion y entrega fisica

### AT-QB6-001 - Iniciar preparacion

Dado un pedido QB en `pendiente_preparacion`, cuando un usuario `administrador` o `inventario` inicia preparacion en `/pedidos`, entonces se crea una cabecera de preparacion y una linea por item.

Criterios:

- El pedido pasa a `en_preparacion`.
- Las lineas arrancan sin descuento de stock.
- No se crea venta, pago, caja, CxC, CxP, recibo, compra legacy ni fulfillment.

### AT-QB6-002 - Guardar cantidades reales

Dado un pedido en preparacion, cuando el usuario registra cantidades reales por linea, entonces se guardan estado, unidad, cantidad real, cantidad base y snapshot de conversion.

Criterios:

- Una linea `completo` coincide con la cantidad solicitada.
- Una linea `parcial` es mayor a cero y menor a lo solicitado.
- Una linea `no_disponible` queda en cero.
- La preparacion no mueve stock.

### AT-QB6-003 - Confirmar entrega

Dado un pedido `preparado`, cuando se confirma la entrega fisica, entonces el sistema descuenta inventario solo por cantidades reales preparadas.

Criterios:

- Se crean movimientos `salida` en `inventory_movements`.
- Cada movimiento queda enlazado en `qb_order_delivery_movements`.
- El pedido queda `entregado_pendiente_recibo`.
- No se genera recibo todavia.

### AT-QB6-004 - Bloqueo anti doble descuento

Dado un pedido ya entregado con movimientos QB-6, cuando se intenta confirmar entrega nuevamente, entonces el sistema bloquea la operacion.

Criterios:

- `stock_current` no cambia por segunda vez.
- No se crea un segundo movimiento de inventario para la misma linea.
- La unicidad por `preparation_item_id` e `inventory_movement_id` permanece vigente.

### AT-QB6-005 - Stock insuficiente

Dado un pedido preparado cuya cantidad real excede el stock disponible al momento de entregar, cuando se confirma entrega, entonces la transaccion se revierte.

Criterios:

- No queda pedido entregado.
- No queda movimiento parcial.
- No cambia stock de otros items del mismo pedido.

### AT-QB6-006 - Cancelacion antes de entrega

Dado un pedido `pendiente_preparacion`, `en_preparacion` o `preparado`, cuando se cancela antes de entrega, entonces queda `cancelado` sin afectar stock.

Criterios:

- La cancelacion se bloquea si ya existen movimientos de entrega.
- No se crean ventas, pagos, caja, CxC, CxP, recibos ni fulfillment.

### AT-QB6-007 - Merma fuera de catalogo y entrega

Dado un producto marcado `is_qb_loss_product`, cuando el cliente consulta catalogo o administracion prepara entrega, entonces ese producto no participa del flujo vendible.

Criterios:

- No aparece en `get_qb_public_catalog()`.
- No entra como item preparable.
- No descuenta stock por entrega QB-6.

## Entrega y descuento de stock

### AT-009 - Descuento al entregar

Dado un pedido preparado parcial, cuando entrega confirma entrega fisica, entonces el inventario baja solo por cantidades reales entregadas.

Criterios:

- Papa baja 8.000 kg, no 10.000 kg.
- Tomate baja 0.000 kg.
- El pedido queda `entregado_pendiente_recibo`.
- Reintentar la misma entrega no duplica descuento.

## Recibo acumulativo

### AT-010 - Crear recibo de varios pedidos entregados

Dado un cliente con tres pedidos entregados pendientes de recibo, cuando administracion selecciona esos pedidos, entonces se crea un recibo acumulativo en borrador.

Criterios:

- Todos los pedidos pertenecen al mismo cliente.
- No se aceptan pedidos no entregados.
- No se aceptan pedidos ya incluidos en recibo emitido activo.
- El recibo contiene snapshots de cantidades reales y unidades.

## Factores compuestos

### AT-011 - Calculo compuesto

Dado una linea con precio base 100, distancia 10%, exigencia 5%, clima 0% y extraordinario 20%, cuando se calcula el precio final, entonces el resultado es 138.600.

Formula:

```text
100 * 1.10 * 1.05 * 1.00 * 1.20 = 138.600
```

Criterios:

- El calculo no suma porcentajes de forma lineal.
- Cada factor queda guardado.
- El resultado se redondea segun regla definida para recibo, sin perder el detalle auditable.

## Modificacion de precio base

### AT-012 - Cambio solo en recibo

Dado un recibo en borrador con precio base 100, cuando administracion cambia una linea a 110 y elige usar solo en este recibo, entonces el producto mantiene precio base 100 para futuros recibos.

Criterios:

- El recibo guarda precio base aplicado 110.
- El producto conserva precio base vigente 100.
- Auditoria registra usuario, fecha y motivo si se exige motivo.

### AT-013 - Guardar nuevo precio base

Dado un recibo en borrador con precio base 100, cuando administracion cambia una linea a 110 y elige guardar como nuevo precio base, entonces el producto queda con precio base vigente 110 para futuros recibos.

Criterios:

- El recibo guarda snapshot aplicado 110.
- El producto queda actualizado para usos futuros.
- Auditoria registra cambio de precio base.

## Anulacion y reemplazo de recibo

### AT-014 - Anular recibo emitido

Dado un recibo emitido, cuando administracion lo anula, entonces el recibo queda anulado sin borrarse y sus pedidos quedan disponibles solo para recibo de reemplazo controlado.

Criterios:

- El recibo original mantiene numero/referencia y trazabilidad.
- La anulacion exige motivo.
- No se altera inventario por anular recibo.
- No se registra devolucion de dinero ni caja.

### AT-015 - Reemplazar recibo

Dado un recibo anulado, cuando administracion genera reemplazo, entonces el nuevo recibo referencia al anterior y evita doble facturacion.

Criterios:

- El nuevo recibo incluye los pedidos autorizados.
- El recibo anterior queda `reemplazado` o conserva enlace al reemplazo.
- Auditoria permite ver cadena original-anulado-reemplazo.

## Protecciones contra doble descuento o doble facturacion

### AT-016 - Doble descuento bloqueado

Dado un pedido ya entregado con movimiento de inventario generado, cuando se intenta confirmar entrega nuevamente, entonces el sistema rechaza la operacion o retorna resultado idempotente sin crear otro movimiento.

Criterios:

- No cambia `stock_current`.
- No se crea segundo movimiento para la misma linea/entrega.
- Se registra intento o resultado idempotente.

### AT-017 - Doble facturacion bloqueada

Dado un pedido incluido en recibo emitido activo, cuando administracion intenta incluirlo en otro recibo, entonces el sistema bloquea la seleccion.

Criterios:

- El bloqueo identifica el recibo existente.
- Un recibo anulado no habilita doble facturacion libre; debe existir flujo de reemplazo.
- No se duplica linea de recibo activa.

## QB-7 - Recibos acumulativos

### AT-QB7-001 - Pedido entregado pendiente de recibo

Dado un pedido entregado por QB-6, cuando administracion abre `/recibos`, entonces el pedido aparece como pendiente de recibo para su cliente.

Criterios:

- El pedido esta `entregado_pendiente_recibo`.
- Tiene movimientos de entrega QB-6.
- No aparece si ya esta en recibo activo.

### AT-QB7-002 - Crear recibo con un pedido

Dado un cliente con un pedido entregado pendiente, cuando administracion crea recibo, entonces se crea `qb_receipts` en `borrador`.

Criterios:

- Se crea relacion en `qb_receipt_orders`.
- Se crean lineas desde items preparados entregados.
- El pedido pasa a `incluido_en_recibo_borrador`.
- No se mueve stock.

### AT-QB7-003 - Crear recibo con varios pedidos del mismo cliente

Dado un cliente con varios pedidos entregados pendientes, cuando se seleccionan juntos, entonces el recibo los agrupa.

Criterios:

- Todos pertenecen al mismo `customer_account_id`.
- El periodo se calcula desde pedidos incluidos.
- No se mezclan clientes.

### AT-QB7-004 - Bloquear clientes distintos

Dado pedidos de clientes distintos, cuando se intenta crear un solo recibo, entonces el backend rechaza la operacion.

Criterios:

- No se crea recibo parcial.
- No cambia estado de pedidos.

### AT-QB7-005 - Bloquear pedido ya incluido

Dado un pedido incluido en recibo `borrador` o `emitido`, cuando se intenta incluirlo en otro recibo, entonces se bloquea.

Criterios:

- Existe indice unico parcial por pedido activo.
- No se duplica facturacion.

### AT-QB7-006 - Factores compuestos 5/7/5/7

Dado precio base 100 y factores 5%, 7%, 5%, 7%, cuando se recalcula el recibo, entonces el precio final usa multiplicacion compuesta.

Criterios:

- Formula: `100 * 1.05 * 1.07 * 1.05 * 1.07`.
- No se suman porcentajes de forma lineal.
- El total se recalcula en backend.

### AT-QB7-007 - Editar precio solo en recibo

Dado un recibo en borrador, cuando administracion edita precio base usado sin guardar futuro, entonces solo cambia la linea del recibo.

Criterios:

- No cambia `qb_product_unit_settings.base_sale_price`.
- No modifica recibos emitidos anteriores.
- No modifica pedidos ni stock.

### AT-QB7-008 - Guardar nuevo precio base

Dado un recibo en borrador, cuando una linea marca guardar nuevo precio base, entonces se actualiza el precio base QB futuro del producto.

Criterios:

- Se actualiza `qb_product_unit_settings.base_sale_price`.
- Se registra evento `precio_base_actualizado`.
- No cambia ventas legacy ni precios historicos.

### AT-QB7-009 - Emitir recibo

Dado un recibo `borrador`, cuando administracion emite, entonces pasa a `emitido`.

Criterios:

- Los pedidos pasan a `recibo_emitido`.
- Se registra fecha y usuario de emision.
- Se impide doble emision.
- No se crea venta, pago, caja, CxC, CxP ni fulfillment.

### AT-QB7-010 - Anular recibo emitido

Dado un recibo `emitido`, cuando administracion lo anula con motivo, entonces queda `anulado`.

Criterios:

- El motivo es obligatorio.
- Los pedidos vuelven a `entregado_pendiente_recibo`.
- No se devuelve stock.
- No se crean movimientos de inventario.

### AT-QB7-011 - Vista digital no fiscal

Dado un recibo QB, cuando administracion abre `/recibos/[id]`, entonces ve una vista imprimible privada.

Criterios:

- Muestra logo, numero, cliente, pedidos, lineas, factores y total.
- Muestra leyenda no fiscal.
- No muestra metodo de pago.
- No dice factura fiscal.

## QB-8 - Reportes simples y auditoria operativa

### AT-QB8-001 - Inicio operativo sin metricas financieras legacy

Dado un usuario interno autorizado, cuando abre `/`, entonces ve resumen QB de pedidos, recibos, stock e ingresos recientes.

Criterios:

- No muestra ventas.
- No muestra cobros.
- No muestra pagos.
- No muestra caja.
- No muestra CxC ni CxP.
- El total monetario permitido se llama `Total en recibos emitidos`.

### AT-QB8-002 - Inventario actual

Dado un usuario autorizado en `/reportes`, cuando abre la pestana Inventario, entonces ve productos, categoria, stock actual, unidad base, estado QB, visibilidad catalogo y estado de stock.

Criterios:

- Puede filtrar por categoria, busqueda, stock bajo/sin stock, catalogo QB y estado QB.
- No modifica stock.
- No crea movimientos de inventario.

### AT-QB8-003 - Ingresos QB

Dado un usuario autorizado, cuando abre la pestana Ingresos, entonces ve ingresos desde `qb_merchandise_*`.

Criterios:

- No consulta compras legacy.
- Si aparece costo, se etiqueta como `Costo informativo de ingreso`.
- No muestra pagos al proveedor, CxP ni caja.

### AT-QB8-004 - Pedidos por estado

Dado pedidos QB en distintos estados, cuando se filtra el reporte de pedidos, entonces se muestran cliente, telefono, ubicacion, estado, productos solicitados y cantidades preparadas.

Criterios:

- No muestra precios al cliente.
- No crea ventas.
- No llama fulfillment.

### AT-QB8-005 - Entregas pendientes de recibo

Dado pedidos entregados pendientes de recibo, cuando se abre la pestana Pendientes de recibo, entonces se agrupan por cliente.

Criterios:

- Muestra cantidad de pedidos pendientes por cliente.
- Muestra productos entregados y ultima fecha de entrega.
- Permite navegar a `/recibos`.
- No crea recibo directamente desde el reporte.
- No mueve stock.

### AT-QB8-006 - Recibos emitidos y anulados

Dado recibos en borrador, emitidos y anulados, cuando se abre la pestana Recibos, entonces se muestran numero, cliente, estado, fecha de emision, factores, pedidos incluidos y Total de recibo.

Criterios:

- No muestra metodo de pago.
- No dice cobrado.
- No dice venta cobrada.
- No muestra QR, efectivo ni transferencia.

### AT-QB8-007 - Total de recibo no es cobro

Dado un recibo emitido con total, cuando aparece en reportes, entonces el campo se llama `Total de recibo` o `Total en recibos emitidos`.

Criterios:

- No se usa la palabra cobro para ese total.
- No se crean pagos ni caja.

### AT-QB8-008 - Clientes frecuentes

Dado pedidos QB historicos, cuando se abre la pestana Frecuentes, entonces se muestran clientes con mas pedidos y clientes con pedidos pendientes de recibo.

Criterios:

- No usa ventas legacy.
- No usa pagos.
- No usa saldos de clientes.

### AT-QB8-009 - Productos frecuentes

Dado pedidos y entregas QB, cuando se abre la pestana Frecuentes, entonces se muestran productos mas solicitados, mas entregados, con mas faltantes y unidades mas usadas.

Criterios:

- Usa `qb_order_items`, `qb_order_delivery_movements` y `qb_order_preparation_items`.
- No usa `sale_items`.

### AT-QB8-010 - Auditoria basica

Dado eventos operativos QB existentes, cuando se abre Auditoria, entonces se muestran ingresos, pedidos, preparaciones, entregas y eventos de recibos.

Criterios:

- No registra auditoria retroactiva falsa.
- Reutiliza timestamps y `qb_receipt_events`.

### AT-QB8-011 - No ventas legacy

Dado QB-8 activo, cuando se revisan los reportes, entonces no consultan `sales` ni `sale_items`.

### AT-QB8-012 - No pagos, caja ni CxC/CxP

Dado QB-8 activo, cuando se revisan los reportes, entonces no consultan `payments`, `cash_movements`, `accounts_receivable` ni `accounts_payable`.

### AT-QB8-013 - Sin metodos de pago

Dado QB-8 activo, cuando se consulta UI o CSV, entonces no aparecen efectivo, QR, transferencia ni metodo de pago.

### AT-QB8-014 - Cliente externo no accede a reportes

Dado un cliente externo autenticado, cuando intenta acceder a `/reportes`, entonces no puede ver reportes internos ni datos de otros clientes.

## QB-9 - Cierre tecnico y preparacion de Staging

### AT-QB9-001 - Modulos activos y suspendidos auditados

Dado el cierre tecnico QB-9, cuando se revisa la documentacion final, entonces existe una clasificacion de modulos activos QB y suspendidos legacy.

Criterios:

- Inicio, Productos, Parametrizacion, Ingresos, Catalogo, Mi cuenta, Pedidos, Recibos y Reportes quedan activos QB.
- Ventas, Finanzas, Caja, Pagos, CxC, CxP, Compras legacy, Pedido/confirmar y Fulfillment quedan suspendidos.
- No se eliminan archivos legacy sin autorizacion.

### AT-QB9-002 - Rutas auditadas

Dado QB-9, cuando se revisa `QB_INSUMOS_QB9_CIERRE_TECNICO.md`, entonces existe tabla de rutas con estado, publico/privado, roles, permitido, no permitido y riesgo.

### AT-QB9-003 - Migraciones canonicas documentadas

Dado QB-9, cuando se revisa `QB_INSUMOS_MIGRACIONES_CANONICAS.md`, entonces existe orden recomendado de migraciones y lista de migraciones que no deben aplicarse para QB.

Criterios:

- `SUPABASE_SCHEMA.sql` queda marcado como no canonico.
- 15F-B y 15F-C quedan marcadas como no aplicar para flujo QB.
- Se documentan riesgos de aplicar 13, 14C/14D, 15C o 12D fuera de orden.

### AT-QB9-004 - PostgreSQL local no se ejecuta si no es local

Dado `.env.local` apuntando a Supabase remoto, cuando se ejecuta QB-9, entonces no se ejecuta SQL.

Criterios:

- Se documenta host detectado.
- Se marca prueba local como no ejecutada por seguridad.
- No se afirma que esta listo para Produccion.

### AT-QB9-005 - Plan de Staging creado sin aplicarlo

Dado QB-9, cuando se revisa `QB_INSUMOS_PLAN_PRUEBAS_STAGING.md`, entonces existen precondiciones, backup, orden, pruebas, criterios de aprobacion, criterios de detencion y rollback.

### AT-QB9-006 - Checklist cliente creado

Dado QB-9, cuando se revisa `QB_INSUMOS_CHECKLIST_ENTREGA_CLIENTE.md`, entonces existe checklist de demostracion cliente con flujo inventario, cliente, preparacion, recibo y reportes.

Criterios:

- Incluye advertencia de que el cobro se gestiona fuera del sistema.
- Incluye que recibo no es factura fiscal ni comprobante de pago.

### AT-QB9-007 - Busqueda estatica de modulos prohibidos

Dado QB-9, cuando se ejecutan busquedas estaticas, entonces los modulos QB no invocan ventas, pagos, caja, CxC, CxP, compras legacy ni fulfillment legacy.

### AT-QB9-008 - Verificaciones locales obligatorias

Dado QB-9, cuando se ejecuta cierre local, entonces `npm run lint`, `npx tsc --noEmit` y `npm run build` deben pasar antes de considerar la fase cerrada localmente.
