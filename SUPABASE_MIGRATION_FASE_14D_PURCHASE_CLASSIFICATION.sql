-- Fase 14D - Clasificacion segura de ingresos en compras multiples
-- PENDIENTE DE APLICAR EN SUPABASE STAGING.
-- No ejecutar en produccion sin backup y validacion.

alter table public.products
alter column stock_current type numeric(14, 3),
alter column stock_min type numeric(14, 3);

alter table public.inventory_movements
alter column quantity type numeric(14, 3),
alter column stock_before type numeric(14, 3),
alter column stock_after type numeric(14, 3);

alter table public.purchase_items
alter column quantity type numeric(14, 3),
alter column unit_cost type numeric(14, 4);

create table if not exists public.purchase_batch_line_classifications (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.purchase_batches (id) on delete cascade,
  batch_line_id uuid not null unique references public.purchase_batch_lines (id) on delete cascade,
  base_product_id uuid not null references public.products (id) on delete restrict,
  base_product_name text not null,
  base_quantity numeric(14, 3) not null,
  base_unit_name text,
  base_unit_abbreviation text,
  original_subtotal numeric(14, 2) not null,
  waste_quantity numeric(14, 3) not null default 0,
  waste_unit_name text,
  waste_unit_abbreviation text,
  distribution_method text not null default 'valor_venta',
  status text not null default 'lista',
  notes text,
  classified_by uuid references public.profiles (id) on delete set null,
  classified_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint purchase_batch_line_classifications_status_check check (status in ('borrador', 'lista')),
  constraint purchase_batch_line_classifications_base_quantity_check check (base_quantity > 0),
  constraint purchase_batch_line_classifications_original_subtotal_check check (original_subtotal >= 0),
  constraint purchase_batch_line_classifications_waste_quantity_check check (waste_quantity >= 0)
);

