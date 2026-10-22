-- Fase 4C: full dependency review, physical-unit correction guardrails and
-- reversible-from-audit hard deletion for products with no business history.
begin;

create table if not exists public.product_deletion_audit (
  id uuid primary key default gen_random_uuid(),
  original_product_id uuid not null,
  product_name text not null,
  actor_profile_id uuid not null,
  action text not null check (action in ('delete_attempt','delete')),
  result text not null check (result in ('blocked','deleted')),
  reason text,
  original_image_url text,
  image_cleanup_status text not null default 'not_applicable'
    check (image_cleanup_status in ('not_applicable','pending','cleaned','shared','failed')),
  image_cleanup_error text,
  created_at timestamptz not null default now(),
  image_cleaned_at timestamptz
);
alter table public.product_deletion_audit enable row level security;
drop policy if exists product_deletion_audit_admin_select on public.product_deletion_audit;
create policy product_deletion_audit_admin_select on public.product_deletion_audit
  for select to authenticated using (public.current_user_role() in ('admin','administrador'));
revoke all on public.product_deletion_audit from public, anon, authenticated;
grant select on public.product_deletion_audit to authenticated;

create or replace function public.admin_get_product_reference_review(p_product_ids uuid[])
returns table(product_id uuid, reference_counts jsonb, references_verified boolean)
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_product_id uuid;
  v_fk record;
  v_count bigint;
  v_counts jsonb;
  v_verified boolean;
  v_product_id_att smallint;
begin
  if auth.uid() is null or public.current_user_role() not in ('admin','administrador') then
    raise exception 'Solo Administración puede revisar dependencias de productos.';
  end if;
  if coalesce(cardinality(p_product_ids),0) > 500 then
    raise exception 'Revisa los productos en páginas de máximo 500.';
  end if;
  select attnum into v_product_id_att from pg_catalog.pg_attribute
    where attrelid='public.products'::regclass and attname='id' and not attisdropped;
  for v_product_id in select distinct unnest(coalesce(p_product_ids,'{}'::uuid[])) loop
    v_counts := '{}'::jsonb;
    v_verified := true;
    for v_fk in
      select c.conrelid, c.conkey, c.confkey, c.conname,
        child_col.attname as child_column,
        child_ns.nspname as child_schema,
        child_table.relname as child_table
      from pg_catalog.pg_constraint c
      join pg_catalog.pg_class child_table on child_table.oid=c.conrelid
      join pg_catalog.pg_namespace child_ns on child_ns.oid=child_table.relnamespace
      join pg_catalog.pg_attribute child_col on child_col.attrelid=c.conrelid and child_col.attnum=any(c.conkey)
      where c.contype='f' and c.confrelid='public.products'::regclass and v_product_id_att=any(c.confkey)
    loop
      -- These are product-owned settings, not historical operations. The UI
      -- inspects presentations separately because their dimensions matter.
      if cardinality(v_fk.conkey)=1 and (
        (v_fk.child_table='qb_product_unit_settings' and v_fk.child_column='product_id')
        or (v_fk.child_table='qb_product_allowed_units' and v_fk.child_column='product_id')
      ) then
        continue;
      end if;
      if cardinality(v_fk.conkey) <> 1 or cardinality(v_fk.confkey) <> 1 then
        v_verified := false;
      else
        execute format('select count(*) from %I.%I where %I = $1', v_fk.child_schema, v_fk.child_table, v_fk.child_column)
          into v_count using v_product_id;
        if v_count > 0 then
          v_counts := v_counts || jsonb_build_object(v_fk.child_table || '.' || v_fk.child_column, v_count);
        end if;
      end if;
    end loop;
    product_id := v_product_id;
    reference_counts := v_counts;
    references_verified := v_verified;
    return next;
  end loop;
end $$;
revoke all on function public.admin_get_product_reference_review(uuid[]) from public, anon;
grant execute on function public.admin_get_product_reference_review(uuid[]) to authenticated;

-- Guard both the legacy catalog unit and QB inventory-unit columns against
-- every operational FK in the live schema, including future tables.
create or replace function public.guard_product_physical_unit_history()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_product_id uuid;
  v_changed boolean;
  v_fk record;
  v_has_reference boolean;
