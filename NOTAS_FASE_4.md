# NOTAS_FASE_4

## Alcance completado

- Modulo `/inventario` funcional conectado a Supabase.
- Tabla `inventory_movements` agregada al esquema.
- Funcion SQL `register_inventory_movement` para registrar movimiento y actualizar stock en una sola operacion.
- Tipos de movimiento: `entrada`, `salida`, `ajuste`, `merma`, `devolucion`.
- Resumen de productos, stock bajo, sin stock y movimientos del dia.
- Formulario manual de movimiento.
- Historial con fecha, producto, tipo, cantidad, stock antes, stock despues, motivo y usuario.
- Filtros por producto, tipo y fecha.
- Alertas de stock bajo y sin stock.

## Reglas de stock

- `entrada` suma stock.
- `devolucion` suma stock.
- `salida` resta stock.
- `merma` resta stock.
- `ajuste` establece el nuevo stock final.
- No se permite stock negativo.

## Permisos

- `administrador`: puede registrar movimientos.
- `inventario`: puede registrar movimientos.
- `ventas`: solo lectura de inventario.
- `finanzas`: sin acceso directo a `/inventario`.

## Decisiones tecnicas

- La actualizacion de stock se centraliza en la funcion SQL `register_inventory_movement`.
- Las Server Actions validan rol antes de llamar a Supabase.
- RLS permite lectura a roles operativos y escritura solo mediante roles de inventario/administracion.
- No se implementan ventas ni compras reales en esta fase.

## Limitaciones

- No existe confirmacion explicita para permitir stock negativo; se bloquea.
- El usuario del historial puede mostrarse como identificador si la politica RLS de perfiles no permite leer el nombre.
- No hay anulacion/reversion de movimientos todavia.
