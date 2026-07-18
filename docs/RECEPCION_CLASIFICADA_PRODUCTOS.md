# Recepcion clasificada y productos

## Crear un producto

1. Ingresa a **Productos** con un usuario administrador.
2. Selecciona **Nuevo producto**.
3. Completa nombre, categoria, unidad base, estado y uso comercial.
4. Para un producto que solo se recibe y luego se distribuye, marca **Requiere clasificacion** y **Solo compra / uso interno**.
5. Guarda el producto. El stock comienza en cero y se modifica exclusivamente mediante Ingresos y Entregas.

## Subir o reemplazar la fotografia

En el formulario de producto selecciona una imagen JPEG, PNG o WebP de hasta 5 MB. Al guardar una nueva fotografia, la anterior se reemplaza. Si no existe una imagen, el catalogo conserva su alternativa visual.

## Configurar unidades y presentaciones de recepcion

1. Ingresa a **Parametrizacion**.
2. Crea o edita una presentacion asociada al producto.
3. Registra el contenido y su equivalencia en la unidad base.
4. En **Productos > Configuracion por producto**, habilita esa presentacion para el contexto **Recepcion**.

Ejemplos operativos confirmados:

- Papa holandesa: `1 carga = 10 arrobas = 112,5 kg`.
- Tomate: `1 caja = 25 kg`.
- Vaina: `1 saco = 1,9 arrobas = 21,375 kg`.

No se crean factores a partir del nombre del producto: cada equivalencia debe ser revisada por el administrador.

## Configurar una clasificacion

1. Crea el producto de entrada y cada producto resultado por separado.
2. Configura el producto de entrada como clasificable, con modo **Por porcentaje**, oculto para clientes y no vendible.
3. Configura cada resultado como producto activo y vendible, con unidad de inventario y precio en kg.
4. En **Resultados de clasificacion**, vincula el producto de entrada con cada producto resultado.
5. No fijes proporciones: los porcentajes se introducen en cada ingreso.

Para la papa holandesa, los resultados son grande, mediana y pequena. Cada uno conserva stock, fotografia, visibilidad y precio base independientes.

## Registrar y confirmar un ingreso clasificado

1. Ingresa a **Ingresos** con un usuario administrador o de Inventario.
2. Busca el producto recibido por nombre o categoria.
3. Selecciona la presentacion y registra la cantidad recibida.
4. Guarda el ingreso como borrador.
5. Introduce el porcentaje de cada resultado. El total debe ser exactamente 100 %.
6. Revisa la vista previa de cantidades y guarda la distribucion.
7. Confirma el ingreso.

La confirmacion crea movimientos positivos solo para los productos resultado. El producto sin clasificar no se suma nuevamente al stock. Esta version no registra merma; cualquier residuo de redondeo se asigna al ultimo resultado positivo para conservar exactamente la cantidad recibida.

## Comprobar stock, precios y venta

1. Revisa en **Inventario** el stock de cada producto resultado.
2. En **Productos**, asigna un precio base independiente a cada resultado.
3. Crea el pedido desde **Pedidos** usando el buscador de productos.
4. Registra la cantidad realmente preparada; la preparacion no descuenta stock.
5. Confirma la entrega; el inventario descuenta la cantidad realmente entregada.
6. Genera el recibo. El precio aplicado queda congelado en el recibo y los cambios posteriores no alteran el historial.

Los costos de ingreso no se utilizan como precios de venta y nunca deben copiarse de documentos informales sin confirmacion administrativa.
