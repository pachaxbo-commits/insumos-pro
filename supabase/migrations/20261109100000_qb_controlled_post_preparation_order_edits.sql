-- Controlled, audited edits to an order after Preparation has started.
-- Delivered lines remain immutable; physical preparation snapshots are kept
-- and flagged for re-review when the requested quantity or unit changes.
begin;

create table if not exists public.qb_started_order_edit_requests (
  idempotency_key text primary key,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  request_payload jsonb not null,
  response_payload jsonb,
  created_at timestamptz not null default now(),
  constraint qb_started_order_edit_key_check
    check (length(trim(idempotency_key)) between 8 and 200),
  constraint qb_started_order_edit_payload_check
    check (jsonb_typeof(request_payload) = 'object')
);

alter table public.qb_started_order_edit_requests enable row level security;
revoke all on public.qb_started_order_edit_requests from public, anon, authenticated;

create or replace function public.admin_update_qb_internal_order_after_preparation(
  p_order_id uuid,
  p_expected_updated_at timestamptz,
  p_operational_date date,
  p_customer_notes text,
  p_reason text,
  p_items jsonb,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_order public.qb_orders%rowtype;
  v_preparation public.qb_order_preparations%rowtype;
  v_saved public.qb_started_order_edit_requests%rowtype;
  v_input jsonb;
  v_line jsonb;
  v_current public.qb_order_items%rowtype;
  v_prep public.qb_order_preparation_items%rowtype;
  v_delivery public.qb_order_delivery_items%rowtype;
  v_product record;
  v_allowed public.qb_product_allowed_units%rowtype;
  v_source_unit public.qb_units%rowtype;
  v_base_unit public.qb_units%rowtype;
  v_presentation public.qb_product_presentations%rowtype;
  v_line_id uuid;
  v_product_id uuid;
  v_allowed_id uuid;
  v_quantity numeric(18,6);
  v_factor numeric(18,9);
  v_base_quantity numeric(18,6);
  v_source_kind text;
  v_source_unit_id uuid;
  v_presentation_id uuid;
  v_source_label text;
  v_snapshot_id uuid;
  v_seen_products uuid[] := '{}';
  v_seen_items uuid[] := '{}';
  v_before jsonb;
  v_after jsonb;
  v_count integer := 0;
  v_updated_at timestamptz;
  v_request jsonb;
  v_response jsonb;
  v_current_date date := (now() at time zone 'America/La_Paz')::date;
begin
  select profile.role into v_role
  from public.profiles profile
  where profile.id = v_user_id and profile.is_active = true;
  if v_user_id is null or v_role not in ('admin','administrador') then
    raise exception 'Solo administracion puede modificar pedidos.';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception 'Clave de idempotencia invalida.';
  end if;
  if p_reason is null or length(trim(p_reason)) not between 3 and 500 then
    raise exception 'Indica un motivo de 3 a 500 caracteres.';
  end if;
  if p_customer_notes is not null and length(trim(p_customer_notes)) > 1000 then
    raise exception 'Las notas generales superan el limite permitido.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'El pedido debe conservar entre 1 y 100 productos.';
  end if;

  v_request := jsonb_build_object(
    'order_id',p_order_id,
    'expected_updated_at',p_expected_updated_at,
    'customer_notes',nullif(trim(coalesce(p_customer_notes,'')),''),
    'reason',trim(p_reason),'items',p_items
  );
  insert into public.qb_started_order_edit_requests(idempotency_key,actor_id,request_payload)
  values(trim(p_idempotency_key),v_user_id,v_request) on conflict do nothing;
  select * into v_saved from public.qb_started_order_edit_requests
  where idempotency_key=trim(p_idempotency_key) for update;
  if v_saved.actor_id <> v_user_id or v_saved.request_payload <> v_request then
    raise exception 'QB_ORDER_EDIT_IDEMPOTENCY_CONFLICT';
  end if;
  if v_saved.response_payload is not null then
    return v_saved.response_payload || jsonb_build_object('replayed',true);
  end if;

  select * into v_order from public.qb_orders where id=p_order_id for update;
  if v_order.id is null then raise exception 'Pedido no encontrado.'; end if;
  if v_order.updated_at is distinct from p_expected_updated_at then
    raise exception 'QB_ORDER_EDIT_CONFLICT';
  end if;
  if v_order.delivered_at is not null or v_order.status in (
    'entregado_pendiente_recibo','incluido_en_recibo_borrador','recibo_emitido','cancelado'
  ) then
    raise exception 'QB_ORDER_ALREADY_DELIVERED';
  end if;
  if v_order.operational_date < v_current_date then
    raise exception 'No se puede modificar un pedido con fecha operativa pasada.';
  end if;
  if p_operational_date is distinct from v_order.operational_date then
    raise exception 'QB_ORDER_DATE_LOCKED_AFTER_PREPARATION';
  end if;
  select * into v_preparation from public.qb_order_preparations
  where order_id=p_order_id order by created_at desc limit 1 for update;
  if v_preparation.id is null or v_preparation.status='cancelado' then
    raise exception 'QB_ORDER_PREPARATION_NOT_ACTIVE';
  end if;

  -- Resolve every requested line before making any mutation.
  for v_input in select value from jsonb_array_elements(p_items) loop
    begin
      v_line_id := nullif(v_input->>'order_item_id','')::uuid;
      v_product_id := (v_input->>'product_id')::uuid;
      v_allowed_id := (v_input->>'allowed_unit_id')::uuid;
      v_quantity := (v_input->>'quantity')::numeric;
    exception when others then
      raise exception 'Una linea tiene identificadores o cantidades invalidos.';
    end;
    if v_quantity is null or v_quantity <= 0 or v_quantity > 10000
      or abs(v_quantity*1000-round(v_quantity*1000)) > 0.000001
      or length(trim(coalesce(v_input->>'notes',''))) > 500 then
      raise exception 'Una linea tiene cantidad o notas invalidas.';
    end if;
    if v_product_id=any(v_seen_products) then raise exception 'No repitas productos en el pedido.'; end if;
    v_seen_products := array_append(v_seen_products,v_product_id);
    if v_line_id is not null then
      if v_line_id=any(v_seen_items) then raise exception 'Una linea se repite en el pedido.'; end if;
      v_seen_items := array_append(v_seen_items,v_line_id);
      select * into v_current from public.qb_order_items
      where id=v_line_id and order_id=p_order_id for update;
      if v_current.id is null then raise exception 'QB_ORDER_EDIT_CONFLICT'; end if;
      if v_current.row_version <> coalesce((v_input->>'expected_version')::integer,-1) then
        raise exception 'QB_ORDER_EDIT_CONFLICT';
      end if;
    else
      v_current := null;
    end if;

    select product.*,settings.base_unit_id
    into v_product
    from public.products product
    join public.qb_product_unit_settings settings on settings.product_id=product.id
    where product.id=v_product_id and product.is_active=true and coalesce(product.is_sellable,true)
      and not coalesce(product.is_qb_loss_product,false)
      and settings.is_qb_active and settings.is_visible_in_qb_catalog
    for share of product,settings;
    if v_product.id is null then raise exception 'Uno de los productos ya no esta disponible.'; end if;
    select * into v_allowed from public.qb_product_allowed_units unit
    where unit.id=v_allowed_id and unit.product_id=v_product_id and unit.usage_context='pedido'
      and unit.is_active for share;
    if v_allowed.id is null or (coalesce(v_allowed.min_quantity,0)>0 and v_quantity<v_allowed.min_quantity)
      or (coalesce(v_allowed.quantity_step,0)>0 and abs(
        ((v_quantity-coalesce(v_allowed.min_quantity,v_allowed.quantity_step))/v_allowed.quantity_step)
        - round((v_quantity-coalesce(v_allowed.min_quantity,v_allowed.quantity_step))/v_allowed.quantity_step)
      )>0.000001) then
      raise exception 'La cantidad no coincide con la unidad seleccionada.';
    end if;
    select * into v_base_unit from public.qb_units where id=v_product.base_unit_id and is_active for share;
    if v_base_unit.id is null then raise exception 'El producto no tiene unidad base activa.'; end if;
    v_source_unit_id := null; v_presentation_id := null;
    if v_allowed.unit_id is not null then
      select * into v_source_unit from public.qb_units where id=v_allowed.unit_id and is_active
        and dimension_id=v_base_unit.dimension_id for share;
      if v_source_unit.id is null then raise exception 'La unidad seleccionada no tiene dimension compatible.'; end if;
      v_source_kind := 'universal_unit'; v_source_label := v_source_unit.symbol;
      v_source_unit_id := v_source_unit.id;
      v_factor := v_source_unit.conversion_factor_to_base/v_base_unit.conversion_factor_to_base;
    else
      select * into v_presentation from public.qb_product_presentations presentation
      where presentation.id=v_allowed.presentation_id and presentation.product_id=v_product_id
        and presentation.is_active and presentation.allow_order for share;
      if v_presentation.id is null or v_presentation.conversion_factor_to_base is null
        or v_presentation.conversion_factor_to_base<=0 then
        raise exception 'La presentacion no tiene equivalencia fisica verificable para nuevos pedidos.';
      end if;
      v_source_kind := 'product_presentation'; v_source_label := v_presentation.symbol;
      v_presentation_id := v_presentation.id; v_factor := v_presentation.conversion_factor_to_base;
    end if;
    v_base_quantity := round(v_quantity*v_factor,6);
    if v_line_id is not null and exists (
      select 1 from public.qb_order_delivery_items delivery
      where delivery.order_item_id=v_line_id and delivery.delivered_base_quantity>0
    ) and (v_current.product_id<>v_product_id or v_current.allowed_unit_id<>v_allowed_id
      or v_current.requested_quantity<>v_quantity) then
      raise exception 'QB_ORDER_LINE_ALREADY_DELIVERED';
    end if;
  end loop;

  -- Remove omitted, not-yet-delivered lines. Preserve their complete physical
  -- preparation snapshot in the immutable audit record before deleting rows.
  for v_current in select * from public.qb_order_items where order_id=p_order_id order by id for update loop
    if not (v_current.id=any(v_seen_items)) then
      if exists(select 1 from public.qb_order_delivery_items d where d.order_item_id=v_current.id and d.delivered_base_quantity>0)
        or exists(select 1 from public.qb_receipt_lines r where r.order_id=p_order_id and r.preparation_item_id in
          (select p.id from public.qb_order_preparation_items p where p.order_item_id=v_current.id)) then
        raise exception 'QB_ORDER_LINE_ALREADY_DELIVERED';
      end if;
      select * into v_prep from public.qb_order_preparation_items where order_item_id=v_current.id for update;
      select * into v_delivery from public.qb_order_delivery_items where order_item_id=v_current.id for update;
      if v_delivery.id is not null and (
        v_delivery.delivered_base_quantity>0
        or exists(select 1 from public.qb_order_delivery_movements m where m.delivery_item_id=v_delivery.id)
        or exists(select 1 from public.qb_same_day_reconciliation_requests r where r.delivery_item_id=v_delivery.id)
      ) then raise exception 'QB_ORDER_LINE_ALREADY_DELIVERED'; end if;
      v_before := jsonb_build_object('order_item',to_jsonb(v_current),
        'preparation_item',case when v_prep.id is null then null else to_jsonb(v_prep) end,
        'delivery_item',case when v_delivery.id is null then null else to_jsonb(v_delivery) end);
      insert into public.audit_logs(user_id,action,entity_type,entity_id,metadata)
      values(v_user_id,'admin_remove_qb_order_line','qb_order_item',v_current.id,
        jsonb_build_object('reason',trim(p_reason),'before',v_before,'order_id',p_order_id));
      if v_delivery.id is not null then delete from public.qb_order_delivery_items where id=v_delivery.id; end if;
      if v_prep.id is not null then delete from public.qb_order_preparation_items where id=v_prep.id; end if;
      delete from public.qb_order_items where id=v_current.id;
      v_count := v_count+1;
    end if;
  end loop;

  -- Apply retained and newly added lines in the request's original order.
  for v_input in select value from jsonb_array_elements(p_items) loop
    v_line_id := nullif(v_input->>'order_item_id','')::uuid;
    v_product_id := (v_input->>'product_id')::uuid;
    v_allowed_id := (v_input->>'allowed_unit_id')::uuid;
    v_quantity := (v_input->>'quantity')::numeric;
    select product.*,settings.base_unit_id
    into v_product
    from public.products product
    join public.qb_product_unit_settings settings on settings.product_id=product.id
    where product.id=v_product_id;
    select * into v_base_unit from public.qb_units where id=v_product.base_unit_id;
    select * into v_allowed from public.qb_product_allowed_units where id=v_allowed_id;
    if v_allowed.unit_id is not null then
      select * into v_source_unit from public.qb_units where id=v_allowed.unit_id;
      v_source_kind:='universal_unit'; v_source_label:=v_source_unit.symbol; v_source_unit_id:=v_source_unit.id;
      v_presentation_id:=null; v_factor:=v_source_unit.conversion_factor_to_base/v_base_unit.conversion_factor_to_base;
    else
      select * into v_presentation from public.qb_product_presentations where id=v_allowed.presentation_id;
      v_source_kind:='product_presentation'; v_source_label:=v_presentation.symbol; v_presentation_id:=v_presentation.id;
      v_source_unit_id:=null; v_factor:=v_presentation.conversion_factor_to_base;
    end if;
    v_base_quantity:=round(v_quantity*v_factor,6);
    if v_line_id is null then
      insert into public.qb_order_items(order_id,product_id,allowed_unit_id,source_kind,source_unit_id,
        product_presentation_id,source_label,requested_quantity,base_unit_id,base_unit_symbol,base_quantity,
        conversion_factor_to_base,customer_notes,sort_order)
      values(p_order_id,v_product_id,v_allowed_id,v_source_kind,v_source_unit_id,v_presentation_id,v_source_label,
        v_quantity,v_base_unit.id,v_base_unit.symbol,v_base_quantity,v_factor,
        nullif(trim(coalesce(v_input->>'notes','')),''),coalesce((select max(sort_order)+1 from public.qb_order_items where order_id=p_order_id),1))
      returning id into v_line_id;
      insert into public.qb_conversion_snapshots(source_table,source_id,product_id,dimension_code,source_kind,
        source_unit_id,product_presentation_id,source_label,source_quantity,base_unit_id,base_unit_symbol,
        base_quantity,conversion_factor_to_base,snapshot,created_by)
      values('qb_order_items',v_line_id,v_product_id,'pedido',v_source_kind,v_source_unit_id,v_presentation_id,
        v_source_label,v_quantity,v_base_unit.id,v_base_unit.symbol,v_base_quantity,v_factor,
        jsonb_build_object('allowed_unit_id',v_allowed_id,'source_label',v_source_label,'reason',trim(p_reason)),v_user_id)
      returning id into v_snapshot_id;
      update public.qb_order_items set conversion_snapshot_id=v_snapshot_id where id=v_line_id;
      insert into public.qb_order_preparation_items(preparation_id,order_item_id,product_id,requested_source_label,
        requested_quantity,requested_base_unit_id,requested_base_unit_symbol,requested_base_quantity,actual_quantity,
        actual_base_quantity,status,preparation_check,display_unit_id)
      values(v_preparation.id,v_line_id,v_product_id,v_source_label,v_quantity,v_base_unit.id,v_base_unit.symbol,
        v_base_quantity,0,0,'no_disponible',false,'original');
      insert into public.audit_logs(user_id,action,entity_type,entity_id,metadata)
      values(v_user_id,'admin_add_qb_order_line','qb_order_item',v_line_id,
        jsonb_build_object('reason',trim(p_reason),'after',jsonb_build_object('product_id',v_product_id,
        'quantity',v_quantity,'unit',v_source_label,'base_quantity',v_base_quantity),'order_id',p_order_id));
      v_count:=v_count+1;
    else
      select * into v_current from public.qb_order_items where id=v_line_id and order_id=p_order_id for update;
      select * into v_prep from public.qb_order_preparation_items where order_item_id=v_line_id for update;
      select * into v_delivery from public.qb_order_delivery_items where order_item_id=v_line_id for update;
      v_before:=jsonb_build_object('order_item',to_jsonb(v_current),
        'preparation_item',case when v_prep.id is null then null else to_jsonb(v_prep) end,
        'delivery_item',case when v_delivery.id is null then null else to_jsonb(v_delivery) end);
      if v_current.product_id<>v_product_id or v_current.allowed_unit_id<>v_allowed_id or v_current.requested_quantity<>v_quantity then
        if exists(select 1 from public.qb_order_delivery_items d where d.order_item_id=v_line_id and d.delivered_base_quantity>0)
          or exists(select 1 from public.qb_order_delivery_movements m where m.delivery_item_id=v_delivery.id)
          or exists(select 1 from public.qb_same_day_reconciliation_requests r where r.delivery_item_id=v_delivery.id)
          or exists(select 1 from public.qb_receipt_lines r where r.order_id=p_order_id and r.preparation_item_id=v_prep.id) then
          raise exception 'QB_ORDER_LINE_ALREADY_DELIVERED';
        end if;
        insert into public.qb_conversion_snapshots(source_table,source_id,product_id,dimension_code,source_kind,
          source_unit_id,product_presentation_id,source_label,source_quantity,base_unit_id,base_unit_symbol,
          base_quantity,conversion_factor_to_base,snapshot,created_by)
        values('qb_order_items',v_line_id,v_product_id,'pedido',v_source_kind,v_source_unit_id,v_presentation_id,
          v_source_label,v_quantity,v_base_unit.id,v_base_unit.symbol,v_base_quantity,
          v_factor,jsonb_build_object('allowed_unit_id',v_allowed_id,'reason',trim(p_reason)),v_user_id)
        returning id into v_snapshot_id;
        update public.qb_order_items set product_id=v_product_id,allowed_unit_id=v_allowed_id,source_kind=v_source_kind,
          source_unit_id=v_source_unit_id,product_presentation_id=v_presentation_id,source_label=v_source_label,
          requested_quantity=v_quantity,base_unit_id=v_base_unit.id,base_unit_symbol=v_base_unit.symbol,
          base_quantity=v_base_quantity,conversion_factor_to_base=v_factor,conversion_snapshot_id=v_snapshot_id,
          customer_notes=nullif(trim(coalesce(v_input->>'notes','')),''),row_version=row_version+1,updated_at=now()
        where id=v_line_id;
        if v_prep.id is not null then
          update public.qb_order_preparation_items set product_id=v_product_id,requested_source_label=v_source_label,
            requested_quantity=v_quantity,requested_base_unit_id=v_base_unit.id,requested_base_unit_symbol=v_base_unit.symbol,
            requested_base_quantity=v_base_quantity,preparation_check=false,status=case
              when actual_base_quantity=0 then 'no_disponible'
              when actual_base_quantity+0.000001>=v_base_quantity then 'completo' else 'parcial' end,
            origin_plan_confirmed=false,planned_pending_base_quantity=0,planned_external_base_quantity=0,
            planned_review_base_quantity=0,row_version=row_version+1,updated_at=now()
          where id=v_prep.id;
        end if;
        if v_delivery.id is not null then
          update public.qb_order_delivery_items set
            product_id=v_product_id,source_label=v_source_label,base_unit_id=v_base_unit.id,
            base_unit_symbol=v_base_unit.symbol,conversion_factor_to_base=v_factor,
            prepared_quantity_snapshot=coalesce(v_prep.actual_quantity,0),
            prepared_base_quantity_snapshot=coalesce(v_prep.actual_base_quantity,0),
            externally_sourced_quantity=0,externally_sourced_base_quantity=0,
            delivered_quantity=0,delivered_base_quantity=0,delivery_check=false,
            source_origin_confirmed=false,warehouse_used_base_quantity=0,
            pending_incoming_base_quantity=0,external_definitive_base_quantity=0,
            origin_review_base_quantity=0,row_version=row_version+1,
            last_idempotency_key=null,updated_at=now()
          where id=v_delivery.id;
        end if;
        v_after:=jsonb_build_object('order_item',to_jsonb((select i from public.qb_order_items i where i.id=v_line_id)),
          'preparation_item',case when v_prep.id is null then null else to_jsonb((select p from public.qb_order_preparation_items p where p.id=v_prep.id)) end,
          'delivery_item',case when v_delivery.id is null then null else to_jsonb((select d from public.qb_order_delivery_items d where d.id=v_delivery.id)) end);
        insert into public.audit_logs(user_id,action,entity_type,entity_id,metadata)
        values(v_user_id,'admin_update_qb_order_line_after_preparation','qb_order_item',v_line_id,
          jsonb_build_object('reason',trim(p_reason),'before',v_before,'after',v_after,'order_id',p_order_id,
          'physical_measurement_preserved',v_prep.id is not null));
        v_count:=v_count+1;
      elsif v_current.customer_notes is distinct from nullif(trim(coalesce(v_input->>'notes','')),'') then
        update public.qb_order_items set customer_notes=nullif(trim(coalesce(v_input->>'notes','')),''),
          row_version=row_version+1,updated_at=now() where id=v_line_id;
        insert into public.audit_logs(user_id,action,entity_type,entity_id,metadata)
        values(v_user_id,'admin_update_qb_order_line_note','qb_order_item',v_line_id,
          jsonb_build_object('reason',trim(p_reason),'before',v_current.customer_notes,
          'after',nullif(trim(coalesce(v_input->>'notes','')),''),'order_id',p_order_id));
        v_count:=v_count+1;
      end if;
    end if;
  end loop;

  update public.qb_orders set customer_notes=nullif(trim(coalesce(p_customer_notes,'')),''),updated_at=now()
  where id=p_order_id returning updated_at into v_updated_at;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,metadata)
  values(v_user_id,'admin_update_qb_order_after_preparation','qb_order',p_order_id,
    jsonb_build_object('reason',trim(p_reason),'before',jsonb_build_object('customer_notes',v_order.customer_notes),
      'after',jsonb_build_object('customer_notes',nullif(trim(coalesce(p_customer_notes,'')),'')),
      'line_changes',v_count,'preparation_id',v_preparation.id));
  v_response:=jsonb_build_object('id',p_order_id,'updated_at',v_updated_at,'changed_lines',v_count,'replayed',false);
  update public.qb_started_order_edit_requests set response_payload=v_response
  where idempotency_key=trim(p_idempotency_key);
  return v_response;
end;
$$;

revoke all on function public.admin_update_qb_internal_order_after_preparation(uuid,timestamptz,date,text,text,jsonb,text)
  from public,anon,authenticated;
grant execute on function public.admin_update_qb_internal_order_after_preparation(uuid,timestamptz,date,text,text,jsonb,text)
  to authenticated;
comment on function public.admin_update_qb_internal_order_after_preparation(uuid,timestamptz,date,text,text,jsonb,text) is
  'Admin-only transactional edit for active, not-yet-delivered orders after preparation starts; preserves physical snapshots and audits each change.';

commit;
