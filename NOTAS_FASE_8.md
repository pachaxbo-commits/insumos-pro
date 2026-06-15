# NOTAS_FASE_8

## Objetivo

Implementar reportes ejecutivos, operativos y exportaciones CSV sobre los datos reales ya creados en ventas, inventario, clientes, compras y finanzas.

## Implementado

- Ruta `/reportes` protegida por Supabase Auth y permisos de rol.
- Tabs premium para ventas, inventario, clientes, compras, finanzas y exportaciones.
- Filtros por rango de fecha, cliente, producto, categoria, proveedor, estados y metodos de pago.
- Reporte de ventas con total vendido, cantidad de ventas, ticket promedio, productos mas vendidos, clientes que mas compran e historial.
- Reporte de inventario con valorizacion por precio de compra/venta, stock bajo, sin stock, movimientos y productos con mayor salida.
- Reporte de clientes con activos, deuda, credito disponible, ranking por compras y ranking por saldo.
- Reporte de compras con total comprado, compras confirmadas, pendientes de pago, compras por proveedor y productos mas comprados.
- Reporte financiero con ingresos por ventas, cobros, pagos, gastos manuales, caja neta, cuentas pendientes, vencidas y utilidad estimada.
- Exportaciones CSV para ventas, productos, inventario, clientes, compras, cuentas por cobrar, cuentas por pagar y caja.
- Indices SQL de apoyo para consultas frecuentes de reportes.

## Permisos

- `administrador`: acceso completo.
- `finanzas`: acceso completo a reportes comerciales y financieros.
- `ventas`: acceso a ventas, clientes, inventario basico y exportaciones permitidas.
- `inventario`: acceso a inventario, compras, productos y exportaciones permitidas.

Los permisos se aplican en la pagina server-side y en la UI. Las exportaciones solo reciben datasets permitidos para el rol actual.

## SQL requerido

Si el proyecto ya tiene Fase 7 aplicada, ejecutar el bloque final de `SUPABASE_SCHEMA.sql`:

```sql
-- Fase 8: indices de apoyo para reportes y exportaciones.
```

Si el proyecto esta limpio, ejecutar completo `SUPABASE_SCHEMA.sql`.

## Pruebas sugeridas

1. Iniciar sesion como `administrador` o `finanzas`.
2. Abrir `/reportes`.
3. Probar filtros por fecha y estado.
4. Revisar tabs de ventas, inventario, clientes, compras y finanzas.
5. Abrir `Exportaciones` y descargar CSV.
6. Repetir con rol `ventas` y verificar que no aparezcan compras/finanzas.
7. Repetir con rol `inventario` y verificar que no aparezcan ventas/clientes/finanzas completas.

## Limitaciones

- No se implemento PDF en esta fase.
- Los reportes usan agregaciones en la capa server de Next.js con limites razonables de filas. Para volumen alto conviene mover KPIs a vistas SQL o RPCs.
- La utilidad estimada usa costo actual de producto, no costo historico por lote o compra.
- Los CSV exportan lo disponible segun filtros, permisos y limites de consulta actuales.

## Validacion

- `npm run lint`: OK.
- `npm run build`: OK.
