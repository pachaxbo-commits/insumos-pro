-- Arranque piloto: control global de stock e importe fijo para pedidos por Bs.

begin;

create table if not exists public.qb_operational_settings (
  id text primary key,
  strict_stock_control boolean not null default false,
  strict_stock_enabled_at timestamptz,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qb_operational_settings_singleton_check check (id = 'main')
);

comment on table public.qb_operational_settings is
  'Configuracion operativa global de QB Insumos. El modo inicial conserva stock provisional.';

insert into public.qb_operational_settings (id, strict_stock_control)
values ('main', false)
on conflict (id) do nothing;

drop trigger if exists set_qb_operational_settings_updated_at on public.qb_operational_settings;
create trigger set_qb_operational_settings_updated_at
  before update on public.qb_operational_settings
  for each row execute function public.set_current_timestamp_updated_at();

alter table public.qb_operational_settings enable row level security;
revoke all on table public.qb_operational_settings from public, anon, authenticated;
grant select on table public.qb_operational_settings to authenticated;

drop policy if exists qb_operational_settings_internal_select on public.qb_operational_settings;
create policy qb_operational_settings_internal_select
  on public.qb_operational_settings
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and profile.is_active = true
        and profile.role in ('admin', 'administrador', 'inventario')
    )
  );

create or replace function public.get_qb_operational_settings()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_settings public.qb_operational_settings%rowtype;
begin
  select profile.role into v_role
  from public.profiles profile
  where profile.id = v_user_id and profile.is_active = true;

  if v_user_id is null or v_role is null
    or v_role not in ('admin', 'administrador', 'inventario') then
    raise exception 'No tienes permisos para consultar la configuracion operativa.';
  end if;

  select * into v_settings
  from public.qb_operational_settings settings
  where settings.id = 'main';

  return jsonb_build_object(
    'strict_stock_control', v_settings.strict_stock_control,
    'strict_stock_enabled_at', v_settings.strict_stock_enabled_at,
    'updated_at', v_settings.updated_at,
    'negative_products', (
      select count(*) from public.products product
      where product.is_active = true and product.stock_current < 0
    ),
    'products_without_base_unit', (
      select count(*)
      from public.products product
      left join public.qb_product_unit_settings settings on settings.product_id = product.id
      where product.is_active = true
        and product.is_sellable = true
        and coalesce(settings.base_inventory_unit_id, settings.inventory_unit_id, settings.base_unit_id) is null
    ),
    'products_without_opening_stock', (
      select count(*)
      from public.products product
      where product.is_active = true
        and product.is_sellable = true
        and not exists (
          select 1 from public.inventory_movements movement
          where movement.product_id = product.id
            and movement.movement_type = 'entrada'
        )
    ),
    'pending_regularization', (
      select count(*) from public.products product
      where product.is_active = true and product.stock_current < 0
    )
  );
end;
$$;

