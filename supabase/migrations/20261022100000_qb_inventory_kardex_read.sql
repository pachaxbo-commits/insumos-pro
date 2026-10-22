begin;

-- Read-only stock history: inventory_movements is the single source for stock
-- changes. Receipt losses without an inventory movement are included as
-- non-stock merma events with no fabricated before/after balance.
create or replace function public.get_qb_inventory_kardex(
  p_date_from date default null,
  p_date_to date default null,
  p_product_id uuid default null,
  p_movement_type text default 'all',
  p_search text default null,
  p_order text default 'desc',
  p_page_size integer default 50,
  p_offset integer default 0
) returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_result jsonb;
begin
  if v_user is null then raise exception 'Inicia sesión para consultar el Kardex.'; end if;
  select role into v_role from public.profiles where id = v_user and is_active = true;
  if v_role is null or v_role not in ('admin', 'administrador', 'inventario') then
    raise exception 'No tienes permiso para consultar movimientos de inventario.';
  end if;
  if p_date_from is not null and p_date_to is not null and p_date_from > p_date_to then
    raise exception 'El rango de fechas no es válido.';
  end if;
  if p_movement_type is null or p_movement_type not in ('all','entrada','salida','merma','ajuste') then
    raise exception 'El tipo de movimiento no es válido.';
  end if;
  if p_order is null or p_order not in ('asc','desc') then raise exception 'El orden no es válido.'; end if;
  if p_page_size is null or p_page_size not between 1 and 1000 then raise exception 'Tamaño de página no válido.'; end if;
  if p_offset is null or p_offset < 0 then raise exception 'Página no válida.'; end if;
  if length(coalesce(p_search,'')) > 120 then raise exception 'La búsqueda es demasiado larga.'; end if;

  with movement_rows as (
    select
      movement.id::text as id,
      movement.product_id,
      product.name as product_name,
      coalesce(unit.symbol, 'Unidad sin configurar') as unit_symbol,
      movement.movement_type,
      movement.quantity,
      movement.stock_before,
      movement.stock_after,
      movement.reason,
      movement.notes,
      movement.created_at,
      profile.full_name as responsible,
      case
        when receipt.id is not null then 'Compra / ingreso · ' || coalesce(nullif(receipt.reference_code,''), left(receipt.id::text,8))
        when delivery.id is not null then 'Entrega · ' || coalesce(order_row.public_reference, left(delivery.order_id::text,8))
        else 'Referencia no disponible'
      end as reference,
      case when receipt.id is not null then '/ingresos'
           when delivery.id is not null then '/pedidos'
           else null end as reference_href,
      coalesce(fifo.lots, '[]'::jsonb) as fifo_lots,
      true as affects_stock
    from public.inventory_movements movement
    join public.products product on product.id = movement.product_id
    left join public.qb_product_unit_settings settings on settings.product_id = product.id
    left join public.qb_units unit on unit.id = coalesce(settings.base_inventory_unit_id, settings.inventory_unit_id, settings.base_unit_id)
    left join public.profiles profile on profile.id = movement.created_by
    left join public.qb_merchandise_receipt_movements receipt_movement on receipt_movement.inventory_movement_id = movement.id
    left join public.qb_merchandise_receipts receipt on receipt.id = receipt_movement.receipt_id
    left join public.qb_order_delivery_movements delivery on delivery.inventory_movement_id = movement.id
    left join public.qb_orders order_row on order_row.id = delivery.order_id
    left join lateral (
      select jsonb_agg(jsonb_build_object(
        'lot_id', consumption.lot_id,
        'received_at', lot.received_at,
        'quantity', consumption.quantity_consumed,
        'historical_unknown', consumption.lot_id is null
      ) order by lot.received_at nulls first, consumption.created_at, consumption.id) as lots
      from public.inventory_lot_consumptions consumption
      left join public.inventory_lots lot on lot.id = consumption.lot_id
      where consumption.inventory_movement_id = movement.id
    ) fifo on true

    union all

    select
      ('receipt-loss:' || loss.id::text) as id,
      line.product_id,
      product.name as product_name,
      coalesce(line.base_unit_symbol, unit.symbol, '—') as unit_symbol,
      'merma'::text as movement_type,
      loss.movement_quantity as quantity,
      null::numeric as stock_before,
      null::numeric as stock_after,
      'Merma registrada en recepción'::text as reason,
      receipt.notes,
      loss.created_at,
      profile.full_name as responsible,
      'Compra / ingreso · ' || coalesce(nullif(receipt.reference_code,''), left(receipt.id::text,8)) as reference,
      '/ingresos'::text as reference_href,
      '[]'::jsonb as fifo_lots,
      false as affects_stock
    from public.qb_merchandise_receipt_movements loss
    join public.qb_merchandise_receipts receipt on receipt.id = loss.receipt_id and receipt.status = 'confirmado'
    join public.qb_merchandise_receipt_lines line on line.id = loss.line_id
    join public.products product on product.id = line.product_id
    left join public.qb_product_unit_settings settings on settings.product_id = line.product_id
    left join public.qb_units unit on unit.id = coalesce(settings.base_inventory_unit_id, settings.inventory_unit_id, settings.base_unit_id)
    left join public.profiles profile on profile.id = receipt.confirmed_by
    where loss.movement_role = 'loss' and loss.inventory_movement_id is null
  ), filtered as (
    select row.* from movement_rows row
    where (p_date_from is null or row.created_at >= (p_date_from::timestamp at time zone 'America/La_Paz'))
      and (p_date_to is null or row.created_at < ((p_date_to + 1)::timestamp at time zone 'America/La_Paz'))
      and (p_product_id is null or row.product_id = p_product_id)
      and (p_movement_type = 'all' or row.movement_type = p_movement_type)
      and (nullif(btrim(coalesce(p_search,'')), '') is null or row.product_name ilike '%' || btrim(p_search) || '%')
  ), summary_by_product as (
    select product_id, product_name, unit_symbol,
      sum(quantity) filter (where movement_type = 'entrada') as inbound,
      sum(quantity) filter (where movement_type = 'salida') as outbound,
      sum(quantity) filter (where movement_type = 'merma') as waste,
      sum(case when movement_type = 'ajuste' and stock_before is not null and stock_after is not null then stock_after - stock_before else 0 end) as adjustment,
      count(*) as operations
    from filtered group by product_id, product_name, unit_symbol
  ), page_rows as (
    select * from filtered
    order by case when p_order = 'asc' then created_at end asc,
             case when p_order = 'desc' then created_at end desc,
             id asc
    offset p_offset limit p_page_size
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'summary', jsonb_build_object(
      'operations', (select count(*) from filtered),
      'products', coalesce((select jsonb_agg(jsonb_build_object(
        'product_id', grouped.product_id,
        'product_name', grouped.product_name,
        'unit_symbol', grouped.unit_symbol,
        'inbound', coalesce(grouped.inbound,0),
        'outbound', coalesce(grouped.outbound,0),
        'waste', coalesce(grouped.waste,0),
        'adjustment', coalesce(grouped.adjustment,0),
        'operations', grouped.operations,
        'stock_current', product.stock_current
      ) order by grouped.product_name)
        from summary_by_product grouped join public.products product on product.id = grouped.product_id), '[]'::jsonb)
    ),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', page.id, 'product_id', page.product_id, 'product_name', page.product_name,
      'unit_symbol', page.unit_symbol, 'movement_type', page.movement_type, 'quantity', page.quantity,
      'stock_before', page.stock_before, 'stock_after', page.stock_after, 'reason', page.reason,
      'notes', page.notes, 'created_at', page.created_at, 'responsible', page.responsible,
      'reference', page.reference, 'reference_href', page.reference_href,
      'fifo_lots', page.fifo_lots, 'affects_stock', page.affects_stock
    ) order by case when p_order = 'asc' then page.created_at end asc,
               case when p_order = 'desc' then page.created_at end desc, page.id asc)
      from page_rows page), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.get_qb_inventory_kardex(date,date,uuid,text,text,text,integer,integer) from public, anon;
grant execute on function public.get_qb_inventory_kardex(date,date,uuid,text,text,text,integer,integer) to authenticated;

commit;
