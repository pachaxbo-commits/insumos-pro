begin;

do $$
declare
  v_admin_id uuid;
  v_inventory_id uuid;
  v_product_id uuid;
  v_non_backed_id uuid;
  v_old_price numeric;
  v_test_price numeric := 12.34;
  v_stock numeric;
  v_movements bigint;
  v_snapshots bigint;
  v_audit_before bigint;
  v_available boolean;
begin
  select id into v_admin_id from public.profiles where role in ('admin', 'administrador') and is_active order by id limit 1;
  select id into v_inventory_id from public.profiles where role = 'inventario' and is_active order by id limit 1;
  if v_admin_id is null then raise exception 'QA_REQUIRES_ACTIVE_ADMIN'; end if;

  select p.id, s.base_sale_price, p.stock_current
  into v_product_id, v_old_price, v_stock
  from public.products p
  join public.qb_product_unit_settings s on s.product_id = p.id
  join public.qb_units u on u.id = s.base_price_unit_id and u.is_active
  join public.qb_product_allowed_units a on a.product_id = p.id and a.usage_context = 'pedido' and a.unit_id = u.id and a.is_active
  where p.is_active and p.is_sellable and s.is_qb_active and s.is_visible_in_qb_catalog
    and s.supports_amount_bs and s.base_sale_price is null
  order by p.id limit 1;
  if v_product_id is null then raise exception 'QA_REQUIRES_BACKED_PRICELESS_PRODUCT'; end if;

  select p.id into v_non_backed_id
  from public.products p join public.qb_product_unit_settings s on s.product_id = p.id
  where p.is_active and not s.supports_amount_bs order by p.id limit 1;

  select count(*) into v_movements from public.inventory_movements;
  select count(*) into v_snapshots from private.qb_order_amount_snapshots;
  select count(*) into v_audit_before from public.audit_logs where entity_id = v_product_id and action = 'update_qb_product_base_price';

  perform pg_catalog.set_config('request.jwt.claims', pg_catalog.jsonb_build_object('sub', v_admin_id, 'role', 'authenticated')::text, true);

  select amount_bs_available into v_available from public.get_qb17_public_catalog() where product_id = v_product_id;
  if coalesce(v_available, false) then raise exception 'A_NULL_PRICE_MUST_REMAIN_BLOCKED'; end if;

  begin
    perform public.update_qb_product_base_price(v_product_id, 0, null, false);
    raise exception 'B_ZERO_PRICE_ACCEPTED';
  exception when others then if sqlerrm = 'B_ZERO_PRICE_ACCEPTED' then raise; end if; end;

  begin
    perform public.update_qb_product_base_price(v_product_id, -1, null, false);
    raise exception 'C_NEGATIVE_PRICE_ACCEPTED';
  exception when others then if sqlerrm = 'C_NEGATIVE_PRICE_ACCEPTED' then raise; end if; end;

  perform public.update_qb_product_base_price(v_product_id, v_test_price, null, false);
  select amount_bs_available into v_available from public.get_qb17_public_catalog() where product_id = v_product_id;
  if not coalesce(v_available, false) then raise exception 'D_POSITIVE_PRICE_DID_NOT_ACTIVATE'; end if;

  if exists (select 1 from public.get_qb17_public_catalog() where product_id = v_non_backed_id and amount_bs_available) then
    raise exception 'E_NON_BACKED_PRODUCT_EXPOSED_AMOUNT_MODE';
  end if;

  if (select count(*) from private.qb_order_amount_snapshots) <> v_snapshots then raise exception 'H_HISTORICAL_SNAPSHOTS_CHANGED'; end if;
  if pg_catalog.pg_get_functiondef('private.prepare_qb17_order_items(jsonb)'::regprocedure) not like '%settings.base_sale_price%' then raise exception 'I_CURRENT_PRICE_NOT_USED_FOR_NEW_ORDER'; end if;
  if (select count(*) from public.audit_logs where entity_id = v_product_id and action = 'update_qb_product_base_price') <> v_audit_before + 1 then raise exception 'J_AUDIT_NOT_RECORDED'; end if;

  if v_inventory_id is not null then
    perform pg_catalog.set_config('request.jwt.claims', pg_catalog.jsonb_build_object('sub', v_inventory_id, 'role', 'authenticated')::text, true);
    begin
      update public.qb_product_unit_settings set base_sale_price = v_test_price + 1 where product_id = v_product_id;
      raise exception 'K_INVENTORY_CHANGED_PRICE';
    exception when others then if sqlerrm = 'K_INVENTORY_CHANGED_PRICE' then raise; end if; end;
    perform pg_catalog.set_config('request.jwt.claims', pg_catalog.jsonb_build_object('sub', v_admin_id, 'role', 'authenticated')::text, true);
  end if;

  if (select stock_current from public.products where id = v_product_id) is distinct from v_stock then raise exception 'M_STOCK_CHANGED'; end if;
  if (select count(*) from public.inventory_movements) <> v_movements then raise exception 'N_MOVEMENTS_CREATED'; end if;

  perform public.update_qb_product_base_price(v_product_id, null, v_test_price, true);
  raise notice 'QB17_OPERATIONAL_QA A-O PASSED; transaction will roll back.';
end;
$$;

rollback;