begin
  if tg_table_name='products' then
    v_product_id := old.id;
    v_changed := old.unit_id is distinct from new.unit_id;
  else
    v_product_id := old.product_id;
    v_changed := old.base_unit_id is distinct from new.base_unit_id
      or old.inventory_unit_id is distinct from new.inventory_unit_id
      or old.base_inventory_unit_id is distinct from new.base_inventory_unit_id;
  end if;
  if not v_changed then return new; end if;

  for v_fk in
    select c.conrelid,c.conkey,c.confkey,child_col.attname as child_column,
      child_ns.nspname as child_schema,child_table.relname as child_table
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class child_table on child_table.oid=c.conrelid
    join pg_catalog.pg_namespace child_ns on child_ns.oid=child_table.relnamespace
    left join pg_catalog.pg_attribute child_col on child_col.attrelid=c.conrelid
      and cardinality(c.conkey)=1 and child_col.attnum=c.conkey[1]
    where c.contype='f' and c.confrelid='public.products'::regclass
      and (select attnum from pg_catalog.pg_attribute where attrelid='public.products'::regclass and attname='id' and not attisdropped)=any(c.confkey)
  loop
    if cardinality(v_fk.conkey)=1 and (
      (v_fk.child_table='qb_product_unit_settings' and v_fk.child_column='product_id')
      or (v_fk.child_table='qb_product_allowed_units' and v_fk.child_column='product_id')
    ) then continue; end if;
    if cardinality(v_fk.conkey)<>1 or cardinality(v_fk.confkey)<>1 then
      raise exception 'El producto tiene una relación histórica compuesta; no se puede cambiar su unidad física.';
    end if;
    execute format('select exists(select 1 from %I.%I where %I=$1)',v_fk.child_schema,v_fk.child_table,v_fk.child_column)
      into v_has_reference using v_product_id;
    if v_has_reference then
      raise exception 'El producto tiene historial en %; la unidad física futura requiere una regularización segura.',v_fk.child_table;
    end if;
  end loop;
  return new;
end $$;
revoke all on function public.guard_product_physical_unit_history() from public, anon, authenticated;
drop trigger if exists guard_product_physical_unit_history on public.products;
create trigger guard_product_physical_unit_history before update of unit_id on public.products
for each row execute function public.guard_product_physical_unit_history();
drop trigger if exists guard_qb_physical_unit_history on public.qb_product_unit_settings;
create trigger guard_qb_physical_unit_history before update of base_unit_id,inventory_unit_id,base_inventory_unit_id on public.qb_product_unit_settings
for each row execute function public.guard_product_physical_unit_history();

