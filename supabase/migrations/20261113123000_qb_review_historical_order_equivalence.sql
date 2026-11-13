begin;

create or replace function public.review_qb_historical_order_equivalence(
  p_order_item_id uuid, p_expected_version integer, p_allowed_unit_id uuid,
  p_reason text, p_apply boolean, p_expected_factor numeric,
  p_expected_preparation_version integer, p_expected_delivery_version integer
) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_order public.qb_orders%rowtype;
  v_item public.qb_order_items%rowtype;
  v_prep public.qb_order_preparation_items%rowtype;
  v_delivery public.qb_order_delivery_items%rowtype;
  v_base public.qb_units%rowtype;
  v_source public.qb_units%rowtype;
  v_inventory public.qb_units%rowtype;
  v_allowed uuid;
  v_factor numeric(18,9);
  v_snapshot uuid;
  v_before jsonb;
  v_after jsonb;
begin
  if auth.uid() is null or not coalesce(public.current_user_role() in ('admin','administrador'),false) then
    raise exception 'QB_ORDER_ADMIN_REQUIRED' using errcode='42501';
  end if;
  select o.* into v_order from public.qb_orders o
    join public.qb_order_items i on i.order_id=o.id where i.id=p_order_item_id for update of o;
  if not found or v_order.delivered_at is not null
    or v_order.status not in ('pendiente_preparacion','en_preparacion','preparado')
    or exists (select 1 from public.qb_order_delivery_confirmations where order_id=v_order.id and status='confirmado')
    or exists (select 1 from public.qb_receipt_lines where order_id=v_order.id)
    or exists (select 1 from public.qb_order_delivery_movements where order_id=v_order.id) then
    raise exception 'La revisión requiere un pedido abierto sin entregas confirmadas ni recibos.';
  end if;
  select * into strict v_item from public.qb_order_items where id=p_order_item_id for update;
  if v_item.row_version is distinct from p_expected_version or v_item.order_input_mode<>'quantity'
    or v_item.source_kind<>'universal_unit'
    or not exists (select 1 from public.qb_units u join public.qb_unit_dimensions d on d.id=u.dimension_id
      where u.id=v_item.base_unit_id and d.code='legacy_dump') then
    raise exception 'La línea cambió o su unidad histórica requiere otra revisión.';
  end if;
  select u.* into v_base from public.qb_product_unit_settings s
    join public.qb_units u on u.id=s.base_unit_id and u.is_active
    join public.qb_unit_dimensions d on d.id=u.dimension_id and d.is_active and d.code<>'legacy_dump'
    where s.product_id=v_item.product_id and u.id=coalesce(s.base_inventory_unit_id,s.inventory_unit_id,s.base_unit_id)
    for share of s,u,d;
  select u.* into v_source from public.qb_product_allowed_units a
    join public.qb_units u on u.id=a.unit_id and u.is_active and u.dimension_id=v_base.dimension_id
    where a.id=p_allowed_unit_id and a.product_id=v_item.product_id and a.is_active and a.usage_context='pedido'
      and upper(trim(u.symbol))=upper(trim(v_item.source_label)) for share of a,u;
  if v_base.id is not null and v_source.id is not null then
    v_allowed := p_allowed_unit_id;
  else
    -- Existing inventory in legacy KG needs no numeric conversion to physical KG.
    -- Only the selected open order is corrected; inventory and product settings stay intact.
    select u.* into v_inventory from public.qb_product_unit_settings s
    join public.qb_units u on u.id=coalesce(s.base_inventory_unit_id,s.inventory_unit_id,s.base_unit_id)
    join public.qb_unit_dimensions d on d.id=u.dimension_id
    where s.product_id=v_item.product_id and d.code='legacy_dump' and d.is_active and u.is_active
      and upper(trim(u.symbol))='KG' and u.conversion_factor_to_base=1 for share of s,u,d;
    if v_inventory.id is not null then
      select u.* into v_base from public.qb_units u join public.qb_unit_dimensions d on d.id=u.dimension_id
      where d.code='peso' and d.is_active and u.code='kg' and u.is_active and u.conversion_factor_to_base=1;
      select u.* into v_source from public.qb_units u
      where u.id=p_allowed_unit_id and u.dimension_id=v_base.dimension_id and u.is_active
        and upper(trim(u.symbol))=upper(trim(v_item.source_label)) for share;
      v_allowed := v_item.allowed_unit_id;
    end if;
  end if;
  if v_source.id is null or v_base.id is null then
    raise exception 'El producto debe tener la misma unidad comercial habilitada y una base física compatible con inventario.';
  end if;
  v_factor := v_source.conversion_factor_to_base / v_base.conversion_factor_to_base;
  select * into v_prep from public.qb_order_preparation_items where order_item_id=v_item.id for update;
  select * into v_delivery from public.qb_order_delivery_items where order_item_id=v_item.id for update;
  if (v_prep.actual_quantity>0 and upper(trim(v_prep.actual_source_label)) is distinct from upper(trim(v_item.source_label)))
    or (v_delivery.delivered_quantity>0 and upper(trim(v_delivery.source_label)) is distinct from upper(trim(v_item.source_label))) then
    raise exception 'Las cantidades históricas se registraron con otra unidad comercial.';
  end if;
  v_before := jsonb_build_object('order',to_jsonb(v_item),'preparation',to_jsonb(v_prep),'delivery',to_jsonb(v_delivery));
  v_after := jsonb_build_object('commercial_quantity',v_item.requested_quantity,'commercial_unit',v_item.source_label,
    'factor',v_factor,'base_unit',v_base.symbol,'ordered_base',round(v_item.requested_quantity*v_factor,6),
    'prepared_base',round(v_prep.actual_quantity*v_factor,6),'delivery_base',
    case when v_delivery.actual_weight_kg is not null and v_base.code='kg'
      and exists(select 1 from public.products p where p.id=v_item.product_id and p.controls_actual_weight)
      then v_delivery.actual_weight_kg else round(v_delivery.delivered_quantity*v_factor,6) end);
  if not coalesce(p_apply,false) then
    return jsonb_build_object('applied',false,'previous_factor',v_item.conversion_factor_to_base,
      'previous_ordered_base',v_item.base_quantity,'proposed',v_after,
      'preparation_version',v_prep.row_version,'delivery_version',v_delivery.row_version);
  end if;
  if p_expected_factor is distinct from v_factor
    or p_expected_preparation_version is distinct from v_prep.row_version
    or p_expected_delivery_version is distinct from v_delivery.row_version
    or coalesce(length(trim(p_reason)),0) not between 3 and 500 then
    raise exception 'Confirma el factor mostrado e indica el motivo de la corrección.';
  end if;

  insert into public.qb_conversion_snapshots(source_table,source_id,product_id,dimension_code,source_kind,
    source_unit_id,source_label,source_quantity,base_unit_id,base_unit_symbol,base_quantity,conversion_factor_to_base,snapshot,created_by)
  values('qb_order_items',v_item.id,v_item.product_id,'pedido','universal_unit',v_source.id,v_item.source_label,
    v_item.requested_quantity,v_base.id,v_base.symbol,round(v_item.requested_quantity*v_factor,6),v_factor,v_after,auth.uid())
  returning id into v_snapshot;
  update public.qb_order_items set allowed_unit_id=v_allowed,source_unit_id=v_source.id,
    base_unit_id=v_base.id,base_unit_symbol=v_base.symbol,base_quantity=round(requested_quantity*v_factor,6),
    conversion_factor_to_base=v_factor,conversion_snapshot_id=v_snapshot,row_version=row_version+1 where id=v_item.id;
  update public.qb_order_preparation_items set requested_base_unit_id=v_base.id,requested_base_unit_symbol=v_base.symbol,
    requested_base_quantity=round(requested_quantity*v_factor,6),
    actual_allowed_unit_id=case when actual_quantity>0 then v_allowed else actual_allowed_unit_id end,
    actual_source_unit_id=case when actual_quantity>0 then v_source.id else actual_source_unit_id end,
    actual_base_unit_id=case when actual_quantity>0 then v_base.id else actual_base_unit_id end,
    actual_base_unit_symbol=case when actual_quantity>0 then v_base.symbol else actual_base_unit_symbol end,
    actual_base_quantity=round(actual_quantity*v_factor,6),
    conversion_factor_to_base=case when actual_quantity>0 then v_factor else conversion_factor_to_base end,
    conversion_snapshot_id=case when actual_quantity>0 then v_snapshot else conversion_snapshot_id end,
    origin_plan_confirmed=false,planned_pending_base_quantity=0,planned_external_base_quantity=0,
    planned_review_base_quantity=round(greatest(requested_quantity-coalesce(actual_quantity,0),0)*v_factor,6),
    preparation_check=false,row_version=row_version+1 where id=v_prep.id;
  update public.qb_order_delivery_items set base_unit_id=v_base.id,base_unit_symbol=v_base.symbol,
    conversion_factor_to_base=v_factor,prepared_base_quantity_snapshot=round(prepared_quantity_snapshot*v_factor,6),
    delivered_base_quantity=(v_after->>'delivery_base')::numeric,
    externally_sourced_quantity=0,externally_sourced_base_quantity=0,
    warehouse_used_base_quantity=0,pending_incoming_base_quantity=0,external_definitive_base_quantity=0,
    origin_review_base_quantity=(v_after->>'delivery_base')::numeric,source_origin_confirmed=false,
    delivery_check=false,row_version=row_version+1 where id=v_delivery.id;
  update public.qb_orders set status=case when v_prep.id is null then status else 'en_preparacion' end where id=v_order.id;
  update public.qb_order_preparations set status='en_preparacion' where id=v_prep.preparation_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,metadata)
    values(auth.uid(),'review_qb_historical_order_equivalence','qb_order_item',v_item.id,
      jsonb_build_object('reason',trim(p_reason),'before',v_before,'after',v_after,'conversion_snapshot_id',v_snapshot));
  return jsonb_build_object('applied',true,'proposed',v_after);
