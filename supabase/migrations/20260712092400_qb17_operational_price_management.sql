-- QB-17 operational activation: guarded, audited base-price management.

begin;

create or replace function private.audit_qb_product_base_price_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_previous_price numeric(18, 4);
begin
  if tg_op = 'INSERT' then
    if new.base_sale_price is null then
      return new;
    end if;
    v_previous_price := null;
  else
    if new.base_sale_price is not distinct from old.base_sale_price then
      return new;
    end if;
    v_previous_price := old.base_sale_price;
  end if;

  if v_user_id is not null then
    v_role := public.current_user_role();
    if v_role not in ('admin', 'administrador') then
      raise exception 'QB_PRICE_ADMIN_REQUIRED';
    end if;
  end if;

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    v_user_id,
    'update_qb_product_base_price',
    'product',
    new.product_id,
    pg_catalog.jsonb_build_object(
      'previous_base_price', v_previous_price,
      'new_base_price', new.base_sale_price,
      'currency', 'BOB'
    )
  );

  return new;
end;
$$;

revoke all on function private.audit_qb_product_base_price_change() from public, anon, authenticated;

drop trigger if exists audit_qb_product_base_price_change on public.qb_product_unit_settings;
create trigger audit_qb_product_base_price_change
  before insert or update of base_sale_price on public.qb_product_unit_settings
  for each row execute function private.audit_qb_product_base_price_change();

create or replace function public.update_qb_product_base_price(
  p_product_id uuid,
  p_new_price numeric,
  p_expected_price numeric,
  p_remove_price boolean default false
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
  v_price_unit public.qb_units%rowtype;
  v_base_unit public.qb_units%rowtype;
  v_effective_price numeric(18, 4);
  v_qb17_available boolean;
begin
  if v_user_id is null then
    raise exception 'QB_PRICE_AUTH_REQUIRED';
  end if;

  v_role := public.current_user_role();
  if v_role not in ('admin', 'administrador') then
    raise exception 'QB_PRICE_ADMIN_REQUIRED';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'QB_PRICE_PRODUCT_NOT_FOUND';
  end if;
  if not v_product.is_active then
    raise exception 'QB_PRICE_PRODUCT_INACTIVE';
  end if;

  select * into v_settings
  from public.qb_product_unit_settings
  where product_id = p_product_id
  for update;

  if not found then
    raise exception 'QB_PRICE_SETTINGS_NOT_FOUND';
  end if;
  if v_settings.base_sale_price is distinct from p_expected_price then
    raise exception 'QB_PRICE_CONCURRENT_CHANGE';
  end if;

  if p_remove_price then
    if p_new_price is not null then
      raise exception 'QB_PRICE_INVALID';
    end if;
    v_effective_price := null;
  else
    if p_new_price is null
      or p_new_price <= 0
      or p_new_price > 1000000
      or pg_catalog.round(p_new_price, 2) <> p_new_price then
      raise exception 'QB_PRICE_INVALID';
    end if;

    select * into v_price_unit
    from public.qb_units
    where id = v_settings.base_price_unit_id
      and is_active = true;

    select * into v_base_unit
    from public.qb_units
    where id = coalesce(v_settings.base_inventory_unit_id, v_settings.inventory_unit_id, v_settings.base_unit_id)
      and is_active = true;

    if v_price_unit.id is null
      or v_base_unit.id is null
      or v_price_unit.dimension_id <> v_base_unit.dimension_id then
      raise exception 'QB_PRICE_UNIT_INVALID';
    end if;

    v_effective_price := p_new_price;
  end if;

  update public.qb_product_unit_settings
  set base_sale_price = v_effective_price,
      updated_by = v_user_id
  where product_id = p_product_id;

  select (
    v_effective_price > 0
    and v_settings.supports_amount_bs
    and v_settings.is_qb_active
    and v_settings.is_visible_in_qb_catalog
    and coalesce(v_product.is_sellable, true)
    and exists (
      select 1
      from public.qb_product_allowed_units allowed
      join public.qb_units unit_row on unit_row.id = allowed.unit_id and unit_row.is_active
      where allowed.product_id = p_product_id
        and allowed.usage_context = 'pedido'
        and allowed.unit_id = v_settings.base_price_unit_id
        and allowed.is_active
    )
  ) into v_qb17_available;

  return pg_catalog.jsonb_build_object(
    'status', case when p_remove_price then 'removed' else 'updated' end,
    'qb17_available', coalesce(v_qb17_available, false)
  );
end;
$$;

revoke all on function public.update_qb_product_base_price(uuid, numeric, numeric, boolean)
  from public, anon, authenticated;
grant execute on function public.update_qb_product_base_price(uuid, numeric, numeric, boolean)
  to authenticated;

comment on function public.update_qb_product_base_price(uuid, numeric, numeric, boolean) is
  'QB-17: actualiza o retira un precio base con rol administrador, validacion monetaria, bloqueo concurrente y auditoria.';

commit;
