-- QB-7: Recibos acumulativos no fiscales con factores compuestos.
-- Alcance local: crea recibos posteriores a entrega QB-6 sin ventas, pagos, caja, CxC/CxP ni stock.

begin;

alter table public.qb_orders
  drop constraint if exists qb_orders_status_check;

alter table public.qb_orders
  add constraint qb_orders_status_check
  check (status in (
    'pendiente_preparacion',
    'en_preparacion',
    'preparado',
    'entregado_pendiente_recibo',
    'incluido_en_recibo_borrador',
    'recibo_emitido',
    'cancelado'
  ));

create table if not exists public.qb_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null,
  customer_account_id uuid not null references public.customer_accounts(id) on delete restrict,
  status text not null default 'borrador',
  period_start date,
  period_end date,
  distance_factor_percent numeric(7, 3) not null default 0,
  exigency_factor_percent numeric(7, 3) not null default 0,
  weather_factor_percent numeric(7, 3) not null default 0,
  extraordinary_factor_percent numeric(7, 3) not null default 0,
  subtotal_amount numeric(14, 2) not null default 0,
  total_amount numeric(14, 2) not null default 0,
  internal_notes text,
  visible_note text,
  summary_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  issued_by uuid references public.profiles(id) on delete set null,
  issued_at timestamptz,
  voided_by uuid references public.profiles(id) on delete set null,
  voided_at timestamptz,
  void_reason text,
  replacement_for_receipt_id uuid references public.qb_receipts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qb_receipts_number_unique unique (receipt_number),
  constraint qb_receipts_status_check check (status in ('borrador', 'emitido', 'anulado')),
  constraint qb_receipts_factors_check check (
    distance_factor_percent >= -100 and distance_factor_percent <= 1000 and
    exigency_factor_percent >= -100 and exigency_factor_percent <= 1000 and
    weather_factor_percent >= -100 and weather_factor_percent <= 1000 and
    extraordinary_factor_percent >= -100 and extraordinary_factor_percent <= 1000
  ),
  constraint qb_receipts_amounts_check check (subtotal_amount >= 0 and total_amount >= 0),
  constraint qb_receipts_notes_check check (
    (internal_notes is null or length(trim(internal_notes)) <= 1500) and
    (visible_note is null or length(trim(visible_note)) <= 1000)
  ),
  constraint qb_receipts_void_reason_check check (
    status <> 'anulado' or void_reason is null or length(trim(void_reason)) between 3 and 500
  )
);

comment on table public.qb_receipts is
  'QB-7: recibos acumulativos no fiscales. No crean ventas, pagos, caja, CxC/CxP ni movimientos de inventario.';
comment on column public.qb_receipts.distance_factor_percent is
  'Porcentaje guardado como puntos porcentuales. Ej: 5.000 representa 5%.';

create table if not exists public.qb_receipt_orders (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.qb_receipts(id) on delete cascade,
  order_id uuid not null references public.qb_orders(id) on delete restrict,
  customer_account_id uuid not null references public.customer_accounts(id) on delete restrict,
  inclusion_status text not null default 'borrador',
  included_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qb_receipt_orders_receipt_order_unique unique (receipt_id, order_id),
  constraint qb_receipt_orders_status_check check (inclusion_status in ('borrador', 'emitido', 'anulado'))
);

comment on table public.qb_receipt_orders is
  'QB-7: pedidos incluidos en recibos. La unicidad parcial impide doble inclusion activa.';

create unique index if not exists qb_receipt_orders_active_order_unique_idx
  on public.qb_receipt_orders (order_id)
  where inclusion_status in ('borrador', 'emitido');

