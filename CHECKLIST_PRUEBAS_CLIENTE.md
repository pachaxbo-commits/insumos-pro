# CHECKLIST_PRUEBAS_CLIENTE

## Acceso

- [ ] Login con usuario administrador.
- [ ] Login con usuario ventas.
- [ ] Login con usuario inventario.
- [ ] Login con usuario finanzas.
- [ ] Logout redirige a `/login`.
- [ ] Usuario sin permisos ve `/acceso-restringido`.

## Productos

- [ ] Crear categoria.
- [ ] Crear unidad.
- [ ] Crear producto activo.
- [ ] Editar producto.
- [ ] Desactivar producto.
- [ ] Buscar por nombre o SKU.

## Inventario

- [ ] Registrar entrada.
- [ ] Registrar salida.
- [ ] Registrar merma.
- [ ] Validar bloqueo de stock negativo.
- [ ] Revisar historial con filtros.

## Compras

- [ ] Crear proveedor.
- [ ] Crear compra en borrador.
- [ ] Agregar productos con cantidades y costos validos.
- [ ] Confirmar compra y validar aumento de stock.
- [ ] Intentar confirmar de nuevo y verificar mensaje claro.

## Ventas

- [ ] Crear cliente contado.
- [ ] Crear cliente credito con limite.
- [ ] Crear venta contado.
- [ ] Confirmar venta y validar descuento de stock.
- [ ] Crear venta credito.
- [ ] Validar aumento de cuenta por cobrar.
- [ ] Intentar credito con cliente contado y verificar mensaje claro.
- [ ] Intentar venta sin stock suficiente y verificar mensaje claro.

## Finanzas

- [ ] Registrar cobro parcial.
- [ ] Registrar cobro total.
- [ ] Validar que no permita pago mayor al saldo.
- [ ] Registrar pago a proveedor.
- [ ] Registrar gasto manual.
- [ ] Registrar ingreso manual.
- [ ] Revisar caja diaria.

## Reportes y exportaciones

- [ ] Reporte de ventas por rango.
- [ ] Reporte de inventario.
- [ ] Reporte de clientes.
- [ ] Reporte de compras.
- [ ] Reporte financiero.
- [ ] Exportar CSV de ventas.
- [ ] Exportar CSV de productos.
- [ ] Exportar CSV de caja.

## Permisos

- [ ] Ventas no gestiona inventario directo.
- [ ] Inventario no gestiona finanzas.
- [ ] Finanzas no modifica productos ni inventario.
- [ ] Administrador ve bitacora.
- [ ] No autenticado no accede a rutas privadas.

