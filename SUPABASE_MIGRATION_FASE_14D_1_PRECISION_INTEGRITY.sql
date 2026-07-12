-- Fase 14D.1 - Precision decimal e integridad de clasificacion
-- PENDIENTE DE APLICAR EN SUPABASE STAGING DESPUES DE FASE 14D.
-- No ejecutar en produccion sin backup y validacion completa en staging.

begin;

-- Las cantidades fisicas conservan tres decimales. Los importes siguen en dos.
alter table public.products
  alter column stock_current type numeric(14, 3) using stock_current::numeric(14, 3),
  alter column stock_min type numeric(14, 3) using stock_min::numeric(14, 3);

alter table public.inventory_movements
  alter column quantity type numeric(14, 3) using quantity::numeric(14, 3),
  alter column stock_before type numeric(14, 3) using stock_before::numeric(14, 3),
  alter column stock_after type numeric(14, 3) using stock_after::numeric(14, 3);

alter table public.sale_items
  alter column quantity type numeric(14, 3) using quantity::numeric(14, 3);

alter table public.purchase_items
  alter column quantity type numeric(14, 3) using quantity::numeric(14, 3),
  alter column unit_cost type numeric(14, 4) using unit_cost::numeric(14, 4);

alter table public.order_items
  alter column requested_quantity type numeric(14, 3) using requested_quantity::numeric(14, 3),
  alter column actual_quantity type numeric(14, 3) using actual_quantity::numeric(14, 3);

alter table public.purchase_batch_lines
  alter column quantity type numeric(14, 3) using quantity::numeric(14, 3);

alter table public.purchase_batch_line_classifications
  alter column base_quantity type numeric(14, 3) using base_quantity::numeric(14, 3),
  alter column waste_quantity type numeric(14, 3) using waste_quantity::numeric(14, 3);

alter table public.purchase_batch_classification_results
  alter column quantity type numeric(14, 3) using quantity::numeric(14, 3),
  alter column unit_cost type numeric(14, 4) using unit_cost::numeric(14, 4);

alter table public.purchase_batch_lines
  add column if not exists line_revision integer not null default 1;

alter table public.purchase_batch_line_classifications
  add column if not exists line_revision integer not null default 1;

alter table public.purchase_batch_lines
  drop constraint if exists purchase_batch_lines_line_revision_check;

alter table public.purchase_batch_lines
  add constraint purchase_batch_lines_line_revision_check check (line_revision > 0);

alter table public.purchase_batch_line_classifications
  drop constraint if exists purchase_batch_line_classifications_line_revision_check;

alter table public.purchase_batch_line_classifications
  add constraint purchase_batch_line_classifications_line_revision_check check (line_revision > 0);

update public.purchase_batch_line_classifications classification
set line_revision = line.line_revision
from public.purchase_batch_lines line
where line.id = classification.batch_line_id;

-- El trigger toma snapshots reales y elimina la clasificacion anterior en la
-- misma transaccion cuando cambia producto, cantidad, unidad, costo o flag.
create or replace function public.prepare_purchase_batch_line()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product record;
  v_supplier_name text;
  v_batch_status text;
  v_relevant_change boolean := false;
begin
  if tg_op = 'UPDATE' and new.batch_id is distinct from old.batch_id then
    raise exception 'No se puede mover una linea a otra compra multiple.';
  end if;

  select batch.status
  into v_batch_status
  from public.purchase_batches batch
  where batch.id = new.batch_id
  for update;

  if not found then
    raise exception 'Compra multiple no encontrada.';
  end if;

  if v_batch_status <> 'borrador' then
    raise exception 'Solo se pueden editar lineas de compras multiples en borrador.';
  end if;

  select
    product.name,
    product.requires_classification,
    unit.name as unit_name,
    unit.abbreviation as unit_abbreviation
  into v_product
  from public.products product
  left join public.units_of_measure unit on unit.id = product.unit_id
  where product.id = new.product_id
    and product.is_active = true;

  if not found then
    raise exception 'Producto no encontrado o inactivo.';
  end if;

  select supplier.name
  into v_supplier_name
  from public.suppliers supplier
  where supplier.id = new.supplier_id
    and supplier.is_active = true;

  if not found then
    raise exception 'Proveedor no encontrado o inactivo.';
  end if;

  if tg_op = 'INSERT' then
    new.line_revision := 1;
  else
    v_relevant_change :=
      old.product_id is distinct from new.product_id
      or old.quantity is distinct from new.quantity
      or old.unit_cost is distinct from new.unit_cost
      or old.unit_name is distinct from v_product.unit_name
      or old.unit_abbreviation is distinct from v_product.unit_abbreviation
      or old.requires_classification is distinct from v_product.requires_classification;

    if v_relevant_change then
      delete from public.purchase_batch_line_classifications
      where batch_line_id = old.id;

      new.line_revision := old.line_revision + 1;
    else
      new.line_revision := old.line_revision;
    end if;
  end if;

  new.product_name := v_product.name;
  new.supplier_name := v_supplier_name;
  new.unit_name := v_product.unit_name;
  new.unit_abbreviation := v_product.unit_abbreviation;
  new.requires_classification := v_product.requires_classification;

  return new;
end;
$$;

drop trigger if exists prepare_purchase_batch_line_integrity
on public.purchase_batch_lines;

create trigger prepare_purchase_batch_line_integrity
before insert or update on public.purchase_batch_lines
for each row
execute function public.prepare_purchase_batch_line();

create or replace function public.guard_purchase_batch_line_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_status text;
begin
  select batch.status
  into v_batch_status
  from public.purchase_batches batch
  where batch.id = old.batch_id
  for update;

  if not found or v_batch_status <> 'borrador' then
    raise exception 'Solo se pueden eliminar lineas de compras multiples en borrador.';
  end if;

  return old;
