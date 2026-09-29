-- Add the inventory movement RPC required by the Products stock adjustment flow.
-- This migration intentionally does not recreate tables or apply historical schema files.

create or replace function public.register_inventory_movement(
  p_product_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_reason text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_stock_before numeric(14, 3);
  v_stock_after numeric(14, 3);
  v_quantity numeric(14, 3);
  v_movement_id uuid;
begin
  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select p.role
    into v_user_role
    from public.profiles p
   where p.id = v_user_id
     and p.is_active = true;

  if v_user_role is null or v_user_role not in ('administrador', 'inventario') then
    raise exception 'No tienes permisos para registrar movimientos de inventario.';
  end if;

  if p_product_id is null then
    raise exception 'Selecciona un producto.';
  end if;

  if p_movement_type not in ('entrada', 'salida', 'ajuste', 'merma', 'devolucion') then
    raise exception 'Tipo de movimiento invalido.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor a cero.';
  end if;

  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'El motivo del movimiento es obligatorio.';
  end if;

  select p.stock_current
    into v_stock_before
    from public.products p
   where p.id = p_product_id
     and p.is_active = true
   for update;

  if v_stock_before is null then
    raise exception 'Producto no encontrado o inactivo.';
  end if;

  if p_movement_type in ('entrada', 'devolucion') then
    v_stock_after := v_stock_before + p_quantity;
    v_quantity := p_quantity;
  elsif p_movement_type in ('salida', 'merma') then
    v_stock_after := v_stock_before - p_quantity;
    v_quantity := p_quantity;
  else
    v_stock_after := p_quantity;
    v_quantity := abs(v_stock_after - v_stock_before);

    if v_quantity = 0 then
      raise exception 'El ajuste no cambia el stock actual.';
    end if;
  end if;

  insert into public.inventory_movements (
    product_id,
    movement_type,
    quantity,
    stock_before,
    stock_after,
    reason,
    notes,
    created_by
  ) values (
    p_product_id,
    p_movement_type,
    v_quantity,
    v_stock_before,
    v_stock_after,
    btrim(p_reason),
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_user_id
  ) returning id into v_movement_id;

  update public.products
     set stock_current = v_stock_after
   where id = p_product_id;

  return v_movement_id;
end;
$$;

revoke all on function public.register_inventory_movement(uuid, text, numeric, text, text) from public;
grant execute on function public.register_inventory_movement(uuid, text, numeric, text, text) to authenticated;

comment on function public.register_inventory_movement(uuid, text, numeric, text, text)
  is 'Registra un movimiento auditado y actualiza stock_current. No crea pedidos, entregas, recibos ni ventas.';