create table if not exists public.qb_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.qb_receipts(id) on delete cascade,
  receipt_order_id uuid not null references public.qb_receipt_orders(id) on delete cascade,
  order_id uuid not null references public.qb_orders(id) on delete restrict,
  preparation_item_id uuid not null references public.qb_order_preparation_items(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name_snapshot text not null,
  delivered_base_quantity numeric(18, 6) not null,
  base_unit_id uuid references public.qb_units(id) on delete set null,
  base_unit_symbol text not null,
  visible_unit_label text not null,
  conversion_snapshot_id uuid references public.qb_conversion_snapshots(id) on delete set null,
  original_base_price numeric(14, 4) not null,
  base_price_used numeric(14, 4) not null,
  base_price_edited boolean not null default false,
  save_as_new_base_price boolean not null default false,
  distance_factor_percent numeric(7, 3) not null default 0,
  exigency_factor_percent numeric(7, 3) not null default 0,
  weather_factor_percent numeric(7, 3) not null default 0,
  extraordinary_factor_percent numeric(7, 3) not null default 0,
  final_unit_price numeric(14, 4) not null default 0,
  line_total numeric(14, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qb_receipt_lines_receipt_preparation_unique unique (receipt_id, preparation_item_id),
  constraint qb_receipt_lines_quantity_check check (delivered_base_quantity > 0),
  constraint qb_receipt_lines_prices_check check (
    original_base_price >= 0 and
    base_price_used >= 0 and
    final_unit_price >= 0 and
    line_total >= 0
  ),
  constraint qb_receipt_lines_factors_check check (
    distance_factor_percent >= -100 and distance_factor_percent <= 1000 and
    exigency_factor_percent >= -100 and exigency_factor_percent <= 1000 and
    weather_factor_percent >= -100 and weather_factor_percent <= 1000 and
    extraordinary_factor_percent >= -100 and extraordinary_factor_percent <= 1000
  ),
  constraint qb_receipt_lines_notes_check check (notes is null or length(trim(notes)) <= 500)
);

comment on table public.qb_receipt_lines is
  'QB-7: una linea por item preparado y entregado, con precio y factores congelados para recibo no fiscal.';

create table if not exists public.qb_receipt_events (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.qb_receipts(id) on delete cascade,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint qb_receipt_events_type_check
    check (event_type in ('creado', 'lineas_editadas', 'precio_base_actualizado', 'emitido', 'anulado', 'reemplazado'))
);

comment on table public.qb_receipt_events is
  'QB-7: eventos minimos de auditoria de recibos acumulativos.';

create index if not exists qb_receipts_status_created_idx
  on public.qb_receipts (status, created_at desc);

create index if not exists qb_receipts_customer_created_idx
  on public.qb_receipts (customer_account_id, created_at desc);

create index if not exists qb_receipt_orders_receipt_idx
  on public.qb_receipt_orders (receipt_id, inclusion_status);

create index if not exists qb_receipt_orders_customer_idx
  on public.qb_receipt_orders (customer_account_id, created_at desc);

create index if not exists qb_receipt_lines_receipt_idx
  on public.qb_receipt_lines (receipt_id, created_at);

create index if not exists qb_receipt_lines_product_idx
  on public.qb_receipt_lines (product_id, created_at desc);

create index if not exists qb_receipt_events_receipt_idx
  on public.qb_receipt_events (receipt_id, created_at desc);

drop trigger if exists set_qb_receipts_updated_at on public.qb_receipts;
create trigger set_qb_receipts_updated_at
  before update on public.qb_receipts
  for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_qb_receipt_orders_updated_at on public.qb_receipt_orders;
create trigger set_qb_receipt_orders_updated_at
  before update on public.qb_receipt_orders
  for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_qb_receipt_lines_updated_at on public.qb_receipt_lines;
create trigger set_qb_receipt_lines_updated_at
  before update on public.qb_receipt_lines
  for each row execute function public.set_current_timestamp_updated_at();

create or replace function public.qb_compound_unit_price(
  p_base_price numeric,
  p_distance_factor_percent numeric,
  p_exigency_factor_percent numeric,
  p_weather_factor_percent numeric,
  p_extraordinary_factor_percent numeric
)
returns numeric
language sql
immutable
as $$
  select round(
    coalesce(p_base_price, 0)
    * (1 + coalesce(p_distance_factor_percent, 0) / 100)
    * (1 + coalesce(p_exigency_factor_percent, 0) / 100)
    * (1 + coalesce(p_weather_factor_percent, 0) / 100)
    * (1 + coalesce(p_extraordinary_factor_percent, 0) / 100),
    4
  );
$$;

create or replace function public.recalculate_qb_receipt_totals(p_receipt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receipt public.qb_receipts%rowtype;
  v_subtotal numeric(14, 2);
  v_total numeric(14, 2);
begin
  select *
  into v_receipt
  from public.qb_receipts
  where id = p_receipt_id;

  if v_receipt.id is null then
    raise exception 'Recibo QB no encontrado.';
  end if;

  update public.qb_receipt_lines line
  set distance_factor_percent = v_receipt.distance_factor_percent,
      exigency_factor_percent = v_receipt.exigency_factor_percent,
      weather_factor_percent = v_receipt.weather_factor_percent,
      extraordinary_factor_percent = v_receipt.extraordinary_factor_percent,
      final_unit_price = public.qb_compound_unit_price(
        line.base_price_used,
        v_receipt.distance_factor_percent,
        v_receipt.exigency_factor_percent,
        v_receipt.weather_factor_percent,
        v_receipt.extraordinary_factor_percent
      ),
      line_total = round(
        line.delivered_base_quantity
        * public.qb_compound_unit_price(
          line.base_price_used,
          v_receipt.distance_factor_percent,
          v_receipt.exigency_factor_percent,
          v_receipt.weather_factor_percent,
          v_receipt.extraordinary_factor_percent
        ),
        2
      )
  where line.receipt_id = p_receipt_id;

  select
    coalesce(round(sum(delivered_base_quantity * base_price_used), 2), 0),
    coalesce(round(sum(line_total), 2), 0)
  into v_subtotal, v_total
  from public.qb_receipt_lines
  where receipt_id = p_receipt_id;

  update public.qb_receipts
  set subtotal_amount = v_subtotal,
      total_amount = v_total,
      summary_snapshot = jsonb_build_object(
        'line_count', (select count(*) from public.qb_receipt_lines where receipt_id = p_receipt_id),
        'order_count', (select count(*) from public.qb_receipt_orders where receipt_id = p_receipt_id),
        'factor_mode', 'compound_percent',
        'non_fiscal', true
      )
  where id = p_receipt_id;
end;
$$;

create or replace function public.create_qb_receipt_draft(
  p_customer_account_id uuid,
  p_order_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_expected_count integer;
  v_found_count integer;
  v_receipt_id uuid;
  v_receipt_number text;
begin
  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role into v_user_role
  from public.profiles
  where id = v_user_id and is_active = true;

  if v_user_role is null or v_user_role not in ('admin', 'administrador') then
    raise exception 'No tienes permisos para crear recibos QB.';
  end if;

  v_expected_count := coalesce(array_length(p_order_ids, 1), 0);
  if p_customer_account_id is null or v_expected_count = 0 then
    raise exception 'Selecciona cliente y pedidos entregados.';
  end if;

  select count(distinct id)
  into v_found_count
  from public.qb_orders
  where id = any(p_order_ids);

  if v_found_count <> v_expected_count then
    raise exception 'Uno o mas pedidos QB no existen.';
  end if;

  if not exists (
    select 1 from public.customer_accounts customer
    where customer.id = p_customer_account_id
      and customer.is_active = true
  ) then
    raise exception 'Cliente QB no disponible.';
  end if;

  perform 1
  from public.qb_orders orders
  where orders.id = any(p_order_ids)
  for update;

  if exists (
    select 1
    from public.qb_orders orders
    where orders.id = any(p_order_ids)
      and (
        orders.customer_account_id <> p_customer_account_id or
        orders.status <> 'entregado_pendiente_recibo'
      )
  ) then
    raise exception 'Solo puedes incluir pedidos entregados pendientes de recibo del mismo cliente.';
  end if;

  if exists (
    select 1
    from public.qb_receipt_orders receipt_order
    where receipt_order.order_id = any(p_order_ids)
      and receipt_order.inclusion_status in ('borrador', 'emitido')
  ) then
    raise exception 'Uno o mas pedidos ya estan incluidos en un recibo activo.';
  end if;

  if exists (
    select 1
    from public.qb_orders orders
    where orders.id = any(p_order_ids)
      and not exists (
        select 1
        from public.qb_order_delivery_movements movement
        where movement.order_id = orders.id
      )
  ) then
    raise exception 'Todos los pedidos deben tener entrega QB-6 confirmada.';
  end if;

  if exists (
    select 1
    from public.qb_orders orders
    join public.qb_order_preparations preparation on preparation.order_id = orders.id
    join public.qb_order_preparation_items item on item.preparation_id = preparation.id
    join public.qb_order_delivery_movements movement on movement.preparation_item_id = item.id
    join public.products product on product.id = item.product_id
    left join public.qb_product_unit_settings settings on settings.product_id = product.id
    where orders.id = any(p_order_ids)
      and item.status in ('completo', 'parcial')
      and movement.delivered_base_quantity > 0
      and (
        product.is_active = false or
        coalesce(product.is_qb_loss_product, false) = true or
        settings.product_id is null or
        settings.base_sale_price is null or
        settings.base_sale_price < 0
      )
  ) then
    raise exception 'Todos los productos entregados deben tener precio base QB valido y no ser merma.';
  end if;

  v_receipt_number := 'QBR-' || to_char(now(), 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.qb_receipts (
    receipt_number,
    customer_account_id,
    period_start,
    period_end,
    created_by
  )
  select
    v_receipt_number,
    p_customer_account_id,
    min(coalesce(orders.delivered_at, orders.submitted_at))::date,
    max(coalesce(orders.delivered_at, orders.submitted_at))::date,
    v_user_id
  from public.qb_orders orders
  where orders.id = any(p_order_ids)
  returning id into v_receipt_id;

  insert into public.qb_receipt_orders (
    receipt_id,
    order_id,
    customer_account_id
  )
  select
    v_receipt_id,
    orders.id,
    orders.customer_account_id
  from public.qb_orders orders
  where orders.id = any(p_order_ids)
  order by orders.submitted_at, orders.id;

  update public.qb_orders
  set status = 'incluido_en_recibo_borrador'
  where id = any(p_order_ids);

  insert into public.qb_receipt_lines (
    receipt_id,
    receipt_order_id,
    order_id,
    preparation_item_id,
    product_id,
    product_name_snapshot,
    delivered_base_quantity,
    base_unit_id,
    base_unit_symbol,
    visible_unit_label,
    conversion_snapshot_id,
    original_base_price,
    base_price_used,
    final_unit_price,
    line_total
  )
  select
    v_receipt_id,
    receipt_order.id,
    orders.id,
    item.id,
    product.id,
    product.name,
    movement.delivered_base_quantity,
    item.actual_base_unit_id,
    coalesce(item.actual_base_unit_symbol, item.requested_base_unit_symbol),
    coalesce(item.actual_source_label, item.actual_base_unit_symbol, item.requested_base_unit_symbol),
    item.conversion_snapshot_id,
    settings.base_sale_price,
    settings.base_sale_price,
    settings.base_sale_price,
    round(movement.delivered_base_quantity * settings.base_sale_price, 2)
  from public.qb_receipt_orders receipt_order
  join public.qb_orders orders on orders.id = receipt_order.order_id
  join public.qb_order_preparations preparation on preparation.order_id = orders.id
  join public.qb_order_preparation_items item on item.preparation_id = preparation.id
  join public.qb_order_delivery_movements movement on movement.preparation_item_id = item.id
  join public.products product on product.id = item.product_id
  join public.qb_product_unit_settings settings on settings.product_id = product.id
  where receipt_order.receipt_id = v_receipt_id
    and receipt_order.inclusion_status = 'borrador'
    and item.status in ('completo', 'parcial')
    and movement.delivered_base_quantity > 0
    and product.is_active = true
    and coalesce(product.is_qb_loss_product, false) = false
  order by orders.submitted_at, item.created_at;

  if not exists (
    select 1 from public.qb_receipt_lines where receipt_id = v_receipt_id
  ) then
    raise exception 'No hay lineas entregadas cobrables para el recibo QB.';
  end if;

  perform public.recalculate_qb_receipt_totals(v_receipt_id);

  insert into public.qb_receipt_events (receipt_id, event_type, metadata, created_by)
  values (
    v_receipt_id,
    'creado',
    jsonb_build_object('order_count', v_expected_count),
    v_user_id
  );

  return v_receipt_id;
end;
$$;

create or replace function public.update_qb_receipt_draft(
  p_receipt_id uuid,
  p_distance_factor_percent numeric,
  p_exigency_factor_percent numeric,
  p_weather_factor_percent numeric,
  p_extraordinary_factor_percent numeric,
  p_visible_note text,
  p_internal_notes text,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_receipt public.qb_receipts%rowtype;
  v_line jsonb;
  v_line_id uuid;
  v_line_price numeric(14, 4);
  v_save_new boolean;
  v_receipt_line public.qb_receipt_lines%rowtype;
begin
  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role into v_user_role
  from public.profiles
  where id = v_user_id and is_active = true;

  if v_user_role is null or v_user_role not in ('admin', 'administrador') then
    raise exception 'No tienes permisos para editar recibos QB.';
  end if;

  select *
  into v_receipt
  from public.qb_receipts
  where id = p_receipt_id
  for update;

  if v_receipt.id is null then
    raise exception 'Recibo QB no encontrado.';
  end if;

  if v_receipt.status <> 'borrador' then
    raise exception 'Solo se pueden editar recibos QB en borrador.';
  end if;

  if p_distance_factor_percent < -100 or p_distance_factor_percent > 1000
    or p_exigency_factor_percent < -100 or p_exigency_factor_percent > 1000
    or p_weather_factor_percent < -100 or p_weather_factor_percent > 1000
    or p_extraordinary_factor_percent < -100 or p_extraordinary_factor_percent > 1000 then
    raise exception 'Factores de recibo QB invalidos.';
  end if;

  update public.qb_receipts
  set distance_factor_percent = p_distance_factor_percent,
      exigency_factor_percent = p_exigency_factor_percent,
      weather_factor_percent = p_weather_factor_percent,
      extraordinary_factor_percent = p_extraordinary_factor_percent,
      visible_note = nullif(trim(coalesce(p_visible_note, '')), ''),
      internal_notes = nullif(trim(coalesce(p_internal_notes, '')), '')
  where id = p_receipt_id;

  if p_lines is not null and jsonb_typeof(p_lines) = 'array' then
    for v_line in select * from jsonb_array_elements(p_lines)
    loop
      v_line_id := (v_line ->> 'line_id')::uuid;
      v_line_price := nullif(v_line ->> 'base_price_used', '')::numeric;
      v_save_new := coalesce((v_line ->> 'save_as_new_base_price')::boolean, false);

      if v_line_price is null or v_line_price < 0 then
        raise exception 'Precio base de linea invalido.';
      end if;

      select *
      into v_receipt_line
      from public.qb_receipt_lines
      where id = v_line_id
        and receipt_id = p_receipt_id
      for update;

      if v_receipt_line.id is null then
        raise exception 'Linea de recibo QB invalida.';
      end if;

      update public.qb_receipt_lines
      set base_price_used = v_line_price,
          base_price_edited = abs(v_line_price - original_base_price) > 0.0001,
          save_as_new_base_price = v_save_new,
          notes = nullif(trim(coalesce(v_line ->> 'notes', '')), '')
      where id = v_line_id;

      if v_save_new then
        update public.qb_product_unit_settings
        set base_sale_price = v_line_price,
            base_price_unit_id = coalesce(base_price_unit_id, v_receipt_line.base_unit_id),
            updated_by = v_user_id
        where product_id = v_receipt_line.product_id;

        insert into public.qb_receipt_events (receipt_id, event_type, metadata, created_by)
        values (
          p_receipt_id,
          'precio_base_actualizado',
          jsonb_build_object(
            'product_id', v_receipt_line.product_id,
            'receipt_line_id', v_line_id,
            'new_base_price', v_line_price
          ),
          v_user_id
        );
      end if;
    end loop;
  end if;

  perform public.recalculate_qb_receipt_totals(p_receipt_id);

  insert into public.qb_receipt_events (receipt_id, event_type, metadata, created_by)
  values (
    p_receipt_id,
    'lineas_editadas',
    jsonb_build_object(
      'distance_factor_percent', p_distance_factor_percent,
      'exigency_factor_percent', p_exigency_factor_percent,
      'weather_factor_percent', p_weather_factor_percent,
      'extraordinary_factor_percent', p_extraordinary_factor_percent
    ),
    v_user_id
  );

  return p_receipt_id;
end;
$$;

create or replace function public.emit_qb_receipt(p_receipt_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_receipt public.qb_receipts%rowtype;
begin
  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role into v_user_role
  from public.profiles
  where id = v_user_id and is_active = true;

  if v_user_role is null or v_user_role not in ('admin', 'administrador') then
    raise exception 'No tienes permisos para emitir recibos QB.';
  end if;

  select *
  into v_receipt
  from public.qb_receipts
  where id = p_receipt_id
  for update;

  if v_receipt.id is null then
    raise exception 'Recibo QB no encontrado.';
  end if;

  if v_receipt.status <> 'borrador' then
    raise exception 'Solo se pueden emitir recibos QB en borrador.';
  end if;

  if not exists (select 1 from public.qb_receipt_orders where receipt_id = p_receipt_id and inclusion_status = 'borrador') then
    raise exception 'El recibo QB no tiene pedidos.';
  end if;

  if not exists (select 1 from public.qb_receipt_lines where receipt_id = p_receipt_id) then
    raise exception 'El recibo QB no tiene lineas.';
  end if;

  if exists (
    select 1
    from public.qb_receipt_orders receipt_order
    join public.qb_orders orders on orders.id = receipt_order.order_id
    where receipt_order.receipt_id = p_receipt_id
      and (
        receipt_order.inclusion_status <> 'borrador' or
        orders.status <> 'incluido_en_recibo_borrador'
      )
  ) then
    raise exception 'Los pedidos del recibo QB ya no estan disponibles para emision.';
  end if;

  perform public.recalculate_qb_receipt_totals(p_receipt_id);

  update public.qb_receipts
  set status = 'emitido',
      issued_by = v_user_id,
      issued_at = now()
  where id = p_receipt_id;

  update public.qb_receipt_orders
  set inclusion_status = 'emitido'
  where receipt_id = p_receipt_id
    and inclusion_status = 'borrador';

  update public.qb_orders orders
  set status = 'recibo_emitido'
  where exists (
    select 1
    from public.qb_receipt_orders receipt_order
    where receipt_order.receipt_id = p_receipt_id
      and receipt_order.order_id = orders.id
  );

  insert into public.qb_receipt_events (receipt_id, event_type, metadata, created_by)
  values (
    p_receipt_id,
    'emitido',
    jsonb_build_object('total_amount', (select total_amount from public.qb_receipts where id = p_receipt_id)),
    v_user_id
  );

  return p_receipt_id;
end;
$$;

create or replace function public.void_qb_receipt(
  p_receipt_id uuid,
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
  v_receipt public.qb_receipts%rowtype;
  v_reason text;
begin
  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role into v_user_role
  from public.profiles
  where id = v_user_id and is_active = true;

  if v_user_role is null or v_user_role not in ('admin', 'administrador') then
    raise exception 'No tienes permisos para anular recibos QB.';
  end if;

  select *
  into v_receipt
  from public.qb_receipts
  where id = p_receipt_id
  for update;

  if v_receipt.id is null then
    raise exception 'Recibo QB no encontrado.';
  end if;

  if v_receipt.status not in ('borrador', 'emitido') then
    raise exception 'Solo se pueden anular recibos QB en borrador o emitidos.';
  end if;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');

  if v_receipt.status = 'emitido' and (v_reason is null or length(v_reason) < 3) then
    raise exception 'La anulacion de un recibo emitido requiere motivo.';
  end if;

  update public.qb_receipts
  set status = 'anulado',
      voided_by = v_user_id,
      voided_at = now(),
      void_reason = v_reason
  where id = p_receipt_id;

  update public.qb_receipt_orders
  set inclusion_status = 'anulado'
  where receipt_id = p_receipt_id
    and inclusion_status in ('borrador', 'emitido');

  update public.qb_orders orders
  set status = 'entregado_pendiente_recibo'
  where exists (
    select 1
    from public.qb_receipt_orders receipt_order
    where receipt_order.receipt_id = p_receipt_id
      and receipt_order.order_id = orders.id
  );

  insert into public.qb_receipt_events (receipt_id, event_type, metadata, created_by)
  values (
    p_receipt_id,
    'anulado',
    jsonb_build_object('reason', v_reason, 'previous_status', v_receipt.status),
    v_user_id
  );

  return p_receipt_id;
end;
$$;

revoke all on function public.qb_compound_unit_price(numeric, numeric, numeric, numeric, numeric) from public;
grant execute on function public.qb_compound_unit_price(numeric, numeric, numeric, numeric, numeric) to authenticated;

revoke all on function public.recalculate_qb_receipt_totals(uuid) from public, anon, authenticated;

revoke all on function public.create_qb_receipt_draft(uuid, uuid[]) from public, anon;
grant execute on function public.create_qb_receipt_draft(uuid, uuid[]) to authenticated;

revoke all on function public.update_qb_receipt_draft(uuid, numeric, numeric, numeric, numeric, text, text, jsonb) from public, anon;
grant execute on function public.update_qb_receipt_draft(uuid, numeric, numeric, numeric, numeric, text, text, jsonb) to authenticated;

revoke all on function public.emit_qb_receipt(uuid) from public, anon;
grant execute on function public.emit_qb_receipt(uuid) to authenticated;

revoke all on function public.void_qb_receipt(uuid, text) from public, anon;
grant execute on function public.void_qb_receipt(uuid, text) to authenticated;

alter table public.qb_receipts enable row level security;
alter table public.qb_receipt_orders enable row level security;
alter table public.qb_receipt_lines enable row level security;
alter table public.qb_receipt_events enable row level security;

drop policy if exists "Internal roles can view QB receipts" on public.qb_receipts;
create policy "Internal roles can view QB receipts"
  on public.qb_receipts for select
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Internal roles can view QB receipt orders" on public.qb_receipt_orders;
create policy "Internal roles can view QB receipt orders"
  on public.qb_receipt_orders for select
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Internal roles can view QB receipt lines" on public.qb_receipt_lines;
create policy "Internal roles can view QB receipt lines"
  on public.qb_receipt_lines for select
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Internal roles can view QB receipt events" on public.qb_receipt_events;
create policy "Internal roles can view QB receipt events"
  on public.qb_receipt_events for select
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'));

-- Sin politicas directas de insert/update/delete:
-- creacion, edicion, emision y anulacion ocurren por RPCs QB-7 con control de rol.

commit;
