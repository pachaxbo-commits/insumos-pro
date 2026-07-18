-- QB-18: lotes administrativos para activacion operativa.

begin;

create table private.qb_operational_import_batches (
  id uuid primary key default extensions.gen_random_uuid(),
  import_type text not null check (import_type in ('prices', 'conversions', 'initial_stock')),
  file_hash text not null check (file_hash ~ '^[a-f0-9]{64}$'),
  status text not null check (status in ('applied', 'rejected')),
  total_rows integer not null check (total_rows >= 0),
  applied_rows integer not null check (applied_rows >= 0),
  unchanged_rows integer not null check (unchanged_rows >= 0),
  result_summary jsonb not null default '{}'::jsonb,
  receipt_id uuid references public.qb_merchandise_receipts(id) on delete restrict,
  applied_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now()
);

create unique index qb_operational_import_batches_applied_hash_idx
  on private.qb_operational_import_batches(import_type, file_hash)
  where status = 'applied';

revoke all on table private.qb_operational_import_batches from public, anon, authenticated;

create or replace function public.get_qb_operational_activation_summary()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select case
    when auth.uid() is null or public.current_user_role() not in ('admin', 'administrador') then
      pg_catalog.jsonb_build_object('error', 'QB_OPERATIONAL_ADMIN_REQUIRED')
    else pg_catalog.jsonb_build_object(
      'published_products', (select pg_catalog.count(*) from public.products p join public.qb_product_unit_settings s on s.product_id=p.id where p.is_active and s.is_qb_active and s.is_visible_in_qb_catalog),
      'bs_backed', (select pg_catalog.count(*) from public.qb_product_unit_settings where supports_amount_bs),
      'bs_available', (select pg_catalog.count(*) from public.get_qb17_public_catalog() where amount_bs_available),
      'missing_prices', (select pg_catalog.count(*) from public.qb_product_unit_settings where base_sale_price is null),
      'receiving_configured', (select pg_catalog.count(distinct product_id) from public.qb_product_allowed_units where usage_context='recepcion' and is_active),
      'pending_conversions', (select pg_catalog.count(*) from public.products p join public.qb_product_unit_settings s on s.product_id=p.id where p.is_active and s.is_qb_active and s.is_visible_in_qb_catalog and not exists (select 1 from public.qb_product_allowed_units a where a.product_id=p.id and a.usage_context='recepcion' and a.is_active)),
      'negative_stock', (select pg_catalog.count(*) from public.products where is_active and stock_current < 0),
      'without_movements', (select pg_catalog.count(*) from public.products p where p.is_active and not exists (select 1 from public.inventory_movements m where m.product_id=p.id)),
      'last_imports', coalesce((select pg_catalog.jsonb_object_agg(import_type, created_at) from (select distinct on (import_type) import_type, created_at from private.qb_operational_import_batches where status='applied' order by import_type, created_at desc) latest), '{}'::jsonb)
    ) end;
$$;

revoke all on function public.get_qb_operational_activation_summary() from public, anon, authenticated;
grant execute on function public.get_qb_operational_activation_summary() to authenticated;

