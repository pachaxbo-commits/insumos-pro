# LIMPIEZA_DATOS_DEMO

## Advertencia principal

Este documento describe operaciones destructivas. No es una rutina diaria ni debe ejecutarse por costumbre.

Antes de cualquier limpieza:

- Confirmar por escrito que se trabajara en el proyecto Supabase correcto.
- Confirmar URL del proyecto, nombre del entorno y responsable.
- Crear backup y verificar que el backup termino correctamente.
- Obtener aprobacion explicita del responsable del cliente o del lider tecnico.
- Hacer primero la prueba en staging.
- No ejecutar si el sistema ya tiene operacion real sin una ventana aprobada.

## Que NO borrar

- Usuarios de Supabase Auth.
- Perfil del administrador real en `public.profiles`.
- Variables de entorno.
- SQL de estructura.
- Categorias o unidades aprobadas por el cliente, si se reutilizaran en produccion.

## Orden seguro de limpieza

Limpiar primero tablas transaccionales y luego datos maestros opcionales.

1. `audit_logs`
2. `cash_movements`
3. `payments`
4. `accounts_receivable`
5. `accounts_payable`
6. `sale_items`
7. `sales`
8. `purchase_items`
9. `purchases`
10. `inventory_movements`
11. `products` si el catalogo demo no se usara
12. `customers` si los clientes demo no se usaran
13. `suppliers` si los proveedores demo no se usaran
14. `product_categories` si las categorias demo no se usaran
15. `units_of_measure` si las unidades demo no se usaran

## SQL de referencia para limpiar transacciones

No copiar y ejecutar sin revision. Este bloque es una referencia tecnica para staging o para una limpieza aprobada antes de la salida a produccion.

Checklist obligatorio antes de ejecutar:

- [ ] Estoy en el proyecto Supabase correcto.
- [ ] La URL del proyecto coincide con el entorno objetivo.
- [ ] El entorno no contiene operacion real que deba conservarse.
- [ ] Hay backup confirmado y descargable.
- [ ] Existe aprobacion explicita para ejecutar SQL destructivo.
- [ ] Otra persona reviso el SQL y el entorno.

```sql
begin;

truncate table public.audit_logs restart identity cascade;
truncate table public.cash_movements restart identity cascade;
truncate table public.payments restart identity cascade;
truncate table public.accounts_receivable restart identity cascade;
truncate table public.accounts_payable restart identity cascade;
truncate table public.sale_items restart identity cascade;
truncate table public.sales restart identity cascade;
truncate table public.purchase_items restart identity cascade;
truncate table public.purchases restart identity cascade;
truncate table public.inventory_movements restart identity cascade;

update public.products
set stock_current = 0,
    updated_at = now();

commit;
```

## SQL opcional para limpiar datos maestros

Usar solo si se cargara todo desde cero y el cliente aprobo borrar catalogos, clientes y proveedores. No ejecutar en una operacion real sin validacion completa.

```sql
begin;

truncate table public.products restart identity cascade;
truncate table public.customers restart identity cascade;
truncate table public.suppliers restart identity cascade;
truncate table public.product_categories restart identity cascade;
truncate table public.units_of_measure restart identity cascade;

commit;
```

## Conservacion de administrador

La tabla `profiles` no debe truncarse. Si hace falta desactivar usuarios no reales, hacerlo caso por caso:

```sql
update public.profiles
set is_active = false,
    updated_at = now()
where role <> 'administrador'
  and id <> 'UUID_ADMIN_REAL';
```

## Validacion despues de limpiar

- Entrar con usuario administrador.
- Ver que dashboard no muestre operaciones demo.
- Confirmar que productos tengan stock cero si se conservaron.
- Confirmar que no hay ventas, compras, pagos ni movimientos historicos.
- Registrar un movimiento de stock inicial de prueba y revertirlo solo en entorno de prueba.

## Regla de produccion

En produccion real, preferir migraciones controladas y desactivacion logica antes que `truncate`. Si ya existen ventas, compras, pagos o movimientos reales, detenerse y disenar un plan de migracion especifico.
