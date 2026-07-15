-- QB-13: precios pendientes en borradores y validación estricta antes de emitir.

begin;

alter table public.qb_receipt_lines
  alter column original_base_price drop not null,
  alter column base_price_used drop not null,
  alter column final_unit_price drop not null,
  alter column line_total drop not null;

alter table public.qb_receipt_lines
  drop constraint if exists qb_receipt_lines_prices_check;

alter table public.qb_receipt_lines
  add constraint qb_receipt_lines_prices_check check (
    (original_base_price is null or (
      original_base_price::text not in ('NaN', 'Infinity', '-Infinity') and
      original_base_price >= 0
    )) and
    (base_price_used is null or (
      base_price_used::text not in ('NaN', 'Infinity', '-Infinity') and
      base_price_used >= 0
    )) and
    (final_unit_price is null or (
      final_unit_price::text not in ('NaN', 'Infinity', '-Infinity') and
      final_unit_price >= 0
    )) and
    (line_total is null or (
      line_total::text not in ('NaN', 'Infinity', '-Infinity') and
      line_total >= 0
    ))
  );

comment on column public.qb_receipt_lines.base_price_used is
  'QB-13: NULL representa precio pendiente mientras el recibo permanece en borrador.';

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
  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role into v_user_role
  from public.profiles
  where id = v_user_id and is_active = true;

  if v_user_role is null or v_user_role not in ('admin', 'administrador') then
    raise exception 'No tienes permisos para recalcular recibos QB.';
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
    raise exception 'Solo se pueden recalcular recibos en borrador.';
  end if;

  if v_receipt.distance_factor_percent is null
    or v_receipt.distance_factor_percent::text in ('NaN', 'Infinity', '-Infinity')
    or v_receipt.distance_factor_percent < -100
    or v_receipt.distance_factor_percent > 1000
    or v_receipt.exigency_factor_percent is null
    or v_receipt.exigency_factor_percent::text in ('NaN', 'Infinity', '-Infinity')
    or v_receipt.exigency_factor_percent < -100
    or v_receipt.exigency_factor_percent > 1000
    or v_receipt.weather_factor_percent is null
    or v_receipt.weather_factor_percent::text in ('NaN', 'Infinity', '-Infinity')
    or v_receipt.weather_factor_percent < -100
    or v_receipt.weather_factor_percent > 1000
    or v_receipt.extraordinary_factor_percent is null
    or v_receipt.extraordinary_factor_percent::text in ('NaN', 'Infinity', '-Infinity')
    or v_receipt.extraordinary_factor_percent < -100
    or v_receipt.extraordinary_factor_percent > 1000 then
    raise exception 'Los factores del recibo deben ser numeros validos dentro del rango permitido.';
  end if;

  update public.qb_receipt_lines line
  set distance_factor_percent = v_receipt.distance_factor_percent,
      exigency_factor_percent = v_receipt.exigency_factor_percent,
      weather_factor_percent = v_receipt.weather_factor_percent,
      extraordinary_factor_percent = v_receipt.extraordinary_factor_percent,
      final_unit_price = case
        when line.base_price_used is not null
          and line.base_price_used::text not in ('NaN', 'Infinity', '-Infinity')
          and line.base_price_used > 0
          then public.qb_compound_unit_price(
            line.base_price_used,
            v_receipt.distance_factor_percent,
            v_receipt.exigency_factor_percent,
            v_receipt.weather_factor_percent,
            v_receipt.extraordinary_factor_percent
          )
        else null
      end,
      line_total = case
        when line.delivered_base_quantity::text not in ('NaN', 'Infinity', '-Infinity')
          and line.delivered_base_quantity > 0
          and line.base_price_used is not null
          and line.base_price_used::text not in ('NaN', 'Infinity', '-Infinity')
          and line.base_price_used > 0
          then round(
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
        else null
      end
  where line.receipt_id = p_receipt_id;

  select exists (
    select 1
    from public.qb_receipt_lines line
    where line.receipt_id = p_receipt_id
      and (
        line.delivered_base_quantity::text in ('NaN', 'Infinity', '-Infinity') or
        line.delivered_base_quantity <= 0 or
        line.base_price_used is null or
        line.base_price_used::text in ('NaN', 'Infinity', '-Infinity') or
        line.base_price_used <= 0 or
        line.final_unit_price is null or
        line.final_unit_price::text in ('NaN', 'Infinity', '-Infinity') or
        line.final_unit_price <= 0 or
        line.line_total is null or
        line.line_total::text in ('NaN', 'Infinity', '-Infinity') or
        line.line_total <= 0
      )
  )
  into v_has_pending_or_invalid;

  if v_has_pending_or_invalid then
    v_subtotal := 0;
    v_total := 0;
  else
    select
      coalesce(round(sum(delivered_base_quantity * base_price_used), 2), 0),
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
        'has_pending_prices', v_has_pending_or_invalid,
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
set search_path = pg_catalog
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
        settings.base_sale_price::text in ('NaN', 'Infinity', '-Infinity') or
        settings.base_sale_price < 0
      )
  ) then
    raise exception 'Todos los productos entregados deben tener configuracion QB valida y no ser merma.';
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
    case
      when settings.base_sale_price::text not in ('NaN', 'Infinity', '-Infinity')
        and settings.base_sale_price > 0 then settings.base_sale_price
      else null
    end,
    case
      when settings.base_sale_price::text not in ('NaN', 'Infinity', '-Infinity')
        and settings.base_sale_price > 0
        then round(movement.delivered_base_quantity * settings.base_sale_price, 2)
      else null
    end
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
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_receipt public.qb_receipts%rowtype;
  v_line jsonb;
  v_line_id uuid;
  v_line_price_text text;
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

  if p_distance_factor_percent is null
    or p_distance_factor_percent::text in ('NaN', 'Infinity', '-Infinity')
    or p_distance_factor_percent < -100 or p_distance_factor_percent > 1000
    or p_exigency_factor_percent is null
    or p_exigency_factor_percent::text in ('NaN', 'Infinity', '-Infinity')
    or p_exigency_factor_percent < -100 or p_exigency_factor_percent > 1000
    or p_weather_factor_percent is null
    or p_weather_factor_percent::text in ('NaN', 'Infinity', '-Infinity')
    or p_weather_factor_percent < -100 or p_weather_factor_percent > 1000
    or p_extraordinary_factor_percent is null
    or p_extraordinary_factor_percent::text in ('NaN', 'Infinity', '-Infinity')
    or p_extraordinary_factor_percent < -100 or p_extraordinary_factor_percent > 1000 then
    raise exception 'Los factores del recibo deben ser numeros validos dentro del rango permitido.';
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
      v_line_price_text := nullif(trim(coalesce(v_line ->> 'base_price_used', '')), '');
      v_save_new := coalesce((v_line ->> 'save_as_new_base_price')::boolean, false);

      if v_line_price_text is null then
        v_line_price := null;
      else
        begin
          v_line_price := v_line_price_text::numeric;
        exception
          when invalid_text_representation or numeric_value_out_of_range then
            raise exception 'El precio debe ser un numero positivo valido.';
        end;

        if v_line_price::text in ('NaN', 'Infinity', '-Infinity')
          or v_line_price <= 0
          or v_line_price > 99999999 then
          raise exception 'El precio debe ser un numero positivo valido.';
        end if;
      end if;

      if v_save_new and v_line_price is null then
        raise exception 'Ingresa un precio positivo antes de guardarlo como precio base.';
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
          base_price_edited = case
            when v_line_price is null then original_base_price is not null
            else original_base_price is null
              or original_base_price::text in ('NaN', 'Infinity', '-Infinity')
              or abs(v_line_price - original_base_price) > 0.0001
          end,
          save_as_new_base_price = case when v_line_price is null then false else v_save_new end,
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
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_receipt public.qb_receipts%rowtype;
  v_line_count integer;
  v_valid_line_count integer;
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

  if v_receipt.distance_factor_percent is null
    or v_receipt.distance_factor_percent::text in ('NaN', 'Infinity', '-Infinity')
    or v_receipt.distance_factor_percent < -100
    or v_receipt.distance_factor_percent > 1000
    or v_receipt.exigency_factor_percent is null
    or v_receipt.exigency_factor_percent::text in ('NaN', 'Infinity', '-Infinity')
    or v_receipt.exigency_factor_percent < -100
    or v_receipt.exigency_factor_percent > 1000
    or v_receipt.weather_factor_percent is null
    or v_receipt.weather_factor_percent::text in ('NaN', 'Infinity', '-Infinity')
    or v_receipt.weather_factor_percent < -100
    or v_receipt.weather_factor_percent > 1000
    or v_receipt.extraordinary_factor_percent is null
    or v_receipt.extraordinary_factor_percent::text in ('NaN', 'Infinity', '-Infinity')
    or v_receipt.extraordinary_factor_percent < -100
    or v_receipt.extraordinary_factor_percent > 1000 then
    raise exception 'Los factores del recibo deben ser numeros validos dentro del rango permitido.';
  end if;

  if not exists (
    select 1
    from public.qb_receipt_orders
    where receipt_id = p_receipt_id and inclusion_status = 'borrador'
  ) then
    raise exception 'El recibo QB no tiene pedidos.';
  end if;

  select
    count(*)::integer,
    count(*) filter (
      where delivered_base_quantity::text not in ('NaN', 'Infinity', '-Infinity')
        and delivered_base_quantity > 0
        and (original_base_price is null or (
          original_base_price::text not in ('NaN', 'Infinity', '-Infinity')
          and original_base_price >= 0
        ))
        and base_price_used is not null
        and base_price_used::text not in ('NaN', 'Infinity', '-Infinity')
        and base_price_used > 0
        and final_unit_price is not null
        and final_unit_price::text not in ('NaN', 'Infinity', '-Infinity')
        and final_unit_price > 0
        and line_total is not null
        and line_total::text not in ('NaN', 'Infinity', '-Infinity')
        and line_total > 0
    )::integer
  into v_line_count, v_valid_line_count
  from public.qb_receipt_lines
  where receipt_id = p_receipt_id;

  if v_line_count = 0 then
    raise exception 'El recibo QB no tiene lineas.';
  end if;

  if v_valid_line_count <> v_line_count then
    raise exception 'Completa precios positivos y cantidades validas en todas las lineas antes de emitir.';
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

  select *
  into v_receipt
  from public.qb_receipts
  where id = p_receipt_id;

  if v_receipt.subtotal_amount is null
    or v_receipt.subtotal_amount::text in ('NaN', 'Infinity', '-Infinity')
    or v_receipt.subtotal_amount <= 0 then
    raise exception 'El subtotal del recibo debe ser positivo antes de emitir.';
  end if;

  if v_receipt.total_amount is null
    or v_receipt.total_amount::text in ('NaN', 'Infinity', '-Infinity')
    or v_receipt.total_amount <= 0 then
    raise exception 'El total del recibo debe ser positivo antes de emitir.';
  end if;

  if exists (
    select 1
    from public.qb_receipt_lines
    where receipt_id = p_receipt_id
      and (
        delivered_base_quantity::text in ('NaN', 'Infinity', '-Infinity') or
        delivered_base_quantity <= 0 or
        (original_base_price is not null and (
          original_base_price::text in ('NaN', 'Infinity', '-Infinity') or
          original_base_price < 0
        )) or
        base_price_used is null or
        base_price_used::text in ('NaN', 'Infinity', '-Infinity') or
        base_price_used <= 0 or
        final_unit_price is null or
        final_unit_price::text in ('NaN', 'Infinity', '-Infinity') or
        final_unit_price <= 0 or
        line_total is null or
        line_total::text in ('NaN', 'Infinity', '-Infinity') or
        line_total <= 0
      )
  ) then
    raise exception 'El recibo contiene lineas pendientes o invalidas.';
  end if;

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
    jsonb_build_object('total_amount', v_receipt.total_amount),
    v_user_id
  );

  return p_receipt_id;
end;
$$;

comment on function public.create_qb_receipt_draft(uuid, uuid[]) is
  'QB-13: crea borradores acumulativos y conserva NULL como precio pendiente.';

comment on function public.emit_qb_receipt(uuid) is
  'QB-13: emite solo recibos con líneas, cantidades, precios, subtotal y total estrictamente positivos.';

commit;
