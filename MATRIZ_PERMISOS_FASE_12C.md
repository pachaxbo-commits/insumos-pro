# MATRIZ_PERMISOS_FASE_12C

Leyenda: L = leer, C = crear, E = editar/desactivar, X = confirmar/ejecutar operacion critica.

| Tabla / modulo | administrador | ventas | inventario | finanzas | notas |
| --- | --- | --- | --- | --- | --- |
| `profiles` | L, E via RPC/server | propio L | propio L | propio L | Rol/estado solo por `admin_update_profile` y Server Actions admin. |
| Supabase Auth users | L, C, E server-only | No | No | No | Requiere `SUPABASE_SERVICE_ROLE_KEY` privada. |
| `audit_logs` | L | No directo | No directo | No directo | Inserts solo desde servidor con service role. |
| `products` | L, C, E | L | L, C, E | No | Stock no debe editarse manualmente para operaciones reales. |
| `product_categories` | L, C, E | L | L, C, E | No | Gestion de catalogo. |
| `units_of_measure` | L, C, E | L | L, C, E | No | Gestion de catalogo. |
| `inventory_movements` | L, X via RPC/action | L | L, X via RPC/action | No | No inserts directos cliente. |
| `suppliers` | L, C, E | No | L, C, E | L | Finanzas lectura por compras/cuentas. |
| `purchases` | L, C, E borrador, X confirmar/cancelar | No | L, C, E borrador, X confirmar/cancelar | L | Confirmacion genera inventario una sola vez. |
| `purchase_items` | L, C via compra | No | L, C via compra | L | No mutacion directa suelta. |
| `customers` | L, C, E | L, C, E | No | L | Ventas gestiona clientes; finanzas usa cartera. |
| `sales` | L, C, E borrador, X confirmar/cancelar | L, C, E borrador, X confirmar/cancelar | L | L | Confirmacion descuenta stock y valida credito. |
| `sale_items` | L, C via venta | L, C via venta | L | L | No mutacion directa suelta. |
| `accounts_receivable` | L, X pagos | L lectura operativa | No | L, X pagos | Pagos actualizan cliente y caja. |
| `accounts_payable` | L, X pagos | No | L lectura compra | L, X pagos | Pagos actualizan cuenta y caja. |
| `payments` | L, X via action | No | No | L, X via action | No inserts directos cliente. |
| `cash_movements` | L, X via action | No | No | L, X via action | No inserts directos cliente. |
| `/reportes` | Completo | ventas/clientes/inventario basico | inventario/compras/productos | completo financiero/comercial | Exportaciones respetan rol. |

## Reglas de seguridad clave

- Ocultar botones no es suficiente: cada Server Action valida rol.
- `SUPABASE_SERVICE_ROLE_KEY` solo existe en servidor.
- Usuarios inactivos no deben operar: `current_user_role()` exige `is_active = true`.
- Un administrador no puede quitarse su propio rol ni desactivarse.
- Debe existir al menos un administrador activo.
