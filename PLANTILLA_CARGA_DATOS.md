# PLANTILLA_CARGA_DATOS

## Objetivo

Recolectar datos reales del cliente antes de cargar Insumos Pro en produccion.

## Categorias

| name | description | is_active |
| --- | --- | --- |
| Verduras | Productos frescos | true |

## Unidades de medida

| name | abbreviation | is_active |
| --- | --- | --- |
| Kilogramo | kg | true |

## Productos

| name | sku | category | unit | stock_min | purchase_price | sale_price | supplier_name | is_active |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Tomate | TOM-001 | Verduras | kg | 20 | 4.50 | 6.00 | Proveedor principal | true |

Reglas:

- `sku` debe ser unico.
- `purchase_price` y `sale_price` deben ser mayores o iguales a cero.
- `stock_min` debe ser mayor o igual a cero.
- El stock inicial se carga aparte mediante movimientos de inventario.

## Stock inicial

| sku | product_name | quantity | reason | notes |
| --- | --- | --- | --- | --- |
| TOM-001 | Tomate | 100 | stock inicial | Conteo fisico de apertura |

Reglas:

- Cada stock inicial debe registrarse como movimiento tipo `entrada` o `ajuste`.
- No editar directamente `products.stock_current` en produccion salvo migracion tecnica controlada.

## Proveedores

| name | contact_name | phone | address | notes | is_active |
| --- | --- | --- | --- | --- | --- |
| Proveedor principal | Nombre contacto | 70000000 | Direccion | Condiciones acordadas | true |

## Clientes

| name | business_name | nit | phone | email | address | customer_type | credit_limit | current_balance | is_active |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Restaurante Central | Restaurante Central SRL | 1234567 | 70000000 | admin@cliente.com | Direccion | credito | 5000 | 0 | true |

Reglas:

- `customer_type`: `contado` o `credito`.
- Clientes de contado deben tener `credit_limit = 0` salvo decision aprobada.
- `current_balance` solo debe cargarse si existe deuda inicial real.

## Saldos pendientes por cobrar

| customer_name | nit | amount | paid_amount | balance | due_date | notes |
| --- | --- | --- | --- | --- | --- | --- |
| Restaurante Central | 1234567 | 1000 | 0 | 1000 | 2026-07-15 | Saldo inicial aprobado |

## Saldos pendientes por pagar

| supplier_name | amount | paid_amount | balance | due_date | notes |
| --- | --- | --- | --- | --- | --- |
| Proveedor principal | 1500 | 0 | 1500 | 2026-07-15 | Saldo inicial aprobado |

## Revision previa a carga

- Validar nombres duplicados.
- Validar SKUs duplicados.
- Confirmar unidades y categorias existentes.
- Confirmar precios y saldos con el cliente.
- Guardar archivo original entregado por el cliente.

