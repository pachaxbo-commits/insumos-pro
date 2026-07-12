# QB Insumos - Checklist de entrega al cliente

## Objetivo de la demostracion

Mostrar el flujo operativo QB Insumos completo:

```text
parametrizacion -> ingreso -> catalogo sin precios -> pedido -> preparacion -> entrega -> recibo -> reportes
```

El cobro se gestiona fuera del sistema. QB Insumos no registra efectivo, QR, transferencias, caja, CxC ni CxP.

## Usuarios necesarios

| Usuario | Proposito |
| --- | --- |
| Administrador | Configurar productos, preparar recibos y ver reportes. |
| Inventario | Parametrizar, registrar ingresos y operar preparacion/entrega. |
| Cliente | Crear ubicaciones y hacer pedidos sin precios. |

## Datos minimos a cargar

### Unidades

- Kilogramo `kg`.
- Libra `lb`.
- Arroba `@`.
- Cuartilla `cuartilla`.

### Productos

- Papa para clasificar.
- Papa grande.
- Papa mediana.
- Papa pequena.
- Merma, si se decide usar producto de perdida.

### Presentaciones

- Papa: `1 carga = 10 arrobas = 112.5 kg`.

### Configuracion QB

- Papa para clasificar: clasificable.
- Papa grande/mediana/pequena: vendibles y visibles en catalogo si corresponde.
- Unidades permitidas para pedido.
- Unidades permitidas para recepcion.
- Precio base QB para recibos.

### Cliente

- Nombre completo.
- Telefono.
- Una ubicacion principal.
- Referencia de entrega.

## Flujo que se mostrara

### 1. Parametrizacion

- Abrir `/parametrizacion`.
- Confirmar unidades universales.
- Confirmar presentacion carga.
- Abrir `/productos`.
- Confirmar producto clasificable y productos resultado.

### 2. Ingreso de mercaderia

- Abrir `/ingresos`.
- Crear ingreso de papa.
- Usar presentacion carga.
- Clasificar 60/20/20.
- Registrar merma si aplica.
- Confirmar ingreso.
- Validar stock de productos resultado.

### 3. Cuenta cliente

- Abrir `/mi-cuenta`.
- Crear o actualizar datos.
- Crear ubicacion.
- Confirmar que no aparecen precios ni metodos de pago.

### 4. Catalogo sin precios

- Abrir `/catalogo`.
- Ver productos y unidades permitidas.
- Agregar producto al carrito.
- Revisar `/catalogo/checkout`.
- Enviar pedido.
- Confirmar que no hay subtotal, total, QR, efectivo ni forma de pago.

### 5. Preparacion y entrega

- Abrir `/pedidos` como usuario interno.
- Iniciar preparacion.
- Marcar una linea completa, parcial o no disponible.
- Guardar preparacion.
- Confirmar entrega.
- Verificar que el stock baja solo al entregar.

### 6. Recibo acumulativo

- Abrir `/recibos`.
- Seleccionar pedidos entregados pendientes.
- Crear borrador.
- Aplicar factores.
- Editar precio base usado.
- Emitir recibo.
- Abrir vista imprimible.
- Confirmar leyenda no fiscal.
- Confirmar que no hay metodo de pago.

### 7. Reportes

- Abrir `/reportes`.
- Revisar inventario.
- Revisar ingresos.
- Revisar pedidos/preparacion.
- Revisar pendientes de recibo.
- Revisar recibos.
- Exportar CSV.
- Confirmar que no hay caja, pagos, CxC ni CxP.

## Pruebas minimas de aceptacion

- Catalogo no muestra precios.
- Mi cuenta no muestra precios ni recibos internos.
- Pedido no crea venta.
- Pedido no crea pago.
- Pedido no crea caja.
- Preparacion no mueve stock.
- Entrega mueve stock una sola vez.
- Recibo no mueve stock.
- Recibo no crea cobro.
- Recibo no crea caja ni CxC.
- Reportes no mutan datos.
- Rutas legacy muestran pantalla suspendida.

## Advertencias para el cliente

- El recibo QB no es factura fiscal.
- El recibo QB no es comprobante de pago.
- El cobro se gestiona fuera del sistema.
- Los modulos legacy de ventas, pagos, caja y finanzas quedan suspendidos durante la transicion.
- Antes de Produccion debe aprobarse Staging con datos controlados.