create table if not exists public.purchase_batch_classification_results (
  id uuid primary key default gen_random_uuid(),
  classification_id uuid not null references public.purchase_batch_line_classifications (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  product_name text not null,
  unit_name text,
  unit_abbreviation text,
  quantity numeric(14, 3) not null,
  sale_price_snapshot numeric(14, 2) not null,
  sale_value numeric(14, 2) not null,
  assigned_cost numeric(14, 2) not null,
  unit_cost numeric(14, 4) not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  constraint purchase_batch_classification_results_quantity_check check (quantity > 0),
  constraint purchase_batch_classification_results_sale_price_check check (sale_price_snapshot >= 0),
  constraint purchase_batch_classification_results_sale_value_check check (sale_value >= 0),
  constraint purchase_batch_classification_results_assigned_cost_check check (assigned_cost >= 0),
  constraint purchase_batch_classification_results_unit_cost_check check (unit_cost >= 0)
);

create index if not exists purchase_batch_line_classifications_batch_id_idx
on public.purchase_batch_line_classifications (batch_id);

create index if not exists purchase_batch_classification_results_classification_id_idx
on public.purchase_batch_classification_results (classification_id);

create index if not exists purchase_batch_classification_results_product_id_idx
on public.purchase_batch_classification_results (product_id);

drop trigger if exists set_purchase_batch_line_classifications_updated_at
on public.purchase_batch_line_classifications;

create trigger set_purchase_batch_line_classifications_updated_at
before update on public.purchase_batch_line_classifications
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.purchase_batch_line_classifications enable row level security;
alter table public.purchase_batch_classification_results enable row level security;

drop policy if exists "Purchase roles can view line classifications" on public.purchase_batch_line_classifications;
create policy "Purchase roles can view line classifications"
on public.purchase_batch_line_classifications
for select
to authenticated
using (public.current_user_role() in ('administrador', 'inventario', 'finanzas'));

drop policy if exists "Purchase roles can view classification results" on public.purchase_batch_classification_results;
create policy "Purchase roles can view classification results"
on public.purchase_batch_classification_results
for select
to authenticated
using (
  exists (
    select 1
    from public.purchase_batch_line_classifications c
    where c.id = classification_id
      and public.current_user_role() in ('administrador', 'inventario', 'finanzas')
  )
);

drop policy if exists "Purchase managers can delete draft line classifications" on public.purchase_batch_line_classifications;
create policy "Purchase managers can delete draft line classifications"
on public.purchase_batch_line_classifications
for delete
to authenticated
using (
  public.current_user_role() in ('administrador', 'inventario')
  and exists (
    select 1
    from public.purchase_batches batch
    where batch.id = purchase_batch_line_classifications.batch_id
      and batch.status = 'borrador'
  )
);

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
  v_result record;
  v_same_unit boolean;
  v_quantity_total numeric(14, 3);
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
    raise exception 'Agrega al menos un producto resultante.';
  end if;

  select *
  into v_line
  from public.purchase_batch_lines
  where id = p_batch_line_id
  for update;

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

  if v_line.requires_classification is not true then
    raise exception 'Esta linea no requiere clasificacion de ingreso.';
  end if;

  if coalesce(p_waste_quantity, 0) < 0 then
    raise exception 'La merma no puede ser negativa.';
  end if;

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
  set product_name = p.name,
      unit_name = u.name,
      unit_abbreviation = u.abbreviation,
      sale_price_snapshot = p.sale_price,
      sale_value = round(tmp.quantity * p.sale_price, 2)
  from public.products p
  left join public.units_of_measure u on u.id = p.unit_id
  where p.id = tmp.product_id
    and p.is_active = true;

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

    if abs(v_assigned_total - v_line.subtotal) > 0.01 then
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
      select sort_order
      from pg_temp.tmp_purchase_classification_results
      order by sale_value desc, product_id
      limit 1
    );
  end if;

  update pg_temp.tmp_purchase_classification_results
  set unit_cost = round(assigned_cost / quantity, 4);

  select coalesce(sum(quantity), 0)
  into v_quantity_total
  from pg_temp.tmp_purchase_classification_results;

  select bool_and(coalesce(unit_abbreviation, '') = coalesce(v_line.unit_abbreviation, ''))
  into v_same_unit
  from pg_temp.tmp_purchase_classification_results;

  if v_same_unit and abs((v_quantity_total + coalesce(p_waste_quantity, 0)) - v_line.quantity) > 0.001 then
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
    coalesce(p_waste_quantity, 0),
    v_waste_unit_name,
    v_waste_unit_abbreviation,
    'valor_venta',
    'lista',
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
      'base_product_id', v_line.product_id,
      'waste_quantity', coalesce(p_waste_quantity, 0),
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
    where line.batch_id = p_batch_id
      and line.requires_classification = true
      and not exists (
        select 1
        from public.purchase_batch_line_classifications classification
        where classification.batch_line_id = line.id
          and classification.status = 'lista'
      )
  ) then
    raise exception 'Este producto requiere clasificacion de ingreso antes de confirmar.';
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
      where line.batch_id = p_batch_id
        and line.requires_classification = false

      union all

      select
        line.supplier_id,
        line.payment_method,
        result.product_id,
        result.quantity,
        result.unit_cost,
        result.assigned_cost as subtotal
      from public.purchase_batch_lines line
      join public.purchase_batch_line_classifications classification
        on classification.batch_line_id = line.id
       and classification.status = 'lista'
      join public.purchase_batch_classification_results result
        on result.classification_id = classification.id
      where line.batch_id = p_batch_id
        and line.requires_classification = true
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
        where line.batch_id = p_batch_id
          and line.requires_classification = false

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
        join public.purchase_batch_line_classifications classification
          on classification.batch_line_id = line.id
         and classification.status = 'lista'
        join public.purchase_batch_classification_results result
          on result.classification_id = classification.id
        where line.batch_id = p_batch_id
          and line.requires_classification = true
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
    'classified_lines_count', coalesce(count(*) filter (where line.requires_classification = true), 0),
    'child_purchases_count', coalesce(array_length(v_child_purchase_ids, 1), 0),
    'child_purchase_ids', to_jsonb(v_child_purchase_ids)
  )
  into v_summary
  from public.purchase_batch_lines line
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