end;
$$;
revoke all on function public.review_qb_historical_order_equivalence(uuid,integer,uuid,text,boolean,numeric,integer,integer) from public,anon,authenticated;
grant execute on function public.review_qb_historical_order_equivalence(uuid,integer,uuid,text,boolean,numeric,integer,integer) to authenticated;
create or replace function private.guard_qb_delivery_historical_equivalence()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if new.status='confirmado' and exists (
    select 1 from public.qb_order_items i
    join public.qb_units b on b.id=i.base_unit_id
    join public.qb_unit_dimensions d on d.id=b.dimension_id
    where i.order_id=new.order_id and d.code='legacy_dump'
      and (i.source_unit_id is distinct from i.base_unit_id or i.conversion_factor_to_base<>1
        or upper(trim(i.source_label))<>upper(trim(b.symbol))
        or abs(i.base_quantity-i.requested_quantity)>0.000001)
  ) then
    raise exception 'Revisar equivalencia histórica antes de confirmar la entrega.';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_qb_delivery_historical_equivalence() from public,anon,authenticated;
drop trigger if exists guard_qb_delivery_historical_equivalence on public.qb_order_delivery_confirmations;
create trigger guard_qb_delivery_historical_equivalence
before insert or update of status on public.qb_order_delivery_confirmations
for each row execute function private.guard_qb_delivery_historical_equivalence();

commit;
