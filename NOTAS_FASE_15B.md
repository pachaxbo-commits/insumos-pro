# NOTAS FASE 15B

## Alcance

Se implemento un catalogo publico de solo lectura en `/catalogo` con:

- categorias publicas;
- productos publicables de forma explicita;
- descripcion e imagen publicas;
- precio y disponibilidad referenciales;
- cantidad minima e incremento configurable;
- carrito persistido solamente en `localStorage`;
- experiencia mobile-first y carrito lateral en escritorio.

No se implementaron checkout, datos personales, creacion de pedidos, pagos ni cambios al
inventario, ventas o finanzas.

## Seguridad

La tabla `products` no tiene lectura anonima. El navegador obtiene datos mediante
`public.get_public_catalog()`, una funcion `security definer` con `search_path` fijo y una lista
blanca de campos.

Campos publicos exactos:

- id, nombre y descripcion publica del producto;
- URL de imagen;
- precio referencial;
- nombre y abreviatura de unidad;
- id, nombre y slug de categoria;
- cantidad minima e incremento;
- disponibilidad general;
- orden de producto y categoria.

No se exponen costo, stock exacto, stock minimo, proveedor, margen, SKU, flags internos ni
relaciones operativas.

## Publicacion

Todos los registros existentes quedan ocultos al aplicar la migracion.

1. En `/productos`, editar la categoria y marcarla como publica.
2. Definir slug y orden de categoria.
3. Editar el producto, mantenerlo activo y vendible.
4. Configurar descripcion, imagen, minimo, incremento y disponibilidad.
5. Marcarlo visible en catalogo.

Un producto inactivo, no vendible, que requiere clasificacion, sin precio positivo o dentro de
una categoria oculta no aparece en el catalogo.

## SQL

Para una base existente aplicar, despues de Fase 14D.1:

`SUPABASE_MIGRATION_FASE_15B_PUBLIC_CATALOG.sql`

La migracion esta pendiente de aplicar en staging. No se ejecuto SQL remoto durante esta fase.
