-- QB-6: Preparacion, entrega fisica y descuento de stock al entregar.
-- Alcance local: prepara pedidos QB, descuenta inventario solo al entregar y deja recibos para QB-7.

begin;

alter table public.products
  add column if not exists is_qb_loss_product boolean not null default false;

comment on column public.products.is_qb_loss_product is
  'QB-6: marca productos tecnicos de merma. No deben aparecer en catalogo ni entrar a preparacion/entrega.';

alter table public.qb_orders
  drop constraint if exists qb_orders_status_check;

alter table public.qb_orders
  add constraint qb_orders_status_check
  check (status in (
    'pendiente_preparacion',
    'en_preparacion',
    'preparado',
    'entregado_pendiente_recibo',
    'cancelado'
  ));

alter table public.qb_orders
  add column if not exists preparation_started_by uuid references public.profiles(id) on delete set null,
  add column if not exists preparation_started_at timestamptz,
  add column if not exists prepared_by uuid references public.profiles(id) on delete set null,
  add column if not exists prepared_at timestamptz,
  add column if not exists delivered_by uuid references public.profiles(id) on delete set null,
  add column if not exists delivered_at timestamptz;

comment on column public.qb_orders.delivered_at is
  'QB-6: entrega fisica confirmada. El recibo acumulativo se crea despues en QB-7.';

create table if not exists public.qb_order_preparations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.qb_orders(id) on delete cascade,
  status text not null default 'en_preparacion',
  internal_notes text,
  started_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  prepared_by uuid references public.profiles(id) on delete set null,
  prepared_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qb_order_preparations_order_unique unique (order_id),
  constraint qb_order_preparations_status_check
    check (status in ('en_preparacion', 'preparado', 'cancelado')),
  constraint qb_order_preparations_notes_check
    check (internal_notes is null or length(trim(internal_notes)) <= 1200)
);

comment on table public.qb_order_preparations is
  'QB-6: cabecera de preparacion fisica de pedidos QB. No mueve stock.';