create or replace function public.apply_qb_operational_import(
  p_import_type text,
  p_file_hash text,
  p_rows jsonb,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_row jsonb;
  v_total integer;
  v_applied integer := 0;
  v_unchanged integer := 0;
  v_product_id uuid;
  v_target_id uuid;
  v_allowed_id uuid;
  v_expected numeric;
  v_new numeric;
  v_quantity numeric;
  v_cutoff date;
  v_cutoff_max date;
  v_receipt_id uuid;
  v_line_id uuid;
  v_snapshot_id uuid;
  v_product record;
  v_settings record;
  v_unit record;
  v_presentation record;
  v_existing_factor numeric;
  v_batch_id uuid;
begin
  if v_user_id is null then raise exception 'QB_OPERATIONAL_AUTH_REQUIRED'; end if;
  v_role := public.current_user_role();
  if v_role not in ('admin', 'administrador') then raise exception 'QB_OPERATIONAL_ADMIN_REQUIRED'; end if;
  if p_confirmation <> 'APLICAR' then raise exception 'QB_OPERATIONAL_CONFIRMATION_REQUIRED'; end if;
  if p_import_type not in ('prices', 'conversions', 'initial_stock') then raise exception 'QB_OPERATIONAL_INVALID_TYPE'; end if;
  if p_file_hash !~ '^[a-f0-9]{64}$' then raise exception 'QB_OPERATIONAL_INVALID_HASH'; end if;
  if p_rows is null or pg_catalog.jsonb_typeof(p_rows) <> 'array' then raise exception 'QB_OPERATIONAL_INVALID_ROWS'; end if;
  v_total := pg_catalog.jsonb_array_length(p_rows);
  if v_total < 1 or v_total > 500 then raise exception 'QB_OPERATIONAL_INVALID_ROWS'; end if;
  if exists (select 1 from pg_catalog.jsonb_array_elements(p_rows) grouped group by grouped.value->>'product_id' having pg_catalog.count(*)>1) then raise exception 'QB_OPERATIONAL_DUPLICATE_PRODUCT'; end if;
  if exists (select 1 from private.qb_operational_import_batches where import_type=p_import_type and file_hash=p_file_hash and status='applied') then raise exception 'QB_OPERATIONAL_ALREADY_APPLIED'; end if;

  -- Complete validation pass before any business mutation.
  for v_row in select value from pg_catalog.jsonb_array_elements(p_rows)
  loop
    begin v_product_id := (v_row->>'product_id')::uuid; exception when others then raise exception 'QB_OPERATIONAL_UNKNOWN_PRODUCT'; end;
    select p.*, s.base_sale_price, s.base_price_unit_id, s.base_unit_id, s.inventory_unit_id,
      s.base_inventory_unit_id, s.is_qb_active, s.is_classifiable
      , s.supports_amount_bs
    into v_product from public.products p join public.qb_product_unit_settings s on s.product_id=p.id
    where p.id=v_product_id and p.is_active;
    if not found then raise exception 'QB_OPERATIONAL_UNKNOWN_PRODUCT'; end if;

    if p_import_type='prices' then
      if not v_product.supports_amount_bs then raise exception 'QB_OPERATIONAL_PRICE_NOT_BACKED'; end if;
      begin v_expected := nullif(v_row->>'expected_price','')::numeric; v_new := (v_row->>'new_price')::numeric; exception when others then raise exception 'QB_OPERATIONAL_INVALID_PRICE'; end;
      if v_new <= 0 or pg_catalog.round(v_new,2)<>v_new then raise exception 'QB_OPERATIONAL_INVALID_PRICE'; end if;
      if v_product.base_sale_price is distinct from v_expected then raise exception 'QB_PRICE_CONCURRENT_CHANGE'; end if;
    elsif p_import_type='conversions' then
      v_target_id := null;
      begin v_target_id := (v_row->>'target_id')::uuid; v_new := (v_row->>'new_factor')::numeric; exception when others then raise exception 'QB_OPERATIONAL_INVALID_CONVERSION'; end;
      if v_new<=0 or v_new>1000000000 then raise exception 'QB_OPERATIONAL_INVALID_CONVERSION'; end if;
      if v_row->>'target_kind'='unit' then
        select * into v_unit from public.qb_units where id=v_target_id and is_active;
        select * into v_settings from public.qb_units where id=coalesce(v_product.base_inventory_unit_id,v_product.inventory_unit_id,v_product.base_unit_id) and is_active;
        if v_unit.id is null or v_settings.id is null or v_unit.dimension_id<>v_settings.dimension_id then raise exception 'QB_OPERATIONAL_INVALID_CONVERSION'; end if;
        v_existing_factor := v_unit.conversion_factor_to_base / v_settings.conversion_factor_to_base;
      elsif v_row->>'target_kind'='presentation' then
        select * into v_presentation from public.qb_product_presentations where id=v_target_id and product_id=v_product_id and is_active;
        if v_presentation.id is null then raise exception 'QB_OPERATIONAL_AMBIGUOUS_PRESENTATION'; end if;
        v_existing_factor := v_presentation.conversion_factor_to_base;
      else raise exception 'QB_OPERATIONAL_INVALID_CONVERSION'; end if;
      if pg_catalog.abs(v_existing_factor-v_new)>0.000000001 then raise exception 'QB_OPERATIONAL_FACTOR_MISMATCH'; end if;
    else
      begin v_allowed_id := (v_row->>'allowed_unit_id')::uuid; v_quantity := (v_row->>'initial_quantity')::numeric; v_cutoff := (v_row->>'cutoff_date')::date; exception when others then raise exception 'QB_OPERATIONAL_INVALID_STOCK'; end;
      if v_quantity<=0 or v_quantity>1000000 or pg_catalog.round(v_quantity,6)<>v_quantity or v_cutoff is null then raise exception 'QB_OPERATIONAL_INVALID_STOCK'; end if;
      select u.* into v_unit from public.qb_product_allowed_units a join public.qb_units u on u.id=a.unit_id
      where a.id=v_allowed_id and a.product_id=v_product_id and a.usage_context='recepcion' and a.is_active
        and u.id=coalesce(v_product.base_inventory_unit_id,v_product.inventory_unit_id,v_product.base_unit_id)
        and u.is_active;
      if v_unit.id is null or v_unit.conversion_factor_to_base<=0 or v_product.is_classifiable then raise exception 'QB_OPERATIONAL_STOCK_REQUIRES_BASE_RECEPTION'; end if;
    end if;
  end loop;

  if p_import_type='initial_stock' then
    select min((value->>'cutoff_date')::date), max((value->>'cutoff_date')::date) into v_cutoff, v_cutoff_max
    from pg_catalog.jsonb_array_elements(p_rows);
    if v_cutoff is distinct from v_cutoff_max then raise exception 'QB_OPERATIONAL_MULTIPLE_CUTOFF_DATES'; end if;
    insert into public.qb_merchandise_receipts(receipt_date,status,reference_code,supplier_name,notes,created_by,updated_by)
    values (v_cutoff,'borrador','INGRESO-APERTURA-'||pg_catalog.substr(p_file_hash,1,12),null,'Ingreso de apertura desde activacion operativa',v_user_id,v_user_id)
    returning id into v_receipt_id;
  end if;

  for v_row in select value from pg_catalog.jsonb_array_elements(p_rows)
  loop
    v_product_id := (v_row->>'product_id')::uuid;
    if p_import_type='prices' then
      v_expected := nullif(v_row->>'expected_price','')::numeric; v_new := (v_row->>'new_price')::numeric;
      if v_new is not distinct from v_expected then v_unchanged:=v_unchanged+1; else
        perform public.update_qb_product_base_price(v_product_id,v_new,v_expected,false); v_applied:=v_applied+1;
      end if;
    elsif p_import_type='conversions' then
      v_target_id := (v_row->>'target_id')::uuid;
      v_allowed_id := null;
      select id into v_allowed_id from public.qb_product_allowed_units where product_id=v_product_id and usage_context='recepcion'
        and ((v_row->>'target_kind'='unit' and unit_id=v_target_id) or (v_row->>'target_kind'='presentation' and presentation_id=v_target_id));
      if v_allowed_id is null then
        insert into public.qb_product_allowed_units(product_id,usage_context,unit_id,presentation_id,is_default,is_active,sort_order,created_by,updated_by)
        values(v_product_id,'recepcion',case when v_row->>'target_kind'='unit' then v_target_id end,case when v_row->>'target_kind'='presentation' then v_target_id end,false,true,100,v_user_id,v_user_id);
        v_applied:=v_applied+1;
      else
        update public.qb_product_allowed_units set is_active=true,updated_by=v_user_id where id=v_allowed_id and not is_active;
        if found then v_applied:=v_applied+1; else v_unchanged:=v_unchanged+1; end if;
      end if;
      insert into public.audit_logs(user_id,action,entity_type,entity_id,metadata)
      values(v_user_id,'apply_qb_receiving_conversion','product',v_product_id,pg_catalog.jsonb_build_object('target_kind',v_row->>'target_kind','target_id',v_target_id,'factor',(v_row->>'new_factor')::numeric));
    else
      v_allowed_id := (v_row->>'allowed_unit_id')::uuid; v_quantity := (v_row->>'initial_quantity')::numeric;
      select p.*,s.base_unit_id,s.inventory_unit_id,s.base_inventory_unit_id into v_product from public.products p join public.qb_product_unit_settings s on s.product_id=p.id where p.id=v_product_id;
      select u.* into v_unit from public.qb_units u where u.id=coalesce(v_product.base_inventory_unit_id,v_product.inventory_unit_id,v_product.base_unit_id);
      insert into public.qb_merchandise_receipt_lines(receipt_id,product_id,allowed_unit_id,source_kind,source_unit_id,source_label,source_quantity,base_unit_id,base_unit_symbol,base_quantity,conversion_factor_to_base,total_cost,requires_classification,notes,created_by,updated_by)
      values(v_receipt_id,v_product_id,v_allowed_id,'universal_unit',v_unit.id,v_unit.name||' ('||v_unit.symbol||')',v_quantity,v_unit.id,v_unit.symbol,v_quantity,1,0,false,'Stock inicial',v_user_id,v_user_id)
      returning id into v_line_id;
      insert into public.qb_conversion_snapshots(source_table,source_id,product_id,dimension_code,source_kind,source_unit_id,source_label,source_quantity,base_unit_id,base_unit_symbol,base_quantity,conversion_factor_to_base,snapshot,created_by)
      select 'qb_merchandise_receipt_lines',v_line_id,v_product_id,d.code,'universal_unit',v_unit.id,v_unit.name||' ('||v_unit.symbol||')',v_quantity,v_unit.id,v_unit.symbol,v_quantity,1,pg_catalog.jsonb_build_object('allowed_unit_id',v_allowed_id,'import_hash',p_file_hash),v_user_id
      from public.qb_unit_dimensions d where d.id=v_unit.dimension_id returning id into v_snapshot_id;
      update public.qb_merchandise_receipt_lines set conversion_snapshot_id=v_snapshot_id where id=v_line_id;
      v_applied:=v_applied+1;
    end if;
  end loop;

  if p_import_type='initial_stock' then perform public.confirm_qb_merchandise_receipt(v_receipt_id); end if;
  insert into private.qb_operational_import_batches(import_type,file_hash,status,total_rows,applied_rows,unchanged_rows,result_summary,receipt_id,applied_by)
  values(p_import_type,p_file_hash,'applied',v_total,v_applied,v_unchanged,pg_catalog.jsonb_build_object('applied',v_applied,'unchanged',v_unchanged),v_receipt_id,v_user_id)
  returning id into v_batch_id;
  return pg_catalog.jsonb_build_object('batch_id',v_batch_id,'status','applied','applied',v_applied,'unchanged',v_unchanged,'receipt_id',v_receipt_id);
end;
$$;

revoke all on function public.apply_qb_operational_import(text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.apply_qb_operational_import(text,text,jsonb,text) to authenticated;

commit;