end;
$$;

drop trigger if exists guard_purchase_batch_line_delete
on public.purchase_batch_lines;

create trigger guard_purchase_batch_line_delete
before delete on public.purchase_batch_lines
for each row
execute function public.guard_purchase_batch_line_delete();

-- Si cambia el producto maestro, los borradores se sincronizan y cualquier
-- clasificacion que ya no represente la linea queda invalidada atomicamente.
create or replace function public.sync_draft_batch_lines_from_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit_name text;
  v_unit_abbreviation text;
begin
  select unit.name, unit.abbreviation
  into v_unit_name, v_unit_abbreviation
  from public.units_of_measure unit
  where unit.id = new.unit_id;

  update public.purchase_batch_lines line
  set product_name = new.name,
      unit_name = v_unit_name,
      unit_abbreviation = v_unit_abbreviation,
      requires_classification = new.requires_classification
  from public.purchase_batches batch
  where line.product_id = new.id
    and batch.id = line.batch_id
    and batch.status = 'borrador';

  return new;
end;
$$;

drop trigger if exists sync_draft_batch_lines_from_product
on public.products;

create trigger sync_draft_batch_lines_from_product
after update of name, unit_id, requires_classification on public.products
for each row
when (
  old.name is distinct from new.name
  or old.unit_id is distinct from new.unit_id
  or old.requires_classification is distinct from new.requires_classification
)
execute function public.sync_draft_batch_lines_from_product();

create or replace function public.sync_draft_batch_lines_from_unit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.purchase_batch_lines line
  set unit_name = new.name,
      unit_abbreviation = new.abbreviation
  from public.purchase_batches batch,
       public.products product
  where product.unit_id = new.id
    and line.product_id = product.id
    and batch.id = line.batch_id
    and batch.status = 'borrador';

  return new;
end;
$$;

drop trigger if exists sync_draft_batch_lines_from_unit
on public.units_of_measure;

create trigger sync_draft_batch_lines_from_unit
after update of name, abbreviation on public.units_of_measure
for each row
when (
  old.name is distinct from new.name
  or old.abbreviation is distinct from new.abbreviation
)
execute function public.sync_draft_batch_lines_from_unit();

revoke all on function public.prepare_purchase_batch_line() from public, anon, authenticated;
revoke all on function public.guard_purchase_batch_line_delete() from public, anon, authenticated;
revoke all on function public.sync_draft_batch_lines_from_product() from public, anon, authenticated;
revoke all on function public.sync_draft_batch_lines_from_unit() from public, anon, authenticated;

drop policy if exists "Purchase managers can delete draft line classifications"
on public.purchase_batch_line_classifications;
revoke delete on table public.purchase_batch_line_classifications from anon, authenticated;

-- El cliente solo puede enviar campos operativos. Snapshots, revision y flag
-- de clasificacion quedan bajo control de los triggers.
revoke insert, update on table public.purchase_batch_lines from anon, authenticated;

grant insert (
  batch_id,
  product_id,
  supplier_id,
  quantity,
  unit_cost,
  payment_method,
  notes,
  sort_order
) on table public.purchase_batch_lines to authenticated;

grant update (
  product_id,
  supplier_id,
  quantity,
  unit_cost,
  payment_method,
  notes,
  sort_order
) on table public.purchase_batch_lines to authenticated;

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
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user_role text;
  v_stock_before numeric(14, 3);
  v_stock_after numeric(14, 3);
  v_quantity numeric(14, 3);
  v_movement_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role
  into v_user_role
  from public.profiles
  where id = v_user_id
    and is_active = true;

  if v_user_role is null or v_user_role not in ('administrador', 'inventario') then
    raise exception 'No tienes permisos para registrar movimientos de inventario.';
  end if;

  if p_movement_type not in ('entrada', 'salida', 'ajuste', 'merma', 'devolucion') then
    raise exception 'Tipo de movimiento invalido.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor a cero.';
  end if;

  select stock_current
  into v_stock_before
  from public.products
  where id = p_product_id
    and is_active = true
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

  if v_stock_after < 0 then
    raise exception 'El movimiento dejaria stock negativo. Ajusta la cantidad.';
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
  )
  values (
    p_product_id,
    p_movement_type,
    v_quantity,
    v_stock_before,
    v_stock_after,
    trim(p_reason),
    nullif(trim(coalesce(p_notes, '')), ''),
    v_user_id
  )
  returning id into v_movement_id;

  update public.products
  set stock_current = v_stock_after
  where id = p_product_id;

  return v_movement_id;
end;
$$;