create table if not exists public.qb_order_preparation_items (
  id uuid primary key default gen_random_uuid(),
  preparation_id uuid not null references public.qb_order_preparations(id) on delete cascade,
  order_item_id uuid not null references public.qb_order_items(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  requested_source_label text not null,
  requested_quantity numeric(18, 6) not null,
  requested_base_unit_id uuid not null references public.qb_units(id) on delete restrict,
  requested_base_unit_symbol text not null,
  requested_base_quantity numeric(18, 6) not null,
  actual_allowed_unit_id uuid references public.qb_product_allowed_units(id) on delete restrict,
  actual_source_kind text,
  actual_source_unit_id uuid references public.qb_units(id) on delete restrict,
  actual_product_presentation_id uuid references public.qb_product_presentations(id) on delete restrict,
  actual_source_label text,
  actual_quantity numeric(18, 6) not null default 0,
  actual_base_unit_id uuid references public.qb_units(id) on delete restrict,
  actual_base_unit_symbol text,
  actual_base_quantity numeric(18, 6) not null default 0,
  conversion_factor_to_base numeric(18, 9),
  conversion_snapshot_id uuid references public.qb_conversion_snapshots(id) on delete set null,
  status text not null default 'no_disponible',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qb_order_preparation_items_order_item_unique unique (order_item_id),
  constraint qb_order_preparation_items_status_check
    check (status in ('completo', 'parcial', 'no_disponible')),
  constraint qb_order_preparation_items_requested_quantity_check check (requested_quantity > 0),
  constraint qb_order_preparation_items_requested_base_quantity_check check (requested_base_quantity > 0),
  constraint qb_order_preparation_items_actual_quantity_check check (actual_quantity >= 0),
  constraint qb_order_preparation_items_actual_base_quantity_check check (actual_base_quantity >= 0),
  constraint qb_order_preparation_items_factor_check
    check (conversion_factor_to_base is null or conversion_factor_to_base > 0),
  constraint qb_order_preparation_items_notes_check
    check (notes is null or length(trim(notes)) <= 500),
  constraint qb_order_preparation_items_actual_source_check
    check (
      (
        status = 'no_disponible'
        and actual_quantity = 0
        and actual_base_quantity = 0
        and actual_allowed_unit_id is null
        and actual_source_kind is null
        and actual_source_unit_id is null
        and actual_product_presentation_id is null
        and actual_base_unit_id is null
        and conversion_factor_to_base is null
      )
      or
      (
        status in ('completo', 'parcial')
        and actual_quantity > 0
        and actual_base_quantity > 0
        and actual_allowed_unit_id is not null
        and actual_base_unit_id is not null
        and conversion_factor_to_base is not null
        and (
          (actual_source_kind = 'universal_unit' and actual_source_unit_id is not null and actual_product_presentation_id is null) or
          (actual_source_kind = 'product_presentation' and actual_source_unit_id is null and actual_product_presentation_id is not null)
        )
      )
    )
);

comment on table public.qb_order_preparation_items is
  'QB-6: cantidades reales preparadas por item. Guarda snapshot y no descuenta stock hasta la entrega.';

create table if not exists public.qb_order_delivery_movements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.qb_orders(id) on delete cascade,
  preparation_id uuid not null references public.qb_order_preparations(id) on delete cascade,
  preparation_item_id uuid not null references public.qb_order_preparation_items(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  inventory_movement_id uuid not null references public.inventory_movements(id) on delete restrict,
  delivered_base_quantity numeric(18, 6) not null,
  delivered_by uuid references public.profiles(id) on delete set null,
  delivered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint qb_order_delivery_movements_item_unique unique (preparation_item_id),
  constraint qb_order_delivery_movements_inventory_unique unique (inventory_movement_id),
  constraint qb_order_delivery_movements_quantity_check check (delivered_base_quantity > 0)
);

comment on table public.qb_order_delivery_movements is
  'QB-6: puente auditable entre entrega QB y inventory_movements. Impide doble descuento por item preparado.';

create index if not exists qb_order_preparations_status_idx
  on public.qb_order_preparations (status, started_at desc);

create index if not exists qb_order_preparation_items_preparation_idx
  on public.qb_order_preparation_items (preparation_id, created_at);

create index if not exists qb_order_preparation_items_product_idx
  on public.qb_order_preparation_items (product_id, created_at desc);

create index if not exists qb_order_delivery_movements_order_idx
  on public.qb_order_delivery_movements (order_id, delivered_at desc);

create index if not exists qb_order_delivery_movements_product_idx
  on public.qb_order_delivery_movements (product_id, delivered_at desc);

drop trigger if exists set_qb_order_preparations_updated_at on public.qb_order_preparations;
create trigger set_qb_order_preparations_updated_at
  before update on public.qb_order_preparations
  for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_qb_order_preparation_items_updated_at on public.qb_order_preparation_items;
create trigger set_qb_order_preparation_items_updated_at
  before update on public.qb_order_preparation_items
  for each row execute function public.set_current_timestamp_updated_at();

create or replace function public.prevent_qb_loss_order_item()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.products product
    where product.id = new.product_id
      and coalesce(product.is_qb_loss_product, false) = true
  ) then
    raise exception 'Los productos de merma QB no pueden agregarse a pedidos.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_qb_loss_order_item on public.qb_order_items;
create trigger prevent_qb_loss_order_item
  before insert or update of product_id on public.qb_order_items
  for each row execute function public.prevent_qb_loss_order_item();

