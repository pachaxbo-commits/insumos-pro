begin;

-- BS/BOB describe dinero. Los pedidos por importe continúan usando
-- supports_amount_bs y nunca una unidad física falsa.
update public.qb_product_allowed_units allowed
set is_active = false,
    is_default = false,
    updated_at = now()
where allowed.usage_context = 'pedido'
  and allowed.is_active = true
  and (
    exists (
      select 1
      from public.qb_units unit
      where unit.id = allowed.unit_id
        and upper(replace(trim(unit.symbol), '.', '')) in ('BS', 'BOB')
    )
    or exists (
      select 1
      from public.qb_product_presentations presentation
      where presentation.id = allowed.presentation_id
        and upper(replace(trim(presentation.symbol), '.', '')) in ('BS', 'BOB')
    )
  );

create or replace function public.enforce_qb_physical_product_units()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_invalid_symbol text;
begin
  select unit.symbol
  into v_invalid_symbol
  from public.qb_units unit
  where unit.id in (
      new.base_unit_id,
      coalesce(new.base_inventory_unit_id, new.inventory_unit_id, new.base_unit_id),
      coalesce(new.base_price_unit_id, new.base_unit_id)
    )
    and upper(replace(trim(unit.symbol), '.', '')) in ('BS', 'BOB')
  limit 1;

  if v_invalid_symbol is not null then
    raise exception
      'QB_CURRENCY_IS_NOT_QUANTITY_UNIT: BS representa dinero; selecciona una unidad física antes de guardar el precio.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_qb_physical_product_units
  on public.qb_product_unit_settings;
create trigger enforce_qb_physical_product_units
  before insert or update of
    base_unit_id,
    inventory_unit_id,
    base_inventory_unit_id,
    base_price_unit_id
  on public.qb_product_unit_settings
  for each row
  execute function public.enforce_qb_physical_product_units();

create or replace function public.enforce_qb_physical_order_unit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_symbol text;
begin
  if new.usage_context <> 'pedido' or not new.is_active then
    return new;
  end if;

  select coalesce(unit.symbol, presentation.symbol)
  into v_symbol
  from (select 1) seed
  left join public.qb_units unit on unit.id = new.unit_id
  left join public.qb_product_presentations presentation
    on presentation.id = new.presentation_id;

  if upper(replace(trim(coalesce(v_symbol, '')), '.', '')) in ('BS', 'BOB') then
    raise exception
      'QB_CURRENCY_IS_NOT_QUANTITY_UNIT: usa la modalidad por importe en Bs, no una unidad física BS.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_qb_physical_order_unit
  on public.qb_product_allowed_units;
create trigger enforce_qb_physical_order_unit
  before insert or update of usage_context, unit_id, presentation_id, is_active
  on public.qb_product_allowed_units
  for each row
  execute function public.enforce_qb_physical_order_unit();

create or replace function public.sync_qb_price_unit_for_orders()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_price_unit_id uuid := coalesce(new.base_price_unit_id, new.base_unit_id);
  v_allowed_id uuid;
  v_has_default boolean;
begin
  if not new.is_qb_active or v_price_unit_id is null then
    return new;
  end if;

  select allowed.id
  into v_allowed_id
  from public.qb_product_allowed_units allowed
  where allowed.product_id = new.product_id
    and allowed.usage_context = 'pedido'
    and allowed.unit_id = v_price_unit_id
  order by allowed.created_at
  limit 1;

  if v_allowed_id is null then
    insert into public.qb_product_allowed_units (
      product_id,
      usage_context,
      unit_id,
      presentation_id,
      is_default,
      quantity_step,
      min_quantity,
      is_active,
      sort_order,
      created_by,
      updated_by
    )
    values (
      new.product_id,
      'pedido',
      v_price_unit_id,
      null,
      false,
      0.5,
      0.5,
      true,
      0,
      auth.uid(),
      auth.uid()
    )
    returning id into v_allowed_id;
  else
    update public.qb_product_allowed_units
    set is_active = true,
        is_default = false,
        updated_by = auth.uid(),
        updated_at = now()
    where id = v_allowed_id;
  end if;

  select exists (
    select 1
    from public.qb_product_allowed_units allowed
    where allowed.product_id = new.product_id
      and allowed.usage_context = 'pedido'
      and allowed.is_active = true
      and allowed.is_default = true
  )
  into v_has_default;

  if not v_has_default then
    update public.qb_product_allowed_units
    set is_default = true,
        updated_by = auth.uid(),
        updated_at = now()
    where id = v_allowed_id;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_qb_price_unit_for_orders
  on public.qb_product_unit_settings;
create trigger sync_qb_price_unit_for_orders
  after insert or update of base_unit_id, base_price_unit_id, is_qb_active
  on public.qb_product_unit_settings
  for each row
  execute function public.sync_qb_price_unit_for_orders();

revoke all on function public.enforce_qb_physical_product_units()
from public, anon, authenticated;
revoke all on function public.enforce_qb_physical_order_unit()
from public, anon, authenticated;
revoke all on function public.sync_qb_price_unit_for_orders()
from public, anon, authenticated;

comment on function public.enforce_qb_physical_product_units() is
  'Impide guardar BS/BOB como unidad base, de inventario o de precio. La unidad física se define antes del precio.';
comment on function public.enforce_qb_physical_order_unit() is
  'Impide reintroducir BS/BOB como unidad de cantidad en pedidos; la modalidad monetaria es independiente.';
comment on function public.sync_qb_price_unit_for_orders() is
  'Al corregir la unidad de cobro asegura que esa unidad física quede disponible al crear pedidos.';

commit;