create or replace function public.create_purchase_draft(
  p_supplier_id uuid,
  p_purchase_date date,
  p_payment_status text,
  p_payment_method text,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user_role text;
  v_purchase_id uuid;
  v_total numeric(14, 2) := 0;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric(14, 3);
  v_unit_cost numeric(14, 4);
  v_subtotal numeric(14, 2);
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role into v_user_role
  from public.profiles
  where id = v_user_id
    and is_active = true;

  if v_user_role is null or v_user_role not in ('administrador', 'inventario') then
    raise exception 'No tienes permisos para crear compras.';
  end if;

  if p_payment_status not in ('pagada', 'pendiente', 'parcial') then
    raise exception 'Estado de pago invalido.';
  end if;

  if p_payment_method not in ('efectivo', 'transferencia', 'qr', 'credito') then
    raise exception 'Metodo de pago invalido.';
  end if;

  if not exists (select 1 from public.suppliers where id = p_supplier_id and is_active = true) then
    raise exception 'Proveedor no encontrado o inactivo.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un item a la compra.';
  end if;

  insert into public.purchases (
    supplier_id,
    purchase_date,
    status,
    payment_status,
    payment_method,
    subtotal,
    total,
    notes,
    created_by
  )
  values (
    p_supplier_id,
    p_purchase_date,
    'borrador',
    p_payment_status,
    p_payment_method,
    0,
    0,
    nullif(trim(coalesce(p_notes, '')), ''),
    v_user_id
  )
  returning id into v_purchase_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::numeric;
    v_unit_cost := (v_item ->> 'unit_cost')::numeric;

    if v_quantity <= 0 then
      raise exception 'La cantidad de un item debe ser mayor a cero.';
    end if;

    if v_unit_cost < 0 then
      raise exception 'El costo unitario no puede ser negativo.';
    end if;

    if not exists (select 1 from public.products where id = v_product_id and is_active = true) then
      raise exception 'Producto no encontrado o inactivo.';
    end if;

    v_subtotal := round(v_quantity * v_unit_cost, 2);
    v_total := v_total + v_subtotal;

    insert into public.purchase_items (
      purchase_id,
      product_id,
      quantity,
      unit_cost,
      subtotal
    )
    values (
      v_purchase_id,
      v_product_id,
      v_quantity,
      v_unit_cost,
      v_subtotal
    );
  end loop;

  update public.purchases
  set subtotal = v_total,
      total = v_total
  where id = v_purchase_id;

  return v_purchase_id;
end;
$$;

create or replace function public.create_sale_draft(
  p_customer_id uuid,
  p_sale_date date,
  p_payment_type text,
  p_discount numeric,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user_role text;
  v_sale_id uuid;
  v_subtotal numeric(14, 2) := 0;
  v_discount numeric(14, 2) := coalesce(p_discount, 0);
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric(14, 3);
  v_unit_price numeric(14, 2);
  v_item_subtotal numeric(14, 2);
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role into v_user_role
  from public.profiles
  where id = v_user_id
    and is_active = true;

  if v_user_role is null or v_user_role not in ('administrador', 'ventas') then
    raise exception 'No tienes permisos para crear ventas.';
  end if;

  if p_payment_type not in ('contado', 'transferencia', 'qr', 'credito') then
    raise exception 'Metodo de pago invalido.';
  end if;

  if v_discount < 0 then
    raise exception 'El descuento no puede ser negativo.';
  end if;

  if not exists (select 1 from public.customers where id = p_customer_id and is_active = true) then
    raise exception 'Cliente no encontrado o inactivo.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un item a la venta.';
  end if;

  insert into public.sales (
    customer_id,
    sale_date,
    subtotal,
    discount,
    total,
    payment_type,
    status,
    notes,
    created_by
  )
  values (
    p_customer_id,
    p_sale_date,
    0,
    v_discount,
    0,
    p_payment_type,
    'borrador',
    nullif(trim(coalesce(p_notes, '')), ''),
    v_user_id
  )
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::numeric;
    v_unit_price := (v_item ->> 'unit_price')::numeric;

    if v_quantity <= 0 then
      raise exception 'La cantidad de un item debe ser mayor a cero.';
    end if;

    if v_unit_price < 0 then
      raise exception 'El precio unitario no puede ser negativo.';
    end if;

    if not exists (select 1 from public.products where id = v_product_id and is_active = true) then
      raise exception 'Producto no encontrado o inactivo.';
    end if;

    v_item_subtotal := round(v_quantity * v_unit_price, 2);
    v_subtotal := v_subtotal + v_item_subtotal;

    insert into public.sale_items (
      sale_id,
      product_id,
      quantity,
      unit_price,
      subtotal
    )
    values (
      v_sale_id,
      v_product_id,
      v_quantity,
      v_unit_price,
      v_item_subtotal
    );
  end loop;

  if v_discount > v_subtotal then
    raise exception 'El descuento no puede superar el subtotal.';
  end if;

  update public.sales
  set subtotal = v_subtotal,
      discount = v_discount,
      total = v_subtotal - v_discount
  where id = v_sale_id;

  return v_sale_id;
end;
$$;

create or replace function public.confirm_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user_role text;
  v_sale record;
  v_customer record;
  v_item record;
  v_stock_before numeric(14, 3);
  v_stock_after numeric(14, 3);
  v_payment_method text;
  v_payment_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role into v_user_role
  from public.profiles
  where id = v_user_id
    and is_active = true;

  if v_user_role is null or v_user_role not in ('administrador', 'ventas') then
    raise exception 'No tienes permisos para confirmar ventas.';
  end if;

  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'Venta no encontrada.';
  end if;

  if v_sale.status = 'confirmada' then
    raise exception 'La venta ya fue confirmada.';
  end if;

  if v_sale.status <> 'borrador' then
    raise exception 'Solo se pueden confirmar ventas en borrador.';
  end if;

  if not exists (select 1 from public.sale_items where sale_id = p_sale_id) then
    raise exception 'La venta no tiene items.';
  end if;

  select *
  into v_customer
  from public.customers
  where id = v_sale.customer_id
    and is_active = true
  for update;

  if not found then
    raise exception 'Cliente no encontrado o inactivo.';
  end if;

  if v_sale.payment_type = 'credito' then
    if v_customer.customer_type <> 'credito' then
      raise exception 'El cliente no esta habilitado para ventas a credito.';
    end if;

    if v_customer.current_balance + v_sale.total > v_customer.credit_limit then
      raise exception 'La venta supera el limite de credito del cliente.';
    end if;
  end if;

  for v_item in
    select product_id, quantity
    from public.sale_items
    where sale_id = p_sale_id
  loop
    select stock_current
    into v_stock_before
    from public.products
    where id = v_item.product_id
      and is_active = true
    for update;

    if not found then
      raise exception 'Producto no encontrado o inactivo.';
    end if;

    v_stock_after := v_stock_before - v_item.quantity;

    if v_stock_after < 0 then
      raise exception 'Stock insuficiente para confirmar la venta.';
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
    )
    values (
      v_item.product_id,
      'salida',
      v_item.quantity,
      v_stock_before,
      v_stock_after,
      'Venta confirmada',
      'Venta ' || p_sale_id::text,
      v_user_id
    );

    update public.products
    set stock_current = v_stock_after
    where id = v_item.product_id;
  end loop;

  if v_sale.payment_type = 'credito' then
    update public.customers
    set current_balance = current_balance + v_sale.total
    where id = v_sale.customer_id;

    insert into public.accounts_receivable (
      sale_id,
      customer_id,
      amount,
      paid_amount,
      balance,
      due_date,
      status,
      notes
    )
    values (
      p_sale_id,
      v_sale.customer_id,
      v_sale.total,
      0,
      v_sale.total,
      v_sale.sale_date + 15,
      public.get_finance_status(v_sale.total, v_sale.total, v_sale.sale_date + 15),
      'Venta a credito'
    );
  else
    v_payment_method := case
      when v_sale.payment_type = 'contado' then 'efectivo'
      when v_sale.payment_type in ('transferencia', 'qr') then v_sale.payment_type
      else 'otro'
    end;

    insert into public.payments (
      payment_type,
      customer_id,
      sale_id,
      amount,
      payment_method,
      payment_date,
      notes,
      created_by
    )
    values (
      'cobro_cliente',
      v_sale.customer_id,
      p_sale_id,
      v_sale.total,
      v_payment_method,
      v_sale.sale_date,
      'Venta de contado confirmada',
      v_user_id
    )
    returning id into v_payment_id;

    insert into public.cash_movements (
      movement_type,
      source_type,
      source_id,
      amount,
      payment_method,
      movement_date,
      notes,
      created_by
    )
    values (
      'ingreso',
      'venta',
      v_payment_id,
      v_sale.total,
      v_payment_method,
      v_sale.sale_date,
      'Venta confirmada',
      v_user_id
    );
  end if;

  update public.sales
  set status = 'confirmada'
  where id = p_sale_id;
end;
$$;

create or replace function public.cancel_confirmed_sale(
  p_sale_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_sale record;
  v_item record;
  v_account record;
  v_stock_before numeric(14, 3);
  v_stock_after numeric(14, 3);
  v_payment_count integer;
  v_payment_method text;
  v_now timestamptz;
begin
  v_user_id := public.assert_admin_role();
  v_now := timezone('utc', now());

  if p_sale_id is null then
    raise exception 'Venta invalida.';
  end if;

  if length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'El motivo de anulacion debe tener al menos 10 caracteres.';
  end if;

  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'Venta no encontrada.';
  end if;

  if v_sale.reversal_status = 'reversed' or v_sale.status = 'anulada' then
    raise exception 'La venta ya fue anulada y no puede revertirse nuevamente.';
  end if;

  if v_sale.status <> 'confirmada' then
    raise exception 'Solo se pueden anular ventas confirmadas.';
  end if;

  if not exists (select 1 from public.sale_items where sale_id = p_sale_id) then
    raise exception 'La venta no tiene items para revertir.';
  end if;

  if v_sale.payment_type = 'credito' then
    select *
    into v_account
    from public.accounts_receivable
    where sale_id = p_sale_id
    for update;

    if not found then
      raise exception 'No se encontro la cuenta por cobrar de la venta a credito.';
    end if;

    select count(*)
    into v_payment_count
    from public.payments
    where accounts_receivable_id = v_account.id
       or sale_id = p_sale_id;

    if coalesce(v_account.paid_amount, 0) > 0 or v_payment_count > 0 then
      raise exception 'La venta tiene pagos aplicados. Reversa o regulariza esos pagos antes de anular automaticamente.';
    end if;
  end if;

  for v_item in
    select product_id, quantity
    from public.sale_items
    where sale_id = p_sale_id
  loop
    select stock_current
    into v_stock_before
    from public.products
    where id = v_item.product_id
    for update;

    if not found then
      raise exception 'Producto no encontrado al revertir stock de venta.';
    end if;

    v_stock_after := v_stock_before + v_item.quantity;

    insert into public.inventory_movements (
      product_id,
      movement_type,
      quantity,
      stock_before,
      stock_after,
      reason,
      notes,
      created_by
    )
    values (
      v_item.product_id,
      'devolucion',
      v_item.quantity,
      v_stock_before,
      v_stock_after,
      'Anulacion de venta confirmada',
      'Anulacion venta ' || p_sale_id::text || '. Motivo: ' || trim(p_reason),
      v_user_id
    );

    update public.products
    set stock_current = v_stock_after
    where id = v_item.product_id;
  end loop;

  if v_sale.payment_type = 'credito' then
    update public.customers
    set current_balance = greatest(current_balance - v_account.balance, 0)
    where id = v_sale.customer_id;

    update public.accounts_receivable
    set balance = 0,
        paid_amount = 0,
        status = 'anulada',
        notes = concat_ws(' | ', nullif(notes, ''), 'Anulada por venta ' || p_sale_id::text || ': ' || trim(p_reason))
    where id = v_account.id;
  else
    v_payment_method := case
      when v_sale.payment_type = 'contado' then 'efectivo'
      when v_sale.payment_type in ('transferencia', 'qr') then v_sale.payment_type
      else 'otro'
    end;

    insert into public.cash_movements (
      movement_type,
      source_type,
      source_id,
      amount,
      payment_method,
      movement_date,
      notes,
      created_by
    )
    values (
      'egreso',
      'venta',
      p_sale_id,
      v_sale.total,
      v_payment_method,
      current_date,
      'Reversion de caja por anulacion de venta. Motivo: ' || trim(p_reason),
      v_user_id
    );
  end if;

  update public.sales
  set status = 'anulada',
      reversal_status = 'reversed',
      canceled_reason = trim(p_reason),
      canceled_by = v_user_id,
      canceled_at = v_now
  where id = p_sale_id;

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_user_id,
    'cancel_confirmed_sale',
    'sale',
    p_sale_id,
    jsonb_build_object(
      'reason', trim(p_reason),
      'total', v_sale.total,
      'payment_type', v_sale.payment_type,
      'reversal_status', 'reversed'
    )
  );
end;
$$;

create or replace function public.cancel_confirmed_purchase(
  p_purchase_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_purchase record;
  v_item record;
  v_account record;
  v_stock_before numeric(14, 3);
  v_stock_after numeric(14, 3);
  v_entry_created_at timestamptz;
  v_payment_count integer;
  v_now timestamptz;
  v_has_account boolean := false;
begin
  v_user_id := public.assert_admin_role();
  v_now := timezone('utc', now());

  if p_purchase_id is null then
    raise exception 'Compra invalida.';
  end if;

  if length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'El motivo de anulacion debe tener al menos 10 caracteres.';
  end if;

  select *
  into v_purchase
  from public.purchases
  where id = p_purchase_id
  for update;

  if not found then
    raise exception 'Compra no encontrada.';
  end if;

  if v_purchase.reversal_status = 'reversed' or v_purchase.status = 'cancelada' then
    raise exception 'La compra ya fue anulada y no puede revertirse nuevamente.';
  end if;

  if v_purchase.status <> 'confirmada' then
    raise exception 'Solo se pueden anular compras confirmadas.';
  end if;

  if v_purchase.payment_status in ('pagada', 'parcial') then
    raise exception 'La compra tiene estado de pago aplicado. Regulariza o reversa pagos antes de anular automaticamente.';
  end if;

  select count(*)
  into v_payment_count
  from public.payments
  where purchase_id = p_purchase_id;

  if v_payment_count > 0 then
    raise exception 'La compra tiene pagos registrados. Reversa o regulariza esos pagos antes de anular automaticamente.';
  end if;

  select *
  into v_account
  from public.accounts_payable
  where purchase_id = p_purchase_id
  for update;

  if found then
    v_has_account := true;

    if coalesce(v_account.paid_amount, 0) > 0 then
      raise exception 'La cuenta por pagar tiene pagos aplicados. Regulariza esos pagos antes de anular automaticamente.';
    end if;
  end if;

  for v_item in
    select product_id, quantity
    from public.purchase_items
    where purchase_id = p_purchase_id
  loop
    select max(created_at)
    into v_entry_created_at
    from public.inventory_movements
    where product_id = v_item.product_id
      and movement_type = 'entrada'
      and reason = 'Compra confirmada'
      and notes = 'Compra ' || p_purchase_id::text;

    if v_entry_created_at is null then
      raise exception 'No se encontro el movimiento original de inventario para esta compra.';
    end if;

    if exists (
      select 1
      from public.inventory_movements
      where product_id = v_item.product_id
        and created_at > v_entry_created_at
        and not (
          reason = 'Compra confirmada'
          and notes = 'Compra ' || p_purchase_id::text
        )
    ) then
      raise exception 'Existen movimientos posteriores sobre productos de esta compra. Requiere devolucion o ajuste controlado antes de anular.';
    end if;

    select stock_current
    into v_stock_before
    from public.products
    where id = v_item.product_id
    for update;

    if not found then
      raise exception 'Producto no encontrado al revertir stock de compra.';
    end if;

    if v_stock_before < v_item.quantity then
      raise exception 'Stock insuficiente para revertir la compra sin dejar inventario negativo.';
    end if;

    v_stock_after := v_stock_before - v_item.quantity;

    insert into public.inventory_movements (
      product_id,
      movement_type,
      quantity,
      stock_before,
      stock_after,
      reason,
      notes,
      created_by
    )
    values (
      v_item.product_id,
      'salida',
      v_item.quantity,
      v_stock_before,
      v_stock_after,
      'Anulacion de compra confirmada',
      'Anulacion compra ' || p_purchase_id::text || '. Motivo: ' || trim(p_reason),
      v_user_id
    );

    update public.products
    set stock_current = v_stock_after
    where id = v_item.product_id;
  end loop;

  if v_has_account then
    update public.accounts_payable
    set balance = 0,
        paid_amount = 0,
        status = 'anulada',
        notes = concat_ws(' | ', nullif(notes, ''), 'Anulada por compra ' || p_purchase_id::text || ': ' || trim(p_reason))
    where id = v_account.id;
  end if;

  update public.purchases
  set status = 'cancelada',
      reversal_status = 'reversed',
      canceled_reason = trim(p_reason),
      canceled_by = v_user_id,
      canceled_at = v_now
  where id = p_purchase_id;

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_user_id,
    'cancel_confirmed_purchase',
    'purchase',
    p_purchase_id,
    jsonb_build_object(
      'reason', trim(p_reason),
      'total', v_purchase.total,
      'payment_status', v_purchase.payment_status,
      'reversal_status', 'reversed'
    )
  );
end;
$$;

drop function if exists public.save_purchase_batch_line_classification(uuid, numeric, jsonb, text);

create or replace function public.save_purchase_batch_line_classification(
  p_batch_line_id uuid,
  p_waste_quantity numeric,
  p_results jsonb,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user_role text;
  v_line record;
  v_batch record;
  v_classification_id uuid;
  v_results_count integer;
  v_manual_count integer;
  v_sale_value_total numeric(14, 2);
  v_assigned_total numeric(14, 2);
  v_difference numeric(14, 2);
  v_same_unit boolean;
  v_quantity_total numeric(14, 3);
  v_waste_quantity numeric(14, 3);
  v_waste_unit_name text;
  v_waste_unit_abbreviation text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role
  into v_user_role
  from public.profiles
  where id = v_user_id
    and is_active = true;

  if v_user_role not in ('administrador', 'inventario') then
    raise exception 'No tienes permisos para clasificar ingresos.';
  end if;

  if p_results is null or jsonb_typeof(p_results) <> 'array' or jsonb_array_length(p_results) = 0 then
    raise exception 'Agrega al menos un producto resultante. La clasificacion con 100%% de merma no esta permitida por ahora.';
  end if;

  select
    line.*,
    product.requires_classification as product_requires_classification
  into v_line
  from public.purchase_batch_lines line
  join public.products product on product.id = line.product_id
  where line.id = p_batch_line_id
  for update of line;

  if not found then
    raise exception 'Linea de compra multiple no encontrada.';
  end if;

  select *
  into v_batch
  from public.purchase_batches
  where id = v_line.batch_id
  for update;

  if not found then
    raise exception 'Compra multiple no encontrada.';
  end if;

  if v_batch.status <> 'borrador' then
    raise exception 'Solo se pueden clasificar lineas de compras multiples en borrador.';
  end if;

  if v_line.product_requires_classification is not true then
    raise exception 'El producto real de esta linea no requiere clasificacion de ingreso.';
  end if;

  if p_waste_quantity is null or p_waste_quantity < 0 then
    raise exception 'La merma no puede ser negativa.';
  end if;

  v_waste_quantity := p_waste_quantity;

  drop table if exists pg_temp.tmp_purchase_classification_results;

  create temp table pg_temp.tmp_purchase_classification_results (
    sort_order integer generated always as identity,
    product_id uuid not null,
    product_name text,
    unit_name text,
    unit_abbreviation text,
    quantity numeric(14, 3) not null,
    sale_price_snapshot numeric(14, 2),
    sale_value numeric(14, 2),
    assigned_cost numeric(14, 2),
    unit_cost numeric(14, 4)
  ) on commit drop;

  insert into pg_temp.tmp_purchase_classification_results (
    product_id,
    quantity,
    assigned_cost
  )
  select
    (item ->> 'product_id')::uuid,
    (item ->> 'quantity')::numeric,
    nullif(item ->> 'assigned_cost', '')::numeric
  from jsonb_array_elements(p_results) as item;

  if exists (
    select 1
    from pg_temp.tmp_purchase_classification_results
    where quantity <= 0
  ) then
    raise exception 'Las cantidades resultantes deben ser mayores a cero.';
  end if;

  if exists (
    select 1
    from pg_temp.tmp_purchase_classification_results
    where assigned_cost < 0
  ) then
    raise exception 'Los costos asignados no pueden ser negativos.';
  end if;

  if exists (
    select 1
    from pg_temp.tmp_purchase_classification_results
    where product_id = v_line.product_id
  ) then
    raise exception 'El producto base no puede ser un producto resultante.';
  end if;

  if exists (
    select product_id
    from pg_temp.tmp_purchase_classification_results
    group by product_id
    having count(*) > 1
  ) then
    raise exception 'No repitas productos resultantes en la misma clasificacion.';
  end if;

  update pg_temp.tmp_purchase_classification_results tmp
  set product_name = product.name,
      unit_name = unit.name,
      unit_abbreviation = unit.abbreviation,
      sale_price_snapshot = product.sale_price,
      sale_value = round(tmp.quantity * product.sale_price, 2)
  from public.products product
  left join public.units_of_measure unit on unit.id = product.unit_id
  where product.id = tmp.product_id
    and product.is_active = true;

  if exists (
    select 1
    from pg_temp.tmp_purchase_classification_results
    where product_name is null
  ) then
    raise exception 'Todos los productos resultantes deben existir y estar activos.';
  end if;

  select count(*), count(assigned_cost)
  into v_results_count, v_manual_count
  from pg_temp.tmp_purchase_classification_results;

  if v_manual_count = v_results_count then
    select round(sum(assigned_cost), 2)
    into v_assigned_total
    from pg_temp.tmp_purchase_classification_results;

    if round(v_assigned_total, 2) <> round(v_line.subtotal, 2) then
      raise exception 'Los costos asignados deben sumar exactamente el subtotal original.';
    end if;
  else
    if v_manual_count > 0 then
      raise exception 'Completa todos los costos asignados o deja todos vacios para distribuir automaticamente.';
    end if;

    if exists (
      select 1
      from pg_temp.tmp_purchase_classification_results
      where sale_price_snapshot <= 0
    ) then
      raise exception 'Un producto resultante no tiene precio de venta valido. Asigna costos manualmente.';
    end if;

    select round(sum(sale_value), 2)
    into v_sale_value_total
    from pg_temp.tmp_purchase_classification_results;

    if v_sale_value_total <= 0 then
      raise exception 'No se pudo distribuir costos porque el valor de venta resultante es cero.';
    end if;

    update pg_temp.tmp_purchase_classification_results
    set assigned_cost = round(v_line.subtotal * sale_value / v_sale_value_total, 2);

    select round(v_line.subtotal - sum(assigned_cost), 2)
    into v_difference
    from pg_temp.tmp_purchase_classification_results;

    update pg_temp.tmp_purchase_classification_results
    set assigned_cost = assigned_cost + v_difference
    where sort_order = (
      select max(sort_order)
      from pg_temp.tmp_purchase_classification_results
    );
  end if;

  select round(sum(assigned_cost), 2)
  into v_assigned_total
  from pg_temp.tmp_purchase_classification_results;

  if round(v_assigned_total, 2) <> round(v_line.subtotal, 2) then
    raise exception 'La distribucion de costos no coincide con el subtotal original.';
  end if;

  update pg_temp.tmp_purchase_classification_results
  set unit_cost = round(assigned_cost / quantity, 4);

  select coalesce(sum(quantity), 0)
  into v_quantity_total
  from pg_temp.tmp_purchase_classification_results;

  select bool_and(coalesce(unit_abbreviation, '') = coalesce(v_line.unit_abbreviation, ''))
  into v_same_unit
  from pg_temp.tmp_purchase_classification_results;

  if v_same_unit and abs((v_quantity_total + v_waste_quantity) - v_line.quantity) > 0.001 then
    raise exception 'La cantidad clasificada mas merma debe coincidir con la cantidad original.';
  end if;

  select unit_name, unit_abbreviation
  into v_waste_unit_name, v_waste_unit_abbreviation
  from pg_temp.tmp_purchase_classification_results
  order by sort_order
  limit 1;

  delete from public.purchase_batch_line_classifications
  where batch_line_id = p_batch_line_id;

  insert into public.purchase_batch_line_classifications (
    batch_id,
    batch_line_id,
    base_product_id,
    base_product_name,
    base_quantity,
    base_unit_name,
    base_unit_abbreviation,
    original_subtotal,
    waste_quantity,
    waste_unit_name,
    waste_unit_abbreviation,
    distribution_method,
    status,
    line_revision,
    notes,
    classified_by
  )
  values (
    v_line.batch_id,
    v_line.id,
    v_line.product_id,
    coalesce(v_line.product_name, 'Producto base'),
    v_line.quantity,
    v_line.unit_name,
    v_line.unit_abbreviation,
    v_line.subtotal,
    v_waste_quantity,
    v_waste_unit_name,
    v_waste_unit_abbreviation,
    'valor_venta',
    'lista',
    v_line.line_revision,
    nullif(trim(coalesce(p_notes, '')), ''),
    v_user_id
  )
  returning id into v_classification_id;

  insert into public.purchase_batch_classification_results (
    classification_id,
    product_id,
    product_name,
    unit_name,
    unit_abbreviation,
    quantity,
    sale_price_snapshot,
    sale_value,
    assigned_cost,
    unit_cost,
    sort_order
  )
  select
    v_classification_id,
    product_id,
    product_name,
    unit_name,
    unit_abbreviation,
    quantity,
    sale_price_snapshot,
    sale_value,
    assigned_cost,
    unit_cost,
    sort_order
  from pg_temp.tmp_purchase_classification_results
  order by sort_order;

  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (
    v_user_id,
    'save_purchase_batch_line_classification',
    'purchase_batch',
    v_line.batch_id,
    jsonb_build_object(
      'batch_line_id', p_batch_line_id,
      'line_revision', v_line.line_revision,
      'base_product_id', v_line.product_id,
      'waste_quantity', v_waste_quantity,
      'original_subtotal', v_line.subtotal,
      'results_count', v_results_count
    )
  );

  return v_classification_id;
end;
$$;

drop function if exists public.confirm_purchase_batch(uuid);

create or replace function public.confirm_purchase_batch(p_batch_id uuid)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user_role text;
  v_batch record;
  v_group record;
  v_item record;
  v_purchase_id uuid;
  v_child_purchase_ids uuid[] := '{}';
  v_payment_status text;
  v_purchase_total numeric(14, 2);
  v_summary jsonb;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role
  into v_user_role
  from public.profiles
  where id = v_user_id
    and is_active = true;

  if v_user_role not in ('administrador', 'inventario') then
    raise exception 'No tienes permisos para confirmar compras multiples.';
  end if;

  select *
  into v_batch
  from public.purchase_batches
  where id = p_batch_id
  for update;

  if not found then
    raise exception 'Compra multiple no encontrada.';
  end if;

  if v_batch.status = 'confirmada' then
    raise exception 'La compra multiple ya fue confirmada.';
  end if;

  if v_batch.status <> 'borrador' then
    raise exception 'Solo se pueden confirmar compras multiples en borrador.';
  end if;

  if not exists (select 1 from public.purchase_batch_lines where batch_id = p_batch_id) then
    raise exception 'La compra multiple debe tener al menos una linea.';
  end if;

  if exists (
    select 1
    from public.purchase_batch_lines line
    join public.products product on product.id = line.product_id
    where line.batch_id = p_batch_id
      and product.requires_classification = true
      and not exists (
        select 1
        from public.purchase_batch_line_classifications classification
        where classification.batch_line_id = line.id
          and classification.batch_id = line.batch_id
          and classification.base_product_id = line.product_id
          and classification.base_quantity = line.quantity
          and classification.original_subtotal = line.subtotal
          and classification.base_unit_abbreviation is not distinct from line.unit_abbreviation
          and classification.line_revision = line.line_revision
          and classification.status = 'lista'
          and exists (
            select 1
            from public.purchase_batch_classification_results result
            where result.classification_id = classification.id
          )
          and not exists (
            select 1
            from public.purchase_batch_classification_results result
            where result.classification_id = classification.id
              and result.product_id = line.product_id
          )
          and (
            select round(coalesce(sum(result.assigned_cost), 0), 2)
            from public.purchase_batch_classification_results result
            where result.classification_id = classification.id
          ) = round(line.subtotal, 2)
      )
  ) then
    raise exception 'Este producto requiere una clasificacion vigente antes de confirmar.';
  end if;

  if exists (
    select 1
    from public.purchase_batch_lines
    where batch_id = p_batch_id
      and (
        product_id is null
        or supplier_id is null
        or quantity <= 0
        or unit_cost < 0
        or payment_method not in ('efectivo', 'transferencia', 'qr', 'credito')
      )
  ) then
    raise exception 'La compra multiple tiene lineas incompletas o invalidas.';
  end if;

  for v_group in
    with expanded_items as (
      select
        line.supplier_id,
        line.payment_method,
        line.product_id,
        line.quantity,
        line.unit_cost,
        line.subtotal
      from public.purchase_batch_lines line
      join public.products product on product.id = line.product_id
      where line.batch_id = p_batch_id
        and product.requires_classification = false

      union all

      select
        line.supplier_id,
        line.payment_method,
        result.product_id,
        result.quantity,
        result.unit_cost,
        result.assigned_cost as subtotal
      from public.purchase_batch_lines line
      join public.products product
        on product.id = line.product_id
       and product.requires_classification = true
      join public.purchase_batch_line_classifications classification
        on classification.batch_line_id = line.id
       and classification.batch_id = line.batch_id
       and classification.base_product_id = line.product_id
       and classification.base_quantity = line.quantity
       and classification.original_subtotal = line.subtotal
       and classification.base_unit_abbreviation is not distinct from line.unit_abbreviation
       and classification.line_revision = line.line_revision
       and classification.status = 'lista'
      join public.purchase_batch_classification_results result
        on result.classification_id = classification.id
      where line.batch_id = p_batch_id
    )
    select
      supplier_id,
      payment_method,
      round(sum(subtotal), 2) as total
    from expanded_items
    group by supplier_id, payment_method
    order by supplier_id, payment_method
  loop
    v_payment_status := case
      when v_group.payment_method = 'credito' then 'pendiente'
      else 'pagada'
    end;

    v_purchase_total := round(v_group.total, 2);

    insert into public.purchases (
      supplier_id,
      purchase_date,
      status,
      payment_status,
      payment_method,
      subtotal,
      total,
      notes,
      created_by,
      purchase_batch_id
    )
    values (
      v_group.supplier_id,
      v_batch.batch_date,
      'borrador',
      v_payment_status,
      v_group.payment_method,
      v_purchase_total,
      v_purchase_total,
      concat_ws(' | ', 'Compra hija generada desde compra multiple ' || p_batch_id::text, nullif(v_batch.notes, '')),
      v_user_id,
      p_batch_id
    )
    returning id into v_purchase_id;

    for v_item in
      with expanded_items as (
        select
          line.supplier_id,
          line.payment_method,
          line.product_id,
          line.quantity,
          line.unit_cost,
          line.subtotal,
          line.sort_order,
          line.created_at
        from public.purchase_batch_lines line
        join public.products product on product.id = line.product_id
        where line.batch_id = p_batch_id
          and product.requires_classification = false

        union all

        select
          line.supplier_id,
          line.payment_method,
          result.product_id,
          result.quantity,
          result.unit_cost,
          result.assigned_cost as subtotal,
          line.sort_order,
          result.created_at
        from public.purchase_batch_lines line
        join public.products product
          on product.id = line.product_id
         and product.requires_classification = true
        join public.purchase_batch_line_classifications classification
          on classification.batch_line_id = line.id
         and classification.batch_id = line.batch_id
         and classification.base_product_id = line.product_id
         and classification.base_quantity = line.quantity
         and classification.original_subtotal = line.subtotal
         and classification.base_unit_abbreviation is not distinct from line.unit_abbreviation
         and classification.line_revision = line.line_revision
         and classification.status = 'lista'
        join public.purchase_batch_classification_results result
          on result.classification_id = classification.id
        where line.batch_id = p_batch_id
      )
      select *
      from expanded_items
      where supplier_id = v_group.supplier_id
        and payment_method = v_group.payment_method
      order by sort_order, created_at
    loop
      insert into public.purchase_items (
        purchase_id,
        product_id,
        quantity,
        unit_cost,
        subtotal
      )
      values (
        v_purchase_id,
        v_item.product_id,
        v_item.quantity,
        v_item.unit_cost,
        v_item.subtotal
      );
    end loop;

    perform public.confirm_purchase(v_purchase_id);

    insert into public.audit_logs (
      user_id,
      action,
      entity_type,
      entity_id,
      metadata
    )
    values (
      v_user_id,
      'confirm_purchase',
      'purchase',
      v_purchase_id,
      jsonb_build_object(
        'origin', 'purchase_batch',
        'purchase_batch_id', p_batch_id,
        'payment_method', v_group.payment_method,
        'total', v_purchase_total
      )
    );

    v_child_purchase_ids := array_append(v_child_purchase_ids, v_purchase_id);
  end loop;

  select jsonb_build_object(
    'total', coalesce(sum(line.subtotal), 0),
    'cash', coalesce(sum(line.subtotal) filter (where line.payment_method = 'efectivo'), 0),
    'qr_transfer', coalesce(sum(line.subtotal) filter (where line.payment_method in ('qr', 'transferencia')), 0),
    'credit', coalesce(sum(line.subtotal) filter (where line.payment_method = 'credito'), 0),
    'classified_lines_count', coalesce(
      count(*) filter (where product.requires_classification = true),
      0
    ),
    'child_purchases_count', coalesce(array_length(v_child_purchase_ids, 1), 0),
    'child_purchase_ids', to_jsonb(v_child_purchase_ids)
  )
  into v_summary
  from public.purchase_batch_lines line
  join public.products product on product.id = line.product_id
  where line.batch_id = p_batch_id;

  update public.purchase_batches
  set status = 'confirmada',
      confirmed_by = v_user_id,
      confirmed_at = timezone('utc', now()),
      child_purchase_ids = v_child_purchase_ids,
      confirmation_summary = v_summary
  where id = p_batch_id;

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_user_id,
    'confirm_purchase_batch',
    'purchase_batch',
    p_batch_id,
    v_summary
  );

  return v_child_purchase_ids;
end;
$$;

revoke all on function public.save_purchase_batch_line_classification(uuid, numeric, jsonb, text) from public;
grant execute on function public.save_purchase_batch_line_classification(uuid, numeric, jsonb, text) to authenticated;

revoke all on function public.confirm_purchase_batch(uuid) from public;
grant execute on function public.confirm_purchase_batch(uuid) to authenticated;

commit;