create or replace function public.set_qb_strict_stock_control(
  p_enabled boolean,
  p_confirmation text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_previous boolean;
begin
  select profile.role into v_role
  from public.profiles profile
  where profile.id = v_user_id and profile.is_active = true;

  if v_user_id is null or v_role not in ('admin', 'administrador') then
    raise exception 'QB_STOCK_ADMIN_REQUIRED: Solo un administrador puede cambiar el control de stock.';
  end if;

  if p_enabled is null then
    raise exception 'QB_STOCK_MODE_REQUIRED: Selecciona un estado valido.';
  end if;

  select settings.strict_stock_control into v_previous
  from public.qb_operational_settings settings
  where settings.id = 'main'
  for update;

  if p_enabled and not v_previous
    and trim(coalesce(p_confirmation, '')) <> 'ACTIVAR CONTROL ESTRICTO' then
    raise exception 'QB_STOCK_CONFIRMATION_REQUIRED: Escribe ACTIVAR CONTROL ESTRICTO para confirmar.';
  end if;

  update public.qb_operational_settings
  set strict_stock_control = p_enabled,
      strict_stock_enabled_at = case
        when p_enabled and not v_previous then now()
        when not p_enabled then null
        else strict_stock_enabled_at
      end,
      updated_by = v_user_id
  where id = 'main';

  if p_enabled is distinct from v_previous then
    insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
    values (
      v_user_id,
      'set_qb_strict_stock_control',
      'configuration',
      null,
      jsonb_build_object('previous_mode', v_previous, 'new_mode', p_enabled)
    );
  end if;

  return public.get_qb_operational_settings();
end;
$$;

create or replace function public.set_qb_product_amount_mode(
  p_product_id uuid,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_product public.products%rowtype;
  v_settings public.qb_product_unit_settings%rowtype;
  v_base_dimension uuid;
  v_price_dimension uuid;
  v_previous boolean;
begin
  select profile.role into v_role
  from public.profiles profile
  where profile.id = v_user_id and profile.is_active = true;

  if v_user_id is null or v_role not in ('admin', 'administrador') then
    raise exception 'QB_AMOUNT_ADMIN_REQUIRED: Solo un administrador puede cambiar esta modalidad.';
  end if;

  select * into v_product
  from public.products product
  where product.id = p_product_id
  for update;

  select * into v_settings
  from public.qb_product_unit_settings settings
  where settings.product_id = p_product_id
  for update;

  if v_product.id is null or v_settings.product_id is null then
    raise exception 'QB_AMOUNT_CONFIGURATION_REQUIRED: Completa primero la configuracion de unidades del producto.';
  end if;

  v_previous := v_settings.supports_amount_bs;

  if p_enabled then
    if not v_product.is_active then
      raise exception 'QB_AMOUNT_PRODUCT_INACTIVE: Activa el producto antes de habilitar pedidos por Bs.';
    end if;
    if not coalesce(v_product.is_sellable, false) then
      raise exception 'QB_AMOUNT_NOT_SELLABLE: Solo los productos vendibles pueden habilitar pedidos por Bs.';
    end if;
    if coalesce(v_product.requires_classification, false)
      or coalesce(v_settings.is_classifiable, false) then
      raise exception 'QB_AMOUNT_RECEIVING_ONLY: Un producto exclusivo de recepcion no puede venderse por Bs.';
    end if;
    if not v_settings.is_qb_active then
      raise exception 'QB_AMOUNT_SETTINGS_INACTIVE: Activa la configuracion operativa del producto.';
    end if;
    if coalesce(v_settings.base_inventory_unit_id, v_settings.inventory_unit_id, v_settings.base_unit_id) is null then
      raise exception 'QB_AMOUNT_BASE_UNIT_REQUIRED: Configura una unidad fisica de inventario.';
    end if;
    if v_settings.base_price_unit_id is null then
      raise exception 'QB_AMOUNT_PRICE_UNIT_REQUIRED: Configura una unidad de precio.';
    end if;
    if v_settings.base_sale_price is null or v_settings.base_sale_price <= 0 then
      raise exception 'QB_AMOUNT_PRICE_REQUIRED: Registra un precio base positivo.';
    end if;

    select unit.dimension_id into v_base_dimension
    from public.qb_units unit
    where unit.id = coalesce(v_settings.base_inventory_unit_id, v_settings.inventory_unit_id, v_settings.base_unit_id)
      and unit.is_active = true
      and unit.conversion_factor_to_base > 0;

    select unit.dimension_id into v_price_dimension
    from public.qb_units unit
    where unit.id = v_settings.base_price_unit_id
      and unit.is_active = true
      and unit.conversion_factor_to_base > 0;

    if v_base_dimension is null or v_price_dimension is null or v_base_dimension <> v_price_dimension then
      raise exception 'QB_AMOUNT_CONVERSION_INVALID: Las unidades fisica y de precio deben tener una conversion valida.';
    end if;

    if not exists (
      select 1
      from public.qb_product_allowed_units allowed
      where allowed.product_id = p_product_id
        and allowed.usage_context = 'pedido'
        and allowed.unit_id = v_settings.base_price_unit_id
        and allowed.is_active = true
    ) then
      raise exception 'QB_AMOUNT_ORDER_UNIT_REQUIRED: Habilita la unidad de precio para pedidos.';
    end if;
  end if;

  update public.qb_product_unit_settings
  set supports_amount_bs = p_enabled,
      updated_by = v_user_id
  where product_id = p_product_id;

  if p_enabled is distinct from v_previous then
    insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
    values (
      v_user_id,
      'set_qb_product_amount_mode',
      'product',
      p_product_id,
      jsonb_build_object('previous_mode', v_previous, 'new_mode', p_enabled)
    );
  end if;

  return jsonb_build_object('product_id', p_product_id, 'supports_amount_bs', p_enabled);
end;
$$;

alter table public.qb_receipt_lines
  add column if not exists order_input_mode text not null default 'quantity',
  add column if not exists requested_amount_bs numeric(18, 2),
  add column if not exists currency_snapshot text,
  add column if not exists pricing_unit_id uuid references public.qb_units(id) on delete restrict,
  add column if not exists estimated_base_quantity numeric(18, 6),
  add column if not exists fixed_line_amount numeric(18, 2);

alter table public.qb_receipt_lines
  drop constraint if exists qb_receipt_lines_amount_contract_check;

alter table public.qb_receipt_lines
  add constraint qb_receipt_lines_amount_contract_check check (
    (
      order_input_mode = 'quantity'
      and requested_amount_bs is null
      and currency_snapshot is null
      and pricing_unit_id is null
      and estimated_base_quantity is null
      and fixed_line_amount is null
    )
    or
    (
      order_input_mode = 'amount_bs'
      and requested_amount_bs is not null
      and requested_amount_bs > 0
      and requested_amount_bs = round(requested_amount_bs, 2)
      and currency_snapshot = 'BOB'
      and pricing_unit_id is not null
      and estimated_base_quantity is not null
      and estimated_base_quantity > 0
      and fixed_line_amount = requested_amount_bs
      and line_total = fixed_line_amount
    )
  );

create or replace function private.apply_qb_amount_receipt_contract()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_mode text;
  v_requested_amount numeric(18, 2);
  v_estimated_base numeric(18, 6);
  v_pricing_unit_id uuid;
  v_price_snapshot numeric(18, 6);
  v_currency text;
begin
  if tg_op = 'UPDATE' and old.order_input_mode = 'amount_bs' then
    new.order_input_mode := old.order_input_mode;
    new.requested_amount_bs := old.requested_amount_bs;
    new.currency_snapshot := old.currency_snapshot;
    new.pricing_unit_id := old.pricing_unit_id;
    new.estimated_base_quantity := old.estimated_base_quantity;
    new.fixed_line_amount := old.fixed_line_amount;
    new.original_base_price := old.original_base_price;
    new.base_price_used := old.base_price_used;
    new.base_price_edited := false;
    new.save_as_new_base_price := false;
    new.final_unit_price := old.final_unit_price;
    new.line_total := old.fixed_line_amount;
    return new;
  end if;

  select
    item.order_input_mode,
    item.requested_amount_bs,
    item.estimated_base_quantity,
    snapshot.pricing_unit_id,
    snapshot.price_base_snapshot,
    snapshot.currency_snapshot
  into
    v_mode,
    v_requested_amount,
    v_estimated_base,
    v_pricing_unit_id,
    v_price_snapshot,
    v_currency
  from public.qb_order_preparation_items preparation_item
  join public.qb_order_items item on item.id = preparation_item.order_item_id
  left join private.qb_order_amount_snapshots snapshot on snapshot.order_item_id = item.id
  where preparation_item.id = new.preparation_item_id;

  if v_mode = 'amount_bs' then
    if v_requested_amount is null or v_requested_amount <= 0
      or v_estimated_base is null or v_estimated_base <= 0
      or v_pricing_unit_id is null or v_price_snapshot is null or v_price_snapshot <= 0
      or v_currency <> 'BOB' then
      raise exception 'QB_AMOUNT_RECEIPT_SNAPSHOT_INVALID: El pedido por Bs no tiene un snapshot monetario valido.';
    end if;

    new.order_input_mode := 'amount_bs';
    new.requested_amount_bs := v_requested_amount;
    new.currency_snapshot := v_currency;
    new.pricing_unit_id := v_pricing_unit_id;
    new.estimated_base_quantity := v_estimated_base;
    new.fixed_line_amount := v_requested_amount;
    new.original_base_price := v_price_snapshot;
    new.base_price_used := v_price_snapshot;
    new.base_price_edited := false;
    new.save_as_new_base_price := false;
    new.final_unit_price := v_price_snapshot;
    new.line_total := v_requested_amount;
  end if;

  return new;
end;
$$;

drop trigger if exists apply_qb_amount_receipt_contract on public.qb_receipt_lines;
create trigger apply_qb_amount_receipt_contract
  before insert or update on public.qb_receipt_lines
  for each row execute function private.apply_qb_amount_receipt_contract();

create or replace function public.recalculate_qb_receipt_totals(p_receipt_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_receipt public.qb_receipts%rowtype;
  v_has_pending_or_invalid boolean;
  v_subtotal numeric(14, 2);
  v_total numeric(14, 2);
begin
  select profile.role into v_user_role
  from public.profiles profile
  where profile.id = v_user_id and profile.is_active = true;

  if v_user_id is null or v_user_role not in ('admin', 'administrador') then
    raise exception 'No tienes permisos para recalcular recibos QB.';
  end if;

  select * into v_receipt
  from public.qb_receipts receipt
  where receipt.id = p_receipt_id
  for update;

  if v_receipt.id is null then raise exception 'Recibo QB no encontrado.'; end if;
  if v_receipt.status <> 'borrador' then raise exception 'Solo se pueden recalcular recibos en borrador.'; end if;

  if v_receipt.distance_factor_percent is null or v_receipt.distance_factor_percent < -100 or v_receipt.distance_factor_percent > 1000
    or v_receipt.exigency_factor_percent is null or v_receipt.exigency_factor_percent < -100 or v_receipt.exigency_factor_percent > 1000
    or v_receipt.weather_factor_percent is null or v_receipt.weather_factor_percent < -100 or v_receipt.weather_factor_percent > 1000
    or v_receipt.extraordinary_factor_percent is null or v_receipt.extraordinary_factor_percent < -100 or v_receipt.extraordinary_factor_percent > 1000 then
    raise exception 'Los factores del recibo deben ser numeros validos dentro del rango permitido.';
  end if;

  update public.qb_receipt_lines line
  set distance_factor_percent = v_receipt.distance_factor_percent,
      exigency_factor_percent = v_receipt.exigency_factor_percent,
      weather_factor_percent = v_receipt.weather_factor_percent,
      extraordinary_factor_percent = v_receipt.extraordinary_factor_percent,
      final_unit_price = case
        when line.order_input_mode = 'amount_bs' then line.original_base_price
        when line.base_price_used is not null and line.base_price_used > 0
          then public.qb_compound_unit_price(line.base_price_used, v_receipt.distance_factor_percent, v_receipt.exigency_factor_percent, v_receipt.weather_factor_percent, v_receipt.extraordinary_factor_percent)
        else null
      end,
      line_total = case
        when line.order_input_mode = 'amount_bs' then line.fixed_line_amount
        when line.delivered_base_quantity > 0 and line.base_price_used is not null and line.base_price_used > 0
          then round(line.delivered_base_quantity * public.qb_compound_unit_price(line.base_price_used, v_receipt.distance_factor_percent, v_receipt.exigency_factor_percent, v_receipt.weather_factor_percent, v_receipt.extraordinary_factor_percent), 2)
        else null
      end
  where line.receipt_id = p_receipt_id;

  select exists (
    select 1 from public.qb_receipt_lines line
    where line.receipt_id = p_receipt_id
      and (
        line.delivered_base_quantity <= 0
        or line.line_total is null or line.line_total <= 0
        or (
          line.order_input_mode = 'amount_bs'
          and (line.requested_amount_bs is null or line.fixed_line_amount <> line.requested_amount_bs or line.line_total <> line.requested_amount_bs)
        )
        or (
          line.order_input_mode = 'quantity'
          and (line.base_price_used is null or line.base_price_used <= 0 or line.final_unit_price is null or line.final_unit_price <= 0)
        )
      )
  ) into v_has_pending_or_invalid;

  if v_has_pending_or_invalid then
    v_subtotal := 0;
    v_total := 0;
  else
    select
      coalesce(round(sum(case when order_input_mode = 'amount_bs' then fixed_line_amount else delivered_base_quantity * base_price_used end), 2), 0),
      coalesce(round(sum(line_total), 2), 0)
    into v_subtotal, v_total
    from public.qb_receipt_lines
    where receipt_id = p_receipt_id;
  end if;

  update public.qb_receipts
  set subtotal_amount = v_subtotal,
      total_amount = v_total,
      summary_snapshot = jsonb_build_object(
        'line_count', (select count(*) from public.qb_receipt_lines where receipt_id = p_receipt_id),
        'order_count', (select count(*) from public.qb_receipt_orders where receipt_id = p_receipt_id),
        'factor_mode', 'compound_percent',
        'amount_mode', 'fixed_requested_amount',
        'has_pending_prices', v_has_pending_or_invalid,
        'non_fiscal', true
      )
  where id = p_receipt_id;
end;
$$;

create or replace function public.confirm_qb_order_delivery(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_order public.qb_orders%rowtype;
  v_preparation public.qb_order_preparations%rowtype;
  v_item public.qb_order_preparation_items%rowtype;
  v_stock_before numeric(14, 3);
  v_stock_after numeric(14, 3);
  v_missing numeric(18, 6);
  v_strict boolean;
  v_movement_id uuid;
  v_delivered_count integer := 0;
begin
  select profile.role into v_user_role
  from public.profiles profile
  where profile.id = v_user_id and profile.is_active = true;

  if v_user_id is null or v_user_role not in ('admin', 'administrador', 'inventario') then
    raise exception 'No tienes permisos para confirmar entregas QB.';
  end if;

  select settings.strict_stock_control into v_strict
  from public.qb_operational_settings settings
  where settings.id = 'main'
  for share;

  select * into v_order from public.qb_orders orders where orders.id = p_order_id for update;
  if v_order.id is null then raise exception 'Pedido QB no encontrado.'; end if;
  if v_order.status <> 'preparado' then raise exception 'Solo se pueden entregar pedidos QB preparados.'; end if;
  if exists (select 1 from public.qb_order_delivery_movements movement where movement.order_id = p_order_id) then
    raise exception 'Este pedido QB ya tiene descuento de stock por entrega.';
  end if;

  select * into v_preparation
  from public.qb_order_preparations preparation
  where preparation.order_id = p_order_id and preparation.status = 'preparado'
  for update;
  if v_preparation.id is null then raise exception 'Preparacion QB no encontrada o no preparada.'; end if;

  for v_item in
    select * from public.qb_order_preparation_items item
    where item.preparation_id = v_preparation.id
    order by item.created_at, item.id
  loop
    if v_item.status = 'no_disponible' then
      if v_item.actual_base_quantity <> 0 then raise exception 'Linea no disponible con cantidad preparada invalida.'; end if;
      continue;
    end if;

    if v_item.actual_base_quantity <= 0 or v_item.conversion_factor_to_base is null or v_item.conversion_factor_to_base <= 0 then
      raise exception 'Linea preparada con cantidad o factor invalido.';
    end if;

    if v_item.conversion_snapshot_id is null or not exists (
      select 1 from public.qb_conversion_snapshots snapshot
      where snapshot.id = v_item.conversion_snapshot_id
        and snapshot.source_table = 'qb_order_preparation_items'
        and snapshot.source_id = v_item.id
        and snapshot.product_id = v_item.product_id
        and abs(snapshot.source_quantity - v_item.actual_quantity) <= 0.001
        and abs(snapshot.base_quantity - v_item.actual_base_quantity) <= 0.001
    ) then
      raise exception 'Snapshot de conversion de preparacion invalido.';
    end if;

    select product.stock_current into v_stock_before
    from public.products product
    where product.id = v_item.product_id
      and product.is_active = true
      and coalesce(product.is_qb_loss_product, false) = false
    for update;

    if v_stock_before is null then raise exception 'Producto de entrega no disponible.'; end if;

    if v_strict and v_stock_before < v_item.actual_base_quantity then
      v_missing := v_item.actual_base_quantity - v_stock_before;
      raise exception 'QB_STOCK_INSUFFICIENT: Existencia disponible: % %. Faltante: % %.',
        round(v_stock_before, 3), coalesce(v_item.actual_base_unit_symbol, v_item.requested_base_unit_symbol),
        round(v_missing, 3), coalesce(v_item.actual_base_unit_symbol, v_item.requested_base_unit_symbol)
        using errcode = 'P0001';
    end if;

    v_stock_after := v_stock_before - v_item.actual_base_quantity;
    insert into public.inventory_movements (product_id, movement_type, quantity, stock_before, stock_after, reason, notes, created_by)
    values (v_item.product_id, 'salida', v_item.actual_base_quantity, v_stock_before, v_stock_after, 'Entrega QB',
      'Entrega QB pedido ' || p_order_id::text || ', preparacion ' || v_preparation.id::text || ', item ' || v_item.id::text, v_user_id)
    returning id into v_movement_id;

    update public.products set stock_current = v_stock_after where id = v_item.product_id;

    insert into public.qb_order_delivery_movements (
      order_id, preparation_id, preparation_item_id, product_id, inventory_movement_id, delivered_base_quantity, delivered_by
    ) values (
      p_order_id, v_preparation.id, v_item.id, v_item.product_id, v_movement_id, v_item.actual_base_quantity, v_user_id
    );
    v_delivered_count := v_delivered_count + 1;
  end loop;

  if v_delivered_count = 0 then raise exception 'No hay cantidades preparadas para entregar.'; end if;

  update public.qb_orders
  set status = 'entregado_pendiente_recibo', delivered_by = v_user_id, delivered_at = now()
  where id = p_order_id;

  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (v_user_id, 'confirm_qb_order_delivery', 'qb_order', p_order_id,
    jsonb_build_object('preparation_id', v_preparation.id, 'movement_count', v_delivered_count, 'strict_stock_control', v_strict));

  return p_order_id;
end;
$$;

revoke all on function public.get_qb_operational_settings() from public, anon;
grant execute on function public.get_qb_operational_settings() to authenticated;
revoke all on function public.set_qb_strict_stock_control(boolean, text) from public, anon;
grant execute on function public.set_qb_strict_stock_control(boolean, text) to authenticated;
revoke all on function public.set_qb_product_amount_mode(uuid, boolean) from public, anon;
grant execute on function public.set_qb_product_amount_mode(uuid, boolean) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'qb_operational_settings'
    ) then
    alter publication supabase_realtime add table public.qb_operational_settings;
  end if;
end;
$$;

commit;