create or replace function public.get_qb_public_catalog()
returns table (
  product_id uuid,
  product_name text,
  public_description text,
  image_url text,
  category_id uuid,
  category_name text,
  category_slug text,
  product_sort_order integer,
  category_sort_order integer,
  allowed_unit_id uuid,
  source_kind text,
  source_label text,
  min_quantity numeric(18, 6),
  quantity_step numeric(18, 6),
  is_default boolean,
  allowed_sort_order integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    product.id,
    product.name,
    product.catalog_description,
    product.image_url,
    category.id,
    category.name,
    category.catalog_slug,
    coalesce(product.catalog_sort_order, 0),
    coalesce(category.catalog_sort_order, 0),
    allowed.id,
    case
      when allowed.unit_id is not null then 'universal_unit'
      else 'product_presentation'
    end,
    coalesce(unit.symbol, presentation.symbol),
    coalesce(allowed.min_quantity, product.catalog_min_quantity, 1),
    coalesce(allowed.quantity_step, product.catalog_quantity_step, 1),
    allowed.is_default,
    allowed.sort_order
  from public.products product
  join public.qb_product_unit_settings settings
    on settings.product_id = product.id
   and settings.is_qb_active = true
   and settings.is_visible_in_qb_catalog = true
  join public.qb_product_allowed_units allowed
    on allowed.product_id = product.id
   and allowed.usage_context = 'pedido'
   and allowed.is_active = true
  left join public.qb_units unit
    on unit.id = allowed.unit_id
   and unit.is_active = true
  left join public.qb_product_presentations presentation
    on presentation.id = allowed.presentation_id
   and presentation.product_id = product.id
   and presentation.is_active = true
   and presentation.allow_order = true
  left join public.product_categories category
    on category.id = product.category_id
   and category.is_active = true
  where product.is_active = true
    and coalesce(product.is_sellable, true) = true
    and coalesce(product.is_qb_loss_product, false) = false
    and (
      (allowed.unit_id is not null and unit.id is not null) or
      (allowed.presentation_id is not null and presentation.id is not null)
    )
  order by
    coalesce(category.catalog_sort_order, 0),
    category.name nulls last,
    coalesce(product.catalog_sort_order, 0),
    product.name,
    allowed.is_default desc,
    allowed.sort_order,
    coalesce(unit.symbol, presentation.symbol);
$$;

create or replace function public.start_qb_order_preparation(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_order public.qb_orders%rowtype;
  v_preparation_id uuid;
begin
  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role into v_user_role
  from public.profiles
  where id = v_user_id and is_active = true;

  if v_user_role is null or v_user_role not in ('admin', 'administrador', 'inventario') then
    raise exception 'No tienes permisos para preparar pedidos QB.';
  end if;

  select *
  into v_order
  from public.qb_orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'Pedido QB no encontrado.';
  end if;

  if v_order.status not in ('pendiente_preparacion', 'en_preparacion', 'preparado') then
    raise exception 'Este pedido QB no puede entrar a preparacion.';
  end if;

  if exists (select 1 from public.qb_order_delivery_movements where order_id = p_order_id) then
    raise exception 'Este pedido QB ya tiene movimientos de entrega.';
  end if;

  select id into v_preparation_id
  from public.qb_order_preparations
  where order_id = p_order_id
  for update;

  if v_preparation_id is null then
    if exists (
      select 1
      from public.qb_order_items item
      left join public.products product on product.id = item.product_id
      where item.order_id = p_order_id
        and (
          product.id is null
          or product.is_active = false
          or coalesce(product.is_qb_loss_product, false) = true
        )
    ) then
      raise exception 'El pedido QB contiene productos no preparables.';
    end if;

    insert into public.qb_order_preparations (order_id, started_by)
    values (p_order_id, v_user_id)
    returning id into v_preparation_id;

    insert into public.qb_order_preparation_items (
      preparation_id,
      order_item_id,
      product_id,
      requested_source_label,
      requested_quantity,
      requested_base_unit_id,
      requested_base_unit_symbol,
      requested_base_quantity
    )
    select
      v_preparation_id,
      item.id,
      item.product_id,
      item.source_label,
      item.requested_quantity,
      item.base_unit_id,
      item.base_unit_symbol,
      item.base_quantity
    from public.qb_order_items item
    join public.products product on product.id = item.product_id
    where item.order_id = p_order_id
      and product.is_active = true
      and coalesce(product.is_qb_loss_product, false) = false
    order by item.sort_order, item.created_at;

    if not exists (
      select 1 from public.qb_order_preparation_items where preparation_id = v_preparation_id
    ) then
      raise exception 'El pedido QB no tiene items preparables.';
    end if;
  end if;

  if v_order.status = 'pendiente_preparacion' then
    update public.qb_orders
    set status = 'en_preparacion',
        preparation_started_by = coalesce(preparation_started_by, v_user_id),
        preparation_started_at = coalesce(preparation_started_at, now())
    where id = p_order_id;
  end if;

  return v_preparation_id;
end;
$$;

create or replace function public.save_qb_order_preparation(
  p_order_id uuid,
  p_items jsonb,
  p_internal_notes text,
  p_mark_prepared boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_order public.qb_orders%rowtype;
  v_preparation public.qb_order_preparations%rowtype;
  v_item jsonb;
  v_order_item public.qb_order_items%rowtype;
  v_prep_item public.qb_order_preparation_items%rowtype;
  v_allowed public.qb_product_allowed_units%rowtype;
  v_product record;
  v_base_unit public.qb_units%rowtype;
  v_source_unit public.qb_units%rowtype;
  v_presentation public.qb_product_presentations%rowtype;
  v_line_status text;
  v_quantity numeric(18, 6);
  v_base_quantity numeric(18, 6);
  v_factor numeric(18, 9);
  v_snapshot_id uuid;
  v_seen uuid[] := '{}';
begin
  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role into v_user_role
  from public.profiles
  where id = v_user_id and is_active = true;

  if v_user_role is null or v_user_role not in ('admin', 'administrador', 'inventario') then
    raise exception 'No tienes permisos para guardar preparaciones QB.';
  end if;

  select *
  into v_order
  from public.qb_orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'Pedido QB no encontrado.';
  end if;

  if v_order.status not in ('pendiente_preparacion', 'en_preparacion', 'preparado') then
    raise exception 'Este pedido QB no se puede editar en preparacion.';
  end if;

  if exists (select 1 from public.qb_order_delivery_movements where order_id = p_order_id) then
    raise exception 'Este pedido QB ya fue entregado o tiene movimientos de entrega.';
  end if;

  perform public.start_qb_order_preparation(p_order_id);

  select *
  into v_preparation
  from public.qb_order_preparations
  where order_id = p_order_id
  for update;

  if v_preparation.id is null then
    raise exception 'Preparacion QB no encontrada.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Items de preparacion invalidos.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select *
    into v_order_item
    from public.qb_order_items
    where id = (v_item ->> 'order_item_id')::uuid
      and order_id = p_order_id;

    if v_order_item.id is null then
      raise exception 'Item de pedido QB invalido.';
    end if;

    if v_order_item.id = any(v_seen) then
      raise exception 'Item de preparacion QB repetido.';
    end if;

    v_seen := array_append(v_seen, v_order_item.id);

    select *
    into v_prep_item
    from public.qb_order_preparation_items
    where preparation_id = v_preparation.id
      and order_item_id = v_order_item.id
    for update;

    if v_prep_item.id is null then
      raise exception 'Linea de preparacion QB no encontrada.';
    end if;

    v_line_status := coalesce(nullif(v_item ->> 'status', ''), 'no_disponible');

    if v_line_status not in ('completo', 'parcial', 'no_disponible') then
      raise exception 'Estado de linea de preparacion invalido.';
    end if;

    if v_line_status = 'no_disponible' then
      update public.qb_order_preparation_items
      set status = 'no_disponible',
          actual_allowed_unit_id = null,
          actual_source_kind = null,
          actual_source_unit_id = null,
          actual_product_presentation_id = null,
          actual_source_label = null,
          actual_quantity = 0,
          actual_base_unit_id = null,
          actual_base_unit_symbol = null,
          actual_base_quantity = 0,
          conversion_factor_to_base = null,
          conversion_snapshot_id = null,
          notes = nullif(trim(coalesce(v_item ->> 'notes', '')), '')
      where id = v_prep_item.id;

      continue;
    end if;

    v_quantity := nullif(v_item ->> 'actual_quantity', '')::numeric;

    if v_quantity is null or v_quantity <= 0 or v_quantity > 10000 then
      raise exception 'Cantidad preparada invalida.';
    end if;

    if abs(v_quantity * 1000 - round(v_quantity * 1000)) > 0.000001 then
      raise exception 'Cada cantidad preparada admite como maximo tres decimales.';
    end if;

    select
      product.id,
      product.name,
      product.is_active,
      product.is_qb_loss_product,
      settings.is_qb_active,
      coalesce(settings.base_inventory_unit_id, settings.inventory_unit_id, settings.base_unit_id) as base_inventory_unit_id
    into v_product
    from public.products product
    join public.qb_product_unit_settings settings on settings.product_id = product.id
    where product.id = v_order_item.product_id;

    if v_product.id is null or v_product.is_active = false or coalesce(v_product.is_qb_loss_product, false) = true then
      raise exception 'Producto de preparacion no disponible.';
    end if;

    if coalesce(v_product.is_qb_active, false) = false then
      raise exception 'Producto sin configuracion QB activa.';
    end if;

    select *
    into v_base_unit
    from public.qb_units unit
    where unit.id = v_product.base_inventory_unit_id
      and unit.is_active = true;

    if v_base_unit.id is null or v_base_unit.id <> v_order_item.base_unit_id then
      raise exception 'Unidad base de inventario incompatible con el pedido QB.';
    end if;

    select *
    into v_allowed
    from public.qb_product_allowed_units allowed
    where allowed.id = (v_item ->> 'actual_allowed_unit_id')::uuid
      and allowed.product_id = v_order_item.product_id
      and allowed.usage_context in ('pedido', 'inventario')
      and allowed.is_active = true;

    if v_allowed.id is null then
      raise exception 'Unidad de preparacion no permitida.';
    end if;

    if coalesce(v_allowed.min_quantity, 0) > 0 and v_quantity < v_allowed.min_quantity then
      raise exception 'Cantidad preparada menor al minimo permitido.';
    end if;

    if coalesce(v_allowed.quantity_step, 0) > 0
      and abs(((v_quantity - coalesce(v_allowed.min_quantity, v_allowed.quantity_step)) / v_allowed.quantity_step)
        - round((v_quantity - coalesce(v_allowed.min_quantity, v_allowed.quantity_step)) / v_allowed.quantity_step)) > 0.000001
    then
      raise exception 'Cantidad preparada no coincide con el incremento permitido.';
    end if;

    if v_allowed.unit_id is not null then
      select *
      into v_source_unit
      from public.qb_units unit
      where unit.id = v_allowed.unit_id
        and unit.is_active = true
        and unit.dimension_id = v_base_unit.dimension_id;

      if v_source_unit.id is null then
        raise exception 'Unidad universal de preparacion no disponible.';
      end if;

      v_factor := v_source_unit.conversion_factor_to_base / v_base_unit.conversion_factor_to_base;
      v_base_quantity := round(v_quantity * v_factor, 6);

      insert into public.qb_conversion_snapshots (
        source_table,
        source_id,
        product_id,
        dimension_code,
        source_kind,
        source_unit_id,
        source_label,
        source_quantity,
        base_unit_id,
        base_unit_symbol,
        base_quantity,
        conversion_factor_to_base,
        snapshot,
        created_by
      )
      values (
        'qb_order_preparation_items',
        v_prep_item.id,
        v_order_item.product_id,
        'entrega',
        'universal_unit',
        v_source_unit.id,
        v_source_unit.symbol,
        v_quantity,
        v_base_unit.id,
        v_base_unit.symbol,
        v_base_quantity,
        v_factor,
        jsonb_build_object('allowed_unit_id', v_allowed.id, 'usage_context', v_allowed.usage_context, 'unit_name', v_source_unit.name),
        v_user_id
      )
      returning id into v_snapshot_id;

      update public.qb_order_preparation_items
      set status = v_line_status,
          actual_allowed_unit_id = v_allowed.id,
          actual_source_kind = 'universal_unit',
          actual_source_unit_id = v_source_unit.id,
          actual_product_presentation_id = null,
          actual_source_label = v_source_unit.symbol,
          actual_quantity = v_quantity,
          actual_base_unit_id = v_base_unit.id,
          actual_base_unit_symbol = v_base_unit.symbol,
          actual_base_quantity = v_base_quantity,
          conversion_factor_to_base = v_factor,
          conversion_snapshot_id = v_snapshot_id,
          notes = nullif(trim(coalesce(v_item ->> 'notes', '')), '')
      where id = v_prep_item.id;
    else
      select *
      into v_presentation
      from public.qb_product_presentations presentation
      where presentation.id = v_allowed.presentation_id
        and presentation.product_id = v_order_item.product_id
        and presentation.is_active = true
        and (
          (v_allowed.usage_context = 'pedido' and presentation.allow_order = true) or
          (v_allowed.usage_context = 'inventario' and presentation.allow_inventory = true)
        );

      if v_presentation.id is null then
        raise exception 'Presentacion de preparacion no disponible.';
      end if;

      v_factor := v_presentation.conversion_factor_to_base;
      v_base_quantity := round(v_quantity * v_factor, 6);

      insert into public.qb_conversion_snapshots (
        source_table,
        source_id,
        product_id,
        dimension_code,
        source_kind,
        product_presentation_id,
        source_label,
        source_quantity,
        base_unit_id,
        base_unit_symbol,
        base_quantity,
        conversion_factor_to_base,
        snapshot,
        created_by
      )
      values (
        'qb_order_preparation_items',
        v_prep_item.id,
        v_order_item.product_id,
        'entrega',
        'product_presentation',
        v_presentation.id,
        v_presentation.symbol,
        v_quantity,
        v_base_unit.id,
        v_base_unit.symbol,
        v_base_quantity,
        v_factor,
        jsonb_build_object('allowed_unit_id', v_allowed.id, 'usage_context', v_allowed.usage_context, 'presentation_name', v_presentation.name),
        v_user_id
      )
      returning id into v_snapshot_id;

      update public.qb_order_preparation_items
      set status = v_line_status,
          actual_allowed_unit_id = v_allowed.id,
          actual_source_kind = 'product_presentation',
          actual_source_unit_id = null,
          actual_product_presentation_id = v_presentation.id,
          actual_source_label = v_presentation.symbol,
          actual_quantity = v_quantity,
          actual_base_unit_id = v_base_unit.id,
          actual_base_unit_symbol = v_base_unit.symbol,
          actual_base_quantity = v_base_quantity,
          conversion_factor_to_base = v_factor,
          conversion_snapshot_id = v_snapshot_id,
          notes = nullif(trim(coalesce(v_item ->> 'notes', '')), '')
      where id = v_prep_item.id;
    end if;

    if v_base_quantity - v_order_item.base_quantity > 0.001 then
      raise exception 'La cantidad preparada no puede superar la cantidad solicitada.';
    end if;

    if v_line_status = 'completo' and abs(v_base_quantity - v_order_item.base_quantity) > 0.001 then
      raise exception 'Una linea completa debe coincidir con la cantidad solicitada.';
    end if;

    if v_line_status = 'parcial' and v_base_quantity >= v_order_item.base_quantity - 0.001 then
      raise exception 'Una linea parcial debe ser menor que la cantidad solicitada.';
    end if;
  end loop;

  if p_mark_prepared and not exists (
    select 1
    from public.qb_order_preparation_items item
    where item.preparation_id = v_preparation.id
      and item.status in ('completo', 'parcial', 'no_disponible')
  ) then
    raise exception 'La preparacion QB no tiene lineas.';
  end if;

  if p_mark_prepared then
    update public.qb_order_preparations
    set status = 'preparado',
        internal_notes = nullif(trim(coalesce(p_internal_notes, '')), ''),
        prepared_by = v_user_id,
        prepared_at = now()
    where id = v_preparation.id;

    update public.qb_orders
    set status = 'preparado',
        prepared_by = v_user_id,
        prepared_at = now()
    where id = p_order_id;
  else
    update public.qb_order_preparations
    set status = 'en_preparacion',
        internal_notes = nullif(trim(coalesce(p_internal_notes, '')), '')
    where id = v_preparation.id;

    update public.qb_orders
    set status = 'en_preparacion'
    where id = p_order_id;
  end if;

  return v_preparation.id;
end;
$$;

create or replace function public.confirm_qb_order_delivery(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_order public.qb_orders%rowtype;
  v_preparation public.qb_order_preparations%rowtype;
  v_item public.qb_order_preparation_items%rowtype;
  v_stock_before numeric(14, 3);
  v_stock_after numeric(14, 3);
  v_movement_id uuid;
  v_delivered_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role into v_user_role
  from public.profiles
  where id = v_user_id and is_active = true;

  if v_user_role is null or v_user_role not in ('admin', 'administrador', 'inventario') then
    raise exception 'No tienes permisos para confirmar entregas QB.';
  end if;

  select *
  into v_order
  from public.qb_orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'Pedido QB no encontrado.';
  end if;

  if v_order.status <> 'preparado' then
    raise exception 'Solo se pueden entregar pedidos QB preparados.';
  end if;

  if exists (select 1 from public.qb_order_delivery_movements where order_id = p_order_id) then
    raise exception 'Este pedido QB ya tiene descuento de stock por entrega.';
  end if;

  select *
  into v_preparation
  from public.qb_order_preparations
  where order_id = p_order_id
    and status = 'preparado'
  for update;

  if v_preparation.id is null then
    raise exception 'Preparacion QB no encontrada o no preparada.';
  end if;

  for v_item in
    select *
    from public.qb_order_preparation_items
    where preparation_id = v_preparation.id
    order by created_at, id
  loop
    if v_item.status = 'no_disponible' then
      if v_item.actual_base_quantity <> 0 then
        raise exception 'Linea no disponible con cantidad preparada invalida.';
      end if;
      continue;
    end if;

    if v_item.actual_base_quantity <= 0 or v_item.conversion_factor_to_base is null or v_item.conversion_factor_to_base <= 0 then
      raise exception 'Linea preparada con cantidad o factor invalido.';
    end if;

    if v_item.conversion_snapshot_id is null or not exists (
      select 1
      from public.qb_conversion_snapshots snapshot
      where snapshot.id = v_item.conversion_snapshot_id
        and snapshot.source_table = 'qb_order_preparation_items'
        and snapshot.source_id = v_item.id
        and snapshot.product_id = v_item.product_id
        and abs(snapshot.source_quantity - v_item.actual_quantity) <= 0.001
        and abs(snapshot.base_quantity - v_item.actual_base_quantity) <= 0.001
    ) then
      raise exception 'Snapshot de conversion de preparacion invalido.';
    end if;

    select stock_current
    into v_stock_before
    from public.products product
    where product.id = v_item.product_id
      and product.is_active = true
      and coalesce(product.is_qb_loss_product, false) = false
    for update;

    if v_stock_before is null then
      raise exception 'Producto de entrega no disponible.';
    end if;

    if v_stock_before < v_item.actual_base_quantity then
      raise exception 'Stock insuficiente para confirmar la entrega QB.';
    end if;

    v_stock_after := v_stock_before - v_item.actual_base_quantity;

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
      v_item.actual_base_quantity,
      v_stock_before,
      v_stock_after,
      'Entrega QB',
      'Entrega QB pedido ' || p_order_id::text || ', preparacion ' || v_preparation.id::text || ', item ' || v_item.id::text,
      v_user_id
    )
    returning id into v_movement_id;

    update public.products
    set stock_current = v_stock_after
    where id = v_item.product_id;

    insert into public.qb_order_delivery_movements (
      order_id,
      preparation_id,
      preparation_item_id,
      product_id,
      inventory_movement_id,
      delivered_base_quantity,
      delivered_by
    )
    values (
      p_order_id,
      v_preparation.id,
      v_item.id,
      v_item.product_id,
      v_movement_id,
      v_item.actual_base_quantity,
      v_user_id
    );

    v_delivered_count := v_delivered_count + 1;
  end loop;

  if v_delivered_count = 0 then
    raise exception 'No hay cantidades preparadas para entregar.';
  end if;

  update public.qb_orders
  set status = 'entregado_pendiente_recibo',
      delivered_by = v_user_id,
      delivered_at = now()
  where id = p_order_id;

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_user_id,
    'confirm_qb_order_delivery',
    'qb_order',
    p_order_id,
    jsonb_build_object(
      'preparation_id', v_preparation.id,
      'movement_count', v_delivered_count
    )
  );

  return p_order_id;
end;
$$;

create or replace function public.cancel_qb_order_before_delivery(
  p_order_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_order public.qb_orders%rowtype;
begin
  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role into v_user_role
  from public.profiles
  where id = v_user_id and is_active = true;

  if v_user_role is null or v_user_role not in ('admin', 'administrador', 'inventario') then
    raise exception 'No tienes permisos para cancelar pedidos QB.';
  end if;

  select *
  into v_order
  from public.qb_orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'Pedido QB no encontrado.';
  end if;

  if v_order.status not in ('pendiente_preparacion', 'en_preparacion', 'preparado') then
    raise exception 'Solo se pueden cancelar pedidos QB antes de la entrega.';
  end if;

  if exists (select 1 from public.qb_order_delivery_movements where order_id = p_order_id) then
    raise exception 'No se puede cancelar un pedido QB con descuento de stock.';
  end if;

  update public.qb_orders
  set status = 'cancelado',
      cancelled_by = v_user_id,
      cancelled_at = now(),
      cancelled_reason = nullif(trim(coalesce(p_reason, '')), '')
  where id = p_order_id;

  update public.qb_order_preparations
  set status = 'cancelado',
      cancelled_by = v_user_id,
      cancelled_at = now()
  where order_id = p_order_id;

  return p_order_id;
end;
$$;

revoke all on function public.get_qb_public_catalog() from public;
grant execute on function public.get_qb_public_catalog() to anon, authenticated;

revoke all on function public.start_qb_order_preparation(uuid) from public, anon;
grant execute on function public.start_qb_order_preparation(uuid) to authenticated;

revoke all on function public.save_qb_order_preparation(uuid, jsonb, text, boolean) from public, anon;
grant execute on function public.save_qb_order_preparation(uuid, jsonb, text, boolean) to authenticated;

revoke all on function public.confirm_qb_order_delivery(uuid) from public, anon;
grant execute on function public.confirm_qb_order_delivery(uuid) to authenticated;

revoke all on function public.cancel_qb_order_before_delivery(uuid, text) from public, anon;
grant execute on function public.cancel_qb_order_before_delivery(uuid, text) to authenticated;

alter table public.qb_order_preparations enable row level security;
alter table public.qb_order_preparation_items enable row level security;
alter table public.qb_order_delivery_movements enable row level security;

drop policy if exists "Internal roles can view QB order preparations" on public.qb_order_preparations;
create policy "Internal roles can view QB order preparations"
  on public.qb_order_preparations for select
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Internal roles can view QB order preparation items" on public.qb_order_preparation_items;
create policy "Internal roles can view QB order preparation items"
  on public.qb_order_preparation_items for select
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Internal roles can view QB order delivery movements" on public.qb_order_delivery_movements;
create policy "Internal roles can view QB order delivery movements"
  on public.qb_order_delivery_movements for select
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'));

-- Sin politicas directas de insert/update/delete:
-- preparacion, entrega y cancelacion operan exclusivamente por RPCs QB-6 con control de rol y locks.

commit;
