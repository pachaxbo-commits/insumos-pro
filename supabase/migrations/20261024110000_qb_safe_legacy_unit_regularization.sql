-- Fase 4C.1: replace only unreferenced legacy_dump unit associations after
-- an administrator explicitly selects a real KG/L unit. No numeric setting
-- from a legacy association is carried into the new physical configuration.
begin;

create table if not exists public.qb_product_unit_regularization_audit (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  old_catalog_unit_id uuid,
  new_catalog_unit_id uuid,
  old_qb_settings jsonb not null,
  removed_allowed_units jsonb not null,
  resulting_allowed_units jsonb not null,
  target_unit_id uuid not null references public.qb_units(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint qb_product_unit_regularization_audit_product_unique unique(product_id)
);

alter table public.qb_product_unit_regularization_audit enable row level security;
revoke all on public.qb_product_unit_regularization_audit from public, anon, authenticated;
grant select on public.qb_product_unit_regularization_audit to authenticated;
drop policy if exists "Administrators can view unit regularization audit" on public.qb_product_unit_regularization_audit;
create policy "Administrators can view unit regularization audit"
  on public.qb_product_unit_regularization_audit for select to authenticated
  using (public.current_user_role() in ('admin','administrador'));

create or replace function public.admin_preview_legacy_unit_references(p_product_ids uuid[])
returns table(product_id uuid, association_references jsonb, references_verified boolean)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_product_id uuid;
  v_fk record;
  v_reference record;
  v_join text;
  v_all_refs jsonb:='{}'::jsonb;
  v_product_refs jsonb;
  v_unit_refs jsonb;
begin
  if auth.uid() is null or public.current_user_role() not in ('admin','administrador') then
    raise exception 'Solo Administración puede revisar asociaciones heredadas.';
  end if;
  if coalesce(cardinality(p_product_ids),0)>500 then raise exception 'Revisa máximo 500 productos por consulta.'; end if;

  for v_product_id in select distinct unnest(coalesce(p_product_ids,'{}'::uuid[])) loop
    select coalesce(jsonb_object_agg(a.id::text,'[]'::jsonb),'{}'::jsonb) into v_product_refs
    from public.qb_product_allowed_units a
    join public.qb_units u on u.id=a.unit_id
    join public.qb_unit_dimensions d on d.id=u.dimension_id
    where a.product_id=v_product_id and d.code='legacy_dump';
    v_all_refs:=jsonb_set(v_all_refs,array[v_product_id::text],v_product_refs,true);
  end loop;

  -- Run one grouped count per FK relationship rather than one query per
  -- association; this keeps preview cost bounded for the full 379-product scan.
  for v_fk in
    select c.oid,c.conrelid,ns.nspname child_schema,cl.relname child_table,
      string_agg(format('c.%I = p.%I',ca.attname,pa.attname),' and ' order by k.ord) join_condition
    from pg_constraint c join pg_class cl on cl.oid=c.conrelid join pg_namespace ns on ns.oid=cl.relnamespace
    join unnest(c.conkey) with ordinality k(attnum,ord) on true
    join unnest(c.confkey) with ordinality fk(attnum,ord) on fk.ord=k.ord
    join pg_attribute ca on ca.attrelid=c.conrelid and ca.attnum=k.attnum
    join pg_attribute pa on pa.attrelid=c.confrelid and pa.attnum=fk.attnum
    where c.contype='f' and c.confrelid='public.qb_product_allowed_units'::regclass
      and c.conrelid<>'public.qb_product_allowed_units'::regclass
    group by c.oid,c.conrelid,ns.nspname,cl.relname
  loop
    v_join:=v_fk.join_condition;
    for v_reference in execute format(
      'select p.product_id,p.id allowed_unit_id,count(*) reference_count from %I.%I c join public.qb_product_allowed_units p on %s where p.product_id=any($1) group by p.product_id,p.id',
      v_fk.child_schema,v_fk.child_table,v_join
    ) using p_product_ids loop
      v_product_refs:=v_all_refs->v_reference.product_id::text;
      v_unit_refs:=v_product_refs->v_reference.allowed_unit_id::text;
      v_unit_refs:=v_unit_refs||jsonb_build_array(jsonb_build_object('table',v_fk.child_schema||'.'||v_fk.child_table,'count',v_reference.reference_count));
      v_product_refs:=jsonb_set(v_product_refs,array[v_reference.allowed_unit_id::text],v_unit_refs,true);
      v_all_refs:=jsonb_set(v_all_refs,array[v_reference.product_id::text],v_product_refs,true);
    end loop;
  end loop;

  for v_product_id in select distinct unnest(coalesce(p_product_ids,'{}'::uuid[])) loop
    product_id:=v_product_id;
    association_references:=coalesce(v_all_refs->v_product_id::text,'{}'::jsonb);
    references_verified:=true;
    return next;
  end loop;
end;
$$;
revoke all on function public.admin_preview_legacy_unit_references(uuid[]) from public,anon;
grant execute on function public.admin_preview_legacy_unit_references(uuid[]) to authenticated;

create or replace function public.admin_regularize_legacy_product_units(
  p_product_id uuid,
  p_target_unit_id uuid,
  p_confirmation text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_product public.products%rowtype;
  v_setting public.qb_product_unit_settings%rowtype;
  v_target public.qb_units%rowtype;
  v_target_dimension text;
  v_existing public.qb_product_unit_regularization_audit%rowtype;
  v_legacy_ids uuid[];
  v_legacy_snapshot jsonb;
  v_setting_snapshot jsonb;
  v_after_snapshot jsonb;
  v_fk record;
  v_join text;
  v_fk_count bigint;
  v_context text;
  v_is_default boolean;
begin
  select role into v_role from public.profiles where id = v_actor and is_active = true;
  if v_actor is null or v_role not in ('admin','administrador') then
    raise exception 'Solo un administrador activo puede regularizar unidades heredadas.';
  end if;
  if p_confirmation is distinct from 'REGULARIZAR' then
    raise exception 'Confirma expresamente la regularización de este producto.';
  end if;

  select * into v_product from public.products where id=p_product_id for update;
  if not found then raise exception 'Producto no encontrado.'; end if;
  select * into v_setting from public.qb_product_unit_settings where product_id=p_product_id for update;
  if not found then raise exception 'Falta configuración QB del producto.'; end if;

  select * into v_existing from public.qb_product_unit_regularization_audit where product_id=p_product_id;
  if found then
    if v_existing.target_unit_id=p_target_unit_id
      and v_product.unit_id is not distinct from v_existing.new_catalog_unit_id
      and v_setting.base_unit_id=p_target_unit_id
      and v_setting.inventory_unit_id=p_target_unit_id
      and v_setting.base_inventory_unit_id=p_target_unit_id
      and v_setting.base_price_unit_id=p_target_unit_id
      and exists(select 1 from public.qb_product_allowed_units a where a.product_id=p_product_id and a.usage_context='inventario' and a.unit_id=p_target_unit_id and a.is_active)
      and exists(select 1 from public.qb_product_allowed_units a where a.product_id=p_product_id and a.usage_context='recepcion' and a.unit_id=p_target_unit_id and a.is_active)
      and exists(select 1 from public.qb_product_allowed_units a where a.product_id=p_product_id and a.usage_context='pedido' and a.unit_id=p_target_unit_id and a.is_active)
      and not exists (
        select 1 from public.qb_product_allowed_units a
        join public.qb_units u on u.id=a.unit_id
        join public.qb_unit_dimensions d on d.id=u.dimension_id
        where a.product_id=p_product_id and d.code='legacy_dump'
      ) then
      return jsonb_build_object('status','already_regularized','audit_id',v_existing.id);
    end if;
    raise exception 'Existe una auditoría previa, pero la configuración actual cambió; requiere revisión administrativa.';
  end if;

  if coalesce(v_product.stock_current,0)<>0 then raise exception 'El producto tiene stock; no se regularizó.'; end if;
  if not v_product.is_active or not v_setting.is_qb_active then
    raise exception 'El producto o su configuración QB están inactivos; no se crearán unidades operativas automáticamente.';
  end if;
  if coalesce(v_product.purchase_price,0)<>0 or coalesce(v_product.sale_price,0)<>0 or coalesce(v_setting.base_sale_price,0)<>0 then
    raise exception 'El producto tiene precios registrados; requiere revisión antes de cambiar unidad.';
  end if;
  if exists(select 1 from public.qb_product_presentations where product_id=p_product_id)
     or exists(select 1 from public.qb_conversion_snapshots where product_id=p_product_id) then
    raise exception 'El producto tiene presentaciones o snapshots de conversión; no se modificó.';
  end if;

  select * into v_target from public.qb_units where id=p_target_unit_id and is_active=true;
  if not found then raise exception 'Selecciona una unidad física activa.'; end if;
  select code into v_target_dimension from public.qb_unit_dimensions where id=v_target.dimension_id and is_active=true;
  if not ((v_target_dimension='peso' and lower(v_target.code)='kg' and upper(v_target.symbol)='KG')
       or (v_target_dimension='volumen' and lower(v_target.code) in ('l','litro','liter') and upper(v_target.symbol) in ('L','LT','LITRO'))) then
    raise exception 'La unidad objetivo debe ser la unidad base KG o L; no se aceptan equivalencias comerciales.';
  end if;

  if exists (
    select 1 from public.qb_product_allowed_units a
    join public.qb_units u on u.id=a.unit_id
    join public.qb_unit_dimensions d on d.id=u.dimension_id
    where a.product_id=p_product_id and d.code<>'legacy_dump' and d.code<>v_target_dimension
  ) then raise exception 'Existe una unidad permitida de otra dimensión que requiere revisión.'; end if;
  if exists(select 1 from public.qb_product_allowed_units where product_id=p_product_id and presentation_id is not null) then
    raise exception 'Una asociación permitida depende de una presentación; requiere revisión.';
  end if;

  -- Serialize edits to product-owned unit options while taking the snapshot
  -- and pruning; the product lock already prevents new FK-backed rows.
  perform 1 from public.qb_product_allowed_units where product_id=p_product_id for update;

  select coalesce(array_agg(a.id order by a.usage_context,a.created_at),array[]::uuid[]),
         coalesce(jsonb_agg(to_jsonb(a) order by a.usage_context,a.created_at),'[]'::jsonb)
    into v_legacy_ids,v_legacy_snapshot
  from public.qb_product_allowed_units a
  join public.qb_units u on u.id=a.unit_id
  join public.qb_unit_dimensions d on d.id=u.dimension_id
  where a.product_id=p_product_id and d.code='legacy_dump';
  if cardinality(v_legacy_ids)=0 then raise exception 'No hay asociaciones legacy_dump para regularizar.'; end if;

  -- Inspect every FK that points at allowed-unit IDs; presentation/configuration
  -- rows are also checked separately above. All dynamic identifiers come from
  -- PostgreSQL catalog metadata and are quoted before execution.
  for v_fk in
    select c.oid,c.conrelid,ns.nspname child_schema,cl.relname child_table,
      string_agg(format('c.%I = p.%I',ca.attname,pa.attname),' and ' order by k.ord) join_condition
    from pg_constraint c
    join pg_class cl on cl.oid=c.conrelid
    join pg_namespace ns on ns.oid=cl.relnamespace
    join unnest(c.conkey) with ordinality k(attnum,ord) on true
    join unnest(c.confkey) with ordinality fk(attnum,ord) on fk.ord=k.ord
    join pg_attribute ca on ca.attrelid=c.conrelid and ca.attnum=k.attnum
    join pg_attribute pa on pa.attrelid=c.confrelid and pa.attnum=fk.attnum
    where c.contype='f' and c.confrelid='public.qb_product_allowed_units'::regclass
      and c.conrelid<>'public.qb_product_allowed_units'::regclass
    group by c.oid,c.conrelid,ns.nspname,cl.relname
  loop
    v_join := v_fk.join_condition;
    execute format('select count(*) from %I.%I c join public.qb_product_allowed_units p on %s where p.id = any($1)',
      v_fk.child_schema,v_fk.child_table,v_join) into v_fk_count using v_legacy_ids;
    if v_fk_count>0 then
      raise exception 'Una unidad heredada tiene % referencias históricas en %.%; no se modificó.',v_fk_count,v_fk.child_schema,v_fk.child_table;
    end if;
  end loop;

  select to_jsonb(s) into v_setting_snapshot from public.qb_product_unit_settings s where s.product_id=p_product_id;

  -- Remove the incompatible associations only after proving they are unused.
  -- The existing physical-unit RPC retains all its independent safety checks
  -- and synchronizes the legacy product catalog inside this transaction.
  delete from public.qb_product_allowed_units where id=any(v_legacy_ids);
  perform public.set_qb_product_physical_unit_if_safe(p_product_id,p_target_unit_id);

  -- Add only explicit base-unit options for physical receipt/inventory contexts.
  -- No legacy min/step/default values are copied. Keep product activation flags
  -- unchanged; disabled products remain disabled.
  foreach v_context in array array['inventario','recepcion'] loop
    select not exists(select 1 from public.qb_product_allowed_units a where a.product_id=p_product_id and a.usage_context=v_context and a.is_active and a.is_default)
      into v_is_default;
    insert into public.qb_product_allowed_units(product_id,usage_context,unit_id,presentation_id,is_default,quantity_step,min_quantity,is_active,sort_order,created_by,updated_by)
    values(p_product_id,v_context,p_target_unit_id,null,v_is_default,null,null,true,0,v_actor,v_actor)
    on conflict (product_id,usage_context,unit_id) where unit_id is not null do update
      set is_active=true,updated_by=v_actor,updated_at=now();
  end loop;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.usage_context,a.created_at),'[]'::jsonb)
    into v_after_snapshot from public.qb_product_allowed_units a where a.product_id=p_product_id;
  insert into public.qb_product_unit_regularization_audit(
    product_id,actor_profile_id,old_catalog_unit_id,new_catalog_unit_id,old_qb_settings,
    removed_allowed_units,resulting_allowed_units,target_unit_id
  ) values (
    p_product_id,v_actor,v_product.unit_id,(select unit_id from public.products where id=p_product_id),
    v_setting_snapshot,v_legacy_snapshot,v_after_snapshot,p_target_unit_id
  ) returning * into v_existing;

  insert into public.audit_logs(user_id,action,entity_type,entity_id,metadata)
  values(v_actor,'regularize_legacy_product_units','product',p_product_id,
    jsonb_build_object('target_unit_id',p_target_unit_id,'removed_legacy_associations',cardinality(v_legacy_ids),'audit_id',v_existing.id));
  return jsonb_build_object('status','regularized','audit_id',v_existing.id,'removed_associations',cardinality(v_legacy_ids));
end;
$$;

revoke all on function public.admin_regularize_legacy_product_units(uuid,uuid,text) from public,anon;
grant execute on function public.admin_regularize_legacy_product_units(uuid,uuid,text) to authenticated;

commit;
