# NOTAS_FASE_3

## Alcance completado

- Modulo real `/productos` conectado a Supabase.
- Tablas `product_categories`, `units_of_measure` y `products` agregadas al esquema.
- Tipos TypeScript para productos, categorias y unidades.
- Capa de lectura y Server Actions para crear, editar y desactivar productos.
- Gestion basica de categorias y unidades con activacion/inactivacion logica.
- Filtros por busqueda, categoria, estado y stock bajo.
- Badges para activo, inactivo, stock bajo y sin stock.
- Seed demo idempotente para productos de alimentos e insumos.

## Permisos

- `administrador`: lectura y escritura completa.
- `inventario`: lectura y escritura completa del catalogo.
- `ventas`: solo lectura del catalogo.
- `finanzas`: sin acceso directo a `/productos`.

## Decisiones

- No se eliminan registros fisicamente; se usa `is_active`.
- El stock actual y minimo son campos referenciales en esta fase.
- El margen se calcula en la aplicacion como `(precio venta - precio compra) / precio venta`.
- Las mutaciones verifican rol en Server Actions y tambien estan protegidas por RLS.

## Pendientes intencionales

- No se implementaron movimientos de inventario.
- No se conectaron ventas ni compras al catalogo.
- No hay carga de imagenes; `image_url` queda preparado como campo opcional.
