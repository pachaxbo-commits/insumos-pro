# PLAN PRUEBAS STAGING FASE 15B

## Preparacion

1. Confirmar proyecto, URL y entorno de staging.
2. Confirmar backup o punto de restauracion.
3. Verificar que Fase 14D.1 ya esta aplicada.
4. Aplicar una sola vez `SUPABASE_MIGRATION_FASE_15B_PUBLIC_CATALOG.sql`.
5. Reiniciar la app local conectada a staging.

## Publicacion

1. Abrir `/catalogo` sin iniciar sesion: debe cargar sin redirigir a `/login`.
2. Confirmar que inicialmente no muestra productos existentes.
3. Publicar un producto sin publicar su categoria: no debe aparecer.
4. Publicar categoria y producto vendible: debe aparecer.
5. Desactivar el producto: debe desaparecer.
6. Marcarlo como agotado: debe mostrarse, pero no permitir agregarlo.
7. Marcarlo como solo compra o requiere clasificacion: la edicion publica debe bloquearse.

## Seguridad

1. Como visitante anonimo, intentar `select * from products`: debe ser rechazado.
2. Intentar insert, update y delete anonimos en productos, categorias y unidades: deben fallar.
3. Ejecutar `get_public_catalog`: solo debe devolver los campos documentados en Fase 15B.
4. Confirmar que la respuesta no contiene costo, stock exacto, proveedor, margen ni SKU.
5. Confirmar que productos ocultos, inactivos, solo de compra o de clasificacion no aparecen.

## Carrito

1. Agregar productos con minimo entero y decimal.
2. Aumentar y reducir usando el incremento configurado.
3. Escribir una cantidad intermedia: al salir del campo debe ajustarse al incremento valido.
4. Recargar la pagina: el carrito debe persistir en el mismo navegador.
5. Eliminar un producto y vaciar el carrito.
6. Confirmar en Supabase que el carrito no creo ni modifico registros.

## Dispositivos

1. Celular 360 px: categorias horizontales, cards y resumen fijo sin scroll lateral.
2. Tablet: grid legible y carrito accesible.
3. Escritorio: grid y carrito lateral fijo.
4. Probar Chrome y un segundo navegador.

## Regresion privada

1. Crear y editar producto desde `/productos`.
2. Crear y editar categoria y unidad.
3. Registrar movimiento de inventario.
4. Confirmar una compra y una venta.
5. Confirmar que reportes y dashboard mantienen sus datos privados.
