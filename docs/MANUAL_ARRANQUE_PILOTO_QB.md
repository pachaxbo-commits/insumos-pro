# Manual de arranque piloto de QB Insumos

## 1. Crear y configurar un producto

1. En **Productos**, selecciona **Nuevo producto**.
2. Completa el nombre, categoría, unidad base, unidad de inventario y unidad de precio.
3. Define si es un producto vendible y guarda.
4. En la configuración del producto, habilita las unidades o presentaciones que podrán utilizarse en pedidos.
5. En **Precios base**, registra un precio positivo. Este precio se aplicará solo a pedidos futuros.

## 2. Permitir pedidos por importe en Bs

En **Editar producto** o **Productos → Configuración por producto → Precios base**, selecciona **Habilitar Por Bs**. El sistema comprobará que el producto esté activo y sea vendible, que sus unidades sean compatibles y que exista un precio base positivo.

No habilites esta modalidad en productos que deban venderse exclusivamente por cantidad física. Deshabilitarla oculta la opción **Por Bs** en el catálogo y en los nuevos pedidos, sin modificar pedidos anteriores.

## 3. Crear y preparar un pedido por importe

1. En el catálogo o en **Pedidos → Nuevo pedido**, elige **Por Bs**.
2. Ingresa el importe solicitado, por ejemplo **Bs 10,00**.
3. El sistema mostrará una cantidad física aproximada calculada con el precio vigente.
4. En el checklist de preparación, registra la cantidad realmente pesada o preparada.
5. Si esa cantidad difiere de forma importante de la estimación, revisa el pesaje. La advertencia es informativa: el importe solicitado no cambia.

Ejemplo: con precio **Bs 8 por kg**, un pedido de **Bs 10** estima **1,250 kg**. Si se preparan y entregan **1,230 kg**, inventario descuenta **1,230 kg** y el recibo conserva exactamente **Bs 10,00**.

## 4. Entregar y generar el recibo

1. Guarda la preparación y marca el pedido como preparado.
2. Confirma la entrega. El movimiento de inventario usa la cantidad real preparada.
3. En **Recibos**, crea el borrador con los pedidos entregados del cliente.
4. Las líneas por cantidad mantienen el cálculo habitual. Las líneas **Por Bs** conservan el importe fijo solicitado y el precio de referencia de su snapshot.
5. Revisa y emite el recibo.

## 5. Stock provisional

Mientras **Control estricto de stock** esté desactivado, el sistema permite operar aunque el saldo quede negativo. Los movimientos sí se registran y servirán para la regularización posterior.

Este modo se identifica como **Modo piloto — Stock provisional**. Los saldos negativos aparecen como **Saldo provisional** y no significan que la entrega haya fallado.

## 6. Registrar inventario de apertura

Utiliza **Configuración → Activación operativa** para preparar y validar el stock inicial. Los ingresos de apertura deben quedar registrados como movimientos trazables; no edites directamente el saldo de un producto.

Antes de activar el control estricto, revisa en **Configuración → Operación e inventario**:

- productos con saldo negativo;
- productos sin unidad base;
- productos sin stock de apertura;
- productos pendientes de regularización.

## 7. Activar el control estricto

Cuando los saldos sean confiables, un administrador puede ir a **Configuración → Operación e inventario**, escribir la confirmación solicitada y seleccionar **Activar control estricto**.

Desde ese momento, una entrega no puede dejar el stock por debajo de cero. Si falta existencia, el sistema informa lo disponible y lo faltante; se debe ajustar la preparación o registrar el ingreso correspondiente. Cambiar el modo no modifica pedidos ni movimientos históricos.