create or replace function public.admin_delete_product_if_unused(p_product_id uuid, p_confirmation text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_actor uuid := auth.uid();
  v_product public.products%rowtype;
  v_fk record;
  v_has_reference boolean;
  v_reason text;
  v_audit_id uuid;
  v_product_id_att smallint;
begin
  if v_actor is null or public.current_user_role() not in ('admin','administrador') then
    raise exception 'Solo Administración puede eliminar productos definitivamente.';
  end if;
  if p_confirmation is distinct from 'ELIMINAR' then
    raise exception 'Escribe ELIMINAR para confirmar la eliminación definitiva.';
  end if;
  select * into v_product from public.products where id=p_product_id for update;
  if not found then raise exception 'Producto no encontrado.'; end if;

  if coalesce(v_product.stock_current,0) <> 0 then
    v_reason := 'Tiene stock actual distinto de cero.';
  end if;
  select attnum into v_product_id_att from pg_catalog.pg_attribute
    where attrelid='public.products'::regclass and attname='id' and not attisdropped;
  if v_reason is null then
    for v_fk in
      select c.conrelid,c.conkey,c.confkey,
        child_col.attname as child_column, child_ns.nspname as child_schema,
        child_table.relname as child_table
      from pg_catalog.pg_constraint c
      join pg_catalog.pg_class child_table on child_table.oid=c.conrelid
      join pg_catalog.pg_namespace child_ns on child_ns.oid=child_table.relnamespace
      join pg_catalog.pg_attribute child_col on child_col.attrelid=c.conrelid and child_col.attnum=any(c.conkey)
      where c.contype='f' and c.confrelid='public.products'::regclass and v_product_id_att=any(c.confkey)
    loop
      -- These rows are product-owned configuration and can be removed only
      -- when no operational row references them (checked separately below).
      if (v_fk.child_table='qb_product_unit_settings' and v_fk.child_column='product_id')
        or (v_fk.child_table='qb_product_presentations' and v_fk.child_column='product_id')
        or (v_fk.child_table='qb_product_allowed_units' and v_fk.child_column='product_id')
        or (v_fk.child_table='qb_product_classification_outputs' and v_fk.child_column='source_product_id') then
        continue;
      end if;
      if cardinality(v_fk.conkey) <> 1 or cardinality(v_fk.confkey) <> 1 then
        v_reason := 'Existe una relación compuesta que requiere revisión manual.';
        exit;
      end if;
      execute format('select exists(select 1 from %I.%I where %I = $1)',v_fk.child_schema,v_fk.child_table,v_fk.child_column)
        into v_has_reference using p_product_id;
      if v_has_reference then
        v_reason := 'Tiene historial o relaciones en ' || v_fk.child_table || '.';
        exit;
      end if;
    end loop;
  end if;
  if v_reason is null and (
    exists(select 1 from public.qb_order_items i where i.allowed_unit_id in (select id from public.qb_product_allowed_units where product_id=p_product_id)
      or i.product_presentation_id in (select id from public.qb_product_presentations where product_id=p_product_id))
    or exists(select 1 from public.qb_order_preparation_items i where i.actual_allowed_unit_id in (select id from public.qb_product_allowed_units where product_id=p_product_id)
      or i.actual_product_presentation_id in (select id from public.qb_product_presentations where product_id=p_product_id))
    or exists(select 1 from public.qb_merchandise_receipt_lines i where i.allowed_unit_id in (select id from public.qb_product_allowed_units where product_id=p_product_id)
      or i.product_presentation_id in (select id from public.qb_product_presentations where product_id=p_product_id))
    or exists(select 1 from public.qb_conversion_snapshots i where i.product_presentation_id in (select id from public.qb_product_presentations where product_id=p_product_id))
    or exists(select 1 from public.qb_merchandise_receipt_classification_results r where r.configured_output_id in
      (select id from public.qb_product_classification_outputs where source_product_id=p_product_id))
  ) then
    v_reason := 'Una configuración del producto está vinculada a un documento histórico.';
  end if;

  if v_reason is not null then
    insert into public.product_deletion_audit(original_product_id,product_name,actor_profile_id,action,result,reason,original_image_url)
      values(p_product_id,v_product.name,v_actor,'delete_attempt','blocked',v_reason,v_product.image_url) returning id into v_audit_id;
    return jsonb_build_object('status','blocked','message',v_reason,'audit_id',v_audit_id);
  end if;

  insert into public.product_deletion_audit(original_product_id,product_name,actor_profile_id,action,result,reason,original_image_url,image_cleanup_status)
    values(p_product_id,v_product.name,v_actor,'delete','deleted','Sin stock ni relaciones operativas.',v_product.image_url,
      case when v_product.image_url is null then 'not_applicable' else 'pending' end)
    returning id into v_audit_id;
  delete from public.qb_product_classification_outputs where source_product_id=p_product_id;
  delete from public.qb_product_allowed_units where product_id=p_product_id;
  delete from public.qb_product_presentations where product_id=p_product_id;
  delete from public.qb_product_unit_settings where product_id=p_product_id;
  delete from public.products where id=p_product_id;
  return jsonb_build_object('status','deleted','message','Producto eliminado.','audit_id',v_audit_id,'image_url',v_product.image_url);
exception when foreign_key_violation then
  -- The product row lock prevents new FK references; this catches uncovered
  -- schema dependencies and rolls back the deletion subtransaction.
  insert into public.product_deletion_audit(original_product_id,product_name,actor_profile_id,action,result,reason,original_image_url)
    values(p_product_id,coalesce(v_product.name,'Producto'),coalesce(v_actor,auth.uid()),'delete_attempt','blocked','La base detectó una relación histórica no contemplada; no se eliminó nada.',v_product.image_url)
    returning id into v_audit_id;
  return jsonb_build_object('status','blocked','message','La base detectó una relación histórica no contemplada; no se eliminó nada.','audit_id',v_audit_id);
end $$;
revoke all on function public.admin_delete_product_if_unused(uuid,text) from public, anon;
grant execute on function public.admin_delete_product_if_unused(uuid,text) to authenticated;
revoke delete on public.products from authenticated;

create or replace function public.admin_update_product_image_cleanup(p_audit_id uuid,p_status text,p_error text default null)
returns void language plpgsql security definer set search_path = pg_catalog as $$
begin
  if auth.uid() is null or public.current_user_role() not in ('admin','administrador') then
    raise exception 'Solo Administración puede actualizar la limpieza de imagen.';
  end if;
  if p_status not in ('not_applicable','cleaned','shared','failed') then raise exception 'Estado de limpieza inválido.'; end if;
  update public.product_deletion_audit set image_cleanup_status=p_status,
    image_cleanup_error=left(nullif(trim(coalesce(p_error,'')),''),500),
    image_cleaned_at=case when p_status='cleaned' then now() else image_cleaned_at end
  where id=p_audit_id and action='delete' and result='deleted';
  if not found then raise exception 'Auditoría de eliminación no encontrada.'; end if;
end $$;
revoke all on function public.admin_update_product_image_cleanup(uuid,text,text) from public, anon;
grant execute on function public.admin_update_product_image_cleanup(uuid,text,text) to authenticated;

commit;
