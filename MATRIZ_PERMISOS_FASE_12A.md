# MATRIZ_PERMISOS_FASE_12A

## Principio aplicado

Las tablas operativas criticas no aceptan mutaciones directas desde Supabase Client. Las operaciones que cambian stock, saldos, caja o estados usan RPCs validadas y Server Actions con verificacion de rol.

## Roles

| Rol | Alcance general |
| --- | --- |
| administrador | Acceso completo funcional y lectura de bitacora |
| ventas | Gestiona clientes y ventas; lectura de productos/inventario basico |
| inventario | Gestiona productos, inventario, proveedores y compras |
| finanzas | Gestiona cuentas, pagos, caja y reportes financieros |

## Matriz por tabla

| Tabla | administrador | ventas | inventario | finanzas | Mutacion segura |
| --- | --- | --- | --- | --- | --- |
| `profiles` | Lee todos; administra por RPC | Lee propio perfil | Lee propio perfil | Lee propio perfil | `admin_update_profile` |
| `product_categories` | Crear/editar | Leer | Crear/editar | Sin acceso directo | Server Actions de productos |
| `units_of_measure` | Crear/editar | Leer | Crear/editar | Sin acceso directo | Server Actions de productos |
| `products` | Crear/editar/desactivar | Leer | Crear/editar/desactivar | Sin acceso directo | Server Actions de productos |
| `inventory_movements` | Leer; crear por RPC | Leer | Leer; crear por RPC | Sin acceso directo | `register_inventory_movement`, `confirm_purchase`, `confirm_sale` |
| `suppliers` | Crear/editar/desactivar | Sin acceso directo | Crear/editar/desactivar | Leer segun compras/finanzas | Server Actions de proveedores |
| `purchases` | Leer; crear/confirmar/cancelar por RPC | Sin acceso directo | Leer; crear/confirmar/cancelar por RPC | Leer | `create_purchase_draft`, `confirm_purchase`, `cancel_purchase_draft` |
| `purchase_items` | Leer; crear por RPC | Sin acceso directo | Leer; crear por RPC | Leer | `create_purchase_draft` |
| `customers` | Crear/editar/desactivar | Crear/editar/desactivar | Sin acceso directo | Leer | Server Actions de clientes |
| `sales` | Leer; crear/confirmar/cancelar por RPC | Leer; crear/confirmar/cancelar por RPC | Leer | Leer | `create_sale_draft`, `confirm_sale`, `cancel_sale_draft` |
| `sale_items` | Leer; crear por RPC | Leer; crear por RPC | Leer | Leer | `create_sale_draft` |
| `accounts_receivable` | Leer; actualizar por RPC | Leer | Sin acceso directo | Leer; actualizar por RPC | `confirm_sale`, `register_customer_payment` |
| `accounts_payable` | Leer; actualizar por RPC | Sin acceso directo | Sin acceso directo | Leer; actualizar por RPC | `confirm_purchase`, `register_supplier_payment` |
| `payments` | Leer; crear por RPC | Sin acceso directo | Sin acceso directo | Leer; crear por RPC | `register_customer_payment`, `register_supplier_payment`, `register_manual_cash_movement`, confirmaciones |
| `cash_movements` | Leer; crear por RPC | Sin acceso directo | Sin acceso directo | Leer; crear por RPC | RPCs financieras y confirmaciones |
| `audit_logs` | Leer; insertar propio evento | Insertar propio evento | Insertar propio evento | Insertar propio evento | Server Actions con `writeAuditLog` |

## Operaciones de confirmacion

| Operacion | Roles permitidos | Garantias |
| --- | --- | --- |
| Confirmar compra | administrador, inventario | Bloquea doble confirmacion, genera entrada de inventario, CxP o caja |
| Confirmar venta | administrador, ventas | Bloquea doble confirmacion, bloquea stock negativo, valida credito, genera CxC o caja |
| Registrar cobro | administrador, finanzas | Bloquea pago mayor al saldo, actualiza cliente, pagos y caja |
| Registrar pago proveedor | administrador, finanzas | Bloquea pago mayor al saldo, actualiza CxP, pagos y caja |
| Movimiento manual de caja | administrador, finanzas | Registra pago y movimiento de caja |
| Movimiento manual inventario | administrador, inventario | Bloquea stock negativo y registra antes/despues |

## Notas

- No usar `service_role` en cliente ni en variables `NEXT_PUBLIC_*`.
- La gestion de perfiles no tiene UI productiva en esta fase; se hace por Supabase Auth + RPC protegida.
- Compras y ventas confirmadas no se editan ni eliminan; correcciones por movimientos compensatorios auditados.

