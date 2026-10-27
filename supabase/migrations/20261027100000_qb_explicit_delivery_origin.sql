begin;

alter table public.qb_order_preparation_items
  add column if not exists origin_plan_confirmed boolean not null default false,
  add column if not exists planned_pending_base_quantity numeric(18,6) not null default 0,
  add column if not exists planned_external_base_quantity numeric(18,6) not null default 0,
  add column if not exists planned_review_base_quantity numeric(18,6) not null default 0;

alter table public.qb_order_delivery_items
  add column if not exists warehouse_used_base_quantity numeric(18,6) not null default 0,
  add column if not exists pending_incoming_base_quantity numeric(18,6) not null default 0,
  add column if not exists external_definitive_base_quantity numeric(18,6) not null default 0,
  add column if not exists origin_review_base_quantity numeric(18,6) not null default 0,
  add column if not exists source_origin_confirmed boolean not null default false;

-- Historical rows have no trustworthy source breakdown. Preserve their known
-- warehouse quantity and place only the unclassified remainder in review.
update public.qb_order_preparation_items
set planned_review_base_quantity = greatest(
  requested_base_quantity - actual_base_quantity
  - planned_pending_base_quantity - planned_external_base_quantity, 0
)
where not origin_plan_confirmed
  and planned_pending_base_quantity = 0
  and planned_external_base_quantity = 0
  and planned_review_base_quantity = 0;

alter table public.qb_order_preparation_items
  drop constraint if exists qb_order_preparation_items_origin_quantities_check;
alter table public.qb_order_preparation_items
  add constraint qb_order_preparation_items_origin_quantities_check check (
    planned_pending_base_quantity >= 0
    and planned_external_base_quantity >= 0
    and planned_review_base_quantity >= 0
  );

alter table public.qb_order_delivery_items
  drop constraint if exists qb_order_delivery_items_origin_quantities_check;
alter table public.qb_order_delivery_items
  add constraint qb_order_delivery_items_origin_quantities_check check (
    warehouse_used_base_quantity >= 0
    and pending_incoming_base_quantity >= 0
    and external_definitive_base_quantity >= 0
    and origin_review_base_quantity >= 0
  );

comment on column public.qb_order_preparation_items.origin_plan_confirmed is
  'Indica que Inventario revisó el reparto de la cantidad solicitada entre almacén, ingreso de hoy, externo definitivo y revisión.';
comment on column public.qb_order_preparation_items.planned_review_base_quantity is
  'Parte del pedido cuyo origen aún debe determinarse. No se convierte ni se descuenta automáticamente.';
comment on column public.qb_order_delivery_items.warehouse_used_base_quantity is
  'Cantidad física efectivamente entregada desde almacén y única base para salida/FIFO.';
comment on column public.qb_order_delivery_items.source_origin_confirmed is
  'Confirmación explícita del Entregador sobre el origen físico final antes de confirmar el pedido.';

create or replace view public.qb_operational_preparation_items with (security_barrier=true) as
select p.id,p.preparation_id,p.order_item_id,p.product_id,p.requested_source_label,p.requested_quantity,
  p.requested_base_unit_id,p.requested_base_unit_symbol,p.requested_base_quantity,p.actual_allowed_unit_id,
  p.actual_source_kind,p.actual_source_unit_id,p.actual_product_presentation_id,p.actual_source_label,
  p.actual_quantity,p.actual_base_unit_id,p.actual_base_unit_symbol,p.actual_base_quantity,p.conversion_factor_to_base,
  p.conversion_snapshot_id,p.status,p.notes,p.created_at,p.updated_at,p.preparation_check,p.prepared_by_line,
  p.prepared_at_line,p.row_version,p.last_idempotency_key,p.actual_weight_kg,p.display_unit_id,
  (select f.full_name from public.profiles f where f.id=p.prepared_by_line) prepared_by_name,
  p.origin_plan_confirmed,p.planned_pending_base_quantity,p.planned_external_base_quantity,p.planned_review_base_quantity
from public.qb_order_preparation_items p
where public.current_user_role() in ('admin','administrador','inventario','entregador','supervisor');
revoke all on public.qb_operational_preparation_items from public,anon;
grant select on public.qb_operational_preparation_items to authenticated;

-- New wrapper keeps the established, audited preparation RPC and stores the
-- source plan atomically in the same transaction.
create or replace function public.save_qb_matrix_preparation_origin_with_unit(
  p_order_item_id uuid,
  p_expected_version integer,
  p_prepared_quantity numeric,
  p_preparation_check boolean,
  p_actual_weight_kg numeric,
  p_display_unit_id text,
  p_note text,
  p_pending_base_quantity numeric,
  p_external_base_quantity numeric,
  p_review_base_quantity numeric,
  p_origin_plan_confirmed boolean,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_order_item public.qb_order_items%rowtype;
  v_prep_item public.qb_order_preparation_items%rowtype;
  v_old jsonb;
  v_new jsonb;
  v_result jsonb;
begin
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_user is null or v_role not in ('admin','administrador','inventario','supervisor') then
    raise exception 'No tienes permiso para definir el origen durante la preparación.';
  end if;
  if p_pending_base_quantity < 0 or p_external_base_quantity < 0 or p_review_base_quantity < 0
    or p_pending_base_quantity is null or p_external_base_quantity is null or p_review_base_quantity is null then
    raise exception 'Las cantidades del origen no pueden ser negativas.';
  end if;

  select * into v_order_item from public.qb_order_items where id = p_order_item_id for update;
  if v_order_item.id is null then raise exception 'Línea de pedido no encontrada.'; end if;
  v_result := public.save_qb_matrix_preparation_item_with_unit(
    p_order_item_id,p_expected_version,p_prepared_quantity,p_preparation_check,
    p_actual_weight_kg,p_display_unit_id,p_note,p_idempotency_key
  );
  select * into v_prep_item from public.qb_order_preparation_items
    where order_item_id = p_order_item_id for update;
  if coalesce((v_result->>'replayed')::boolean,false) then return v_result; end if;

  if p_origin_plan_confirmed and abs(
    v_prep_item.actual_base_quantity + p_pending_base_quantity + p_external_base_quantity
    + p_review_base_quantity - v_order_item.base_quantity
  ) > 0.00001 then
    raise exception 'El reparto del origen debe sumar exactamente lo solicitado: almacén, pendiente de ingreso hoy, externo definitivo y por verificar.';
  end if;

  v_old := jsonb_build_object(
    'warehouse',v_prep_item.actual_base_quantity,
    'pending',v_prep_item.planned_pending_base_quantity,
    'external',v_prep_item.planned_external_base_quantity,
    'review',v_prep_item.planned_review_base_quantity,
    'confirmed',v_prep_item.origin_plan_confirmed
  );
  v_new := jsonb_build_object(
    'warehouse',v_prep_item.actual_base_quantity,
    'pending',p_pending_base_quantity,
    'external',p_external_base_quantity,
    'review',p_review_base_quantity,
    'confirmed',p_origin_plan_confirmed
  );
  update public.qb_order_preparation_items
    set planned_pending_base_quantity = p_pending_base_quantity,
        planned_external_base_quantity = p_external_base_quantity,
        planned_review_base_quantity = p_review_base_quantity,
        origin_plan_confirmed = p_origin_plan_confirmed
    where id = v_prep_item.id;
  insert into public.qb_order_line_change_events(
    order_id,order_item_id,customer_account_id,stage,field_name,old_value,new_value,
    unit_label,actor_id,actor_role,correlation_key,idempotency_key
  ) values (
    v_order_item.order_id,v_order_item.id,
    (select customer_account_id from public.qb_orders where id=v_order_item.order_id),
    'preparacion','merchandise_origin_plan',v_old,v_new,v_order_item.base_unit_symbol,
    v_user,v_role,p_idempotency_key,p_idempotency_key
  ) on conflict do nothing;
  return v_result || jsonb_build_object('origin_plan_confirmed',p_origin_plan_confirmed);
end;
$$;

create or replace function public.save_qb_matrix_delivery_origin_with_unit(
  p_order_item_id uuid,
  p_expected_version integer,
  p_externally_sourced_quantity numeric,
  p_delivered_quantity numeric,
  p_delivery_check boolean,
  p_actual_weight_kg numeric,
  p_display_unit_id text,
  p_note text,
  p_warehouse_base_quantity numeric,
  p_pending_base_quantity numeric,
  p_external_definitive_base_quantity numeric,
  p_review_base_quantity numeric,
  p_source_origin_confirmed boolean,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_order_item public.qb_order_items%rowtype;
  v_delivery public.qb_order_delivery_items%rowtype;
  v_external_legacy numeric;
  v_result jsonb;
  v_old jsonb;
  v_new jsonb;
begin
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_user is null or v_role not in ('admin','administrador','entregador') then
    raise exception 'No tienes permiso para confirmar el origen de entrega.';
  end if;
  if p_warehouse_base_quantity < 0 or p_pending_base_quantity < 0
    or p_external_definitive_base_quantity < 0 or p_review_base_quantity < 0
    or p_warehouse_base_quantity is null or p_pending_base_quantity is null
    or p_external_definitive_base_quantity is null or p_review_base_quantity is null then
    raise exception 'Las cantidades del origen no pueden ser negativas.';
  end if;
  select * into v_order_item from public.qb_order_items where id=p_order_item_id for update;
  if v_order_item.id is null then raise exception 'Línea de pedido no encontrada.'; end if;
  if v_order_item.conversion_factor_to_base <= 0 then raise exception 'La unidad física de la línea no tiene una conversión válida.'; end if;
  select * into v_delivery from public.qb_order_delivery_items where order_item_id=p_order_item_id for update;
  if v_delivery.id is not null and exists (
    select 1 from public.qb_order_delivery_movements movement
    where movement.delivery_item_id=v_delivery.id or movement.preparation_item_id=v_delivery.preparation_item_id
  ) and (
    abs(p_delivered_quantity-v_delivery.delivered_quantity)>0.000001
    or abs(p_warehouse_base_quantity-v_delivery.warehouse_used_base_quantity)>0.000001
    or abs(p_pending_base_quantity-v_delivery.pending_incoming_base_quantity)>0.000001
    or abs(p_external_definitive_base_quantity-v_delivery.external_definitive_base_quantity)>0.000001
    or abs(p_review_base_quantity-v_delivery.origin_review_base_quantity)>0.000001
    or p_source_origin_confirmed is distinct from v_delivery.source_origin_confirmed
  ) then
    raise exception 'La entrega ya tiene movimientos de inventario. Cambiar su origen o cantidades requiere el procedimiento de corrección auditada.';
  end if;

  -- Preserve legacy checks while allowing the Entregador to change the planned
  -- split: the legacy RPC receives the external residual needed to validate the
  -- total, then the exact source split is stored below.
  v_external_legacy := greatest(
    p_delivered_quantity - least(
      p_warehouse_base_quantity / v_order_item.conversion_factor_to_base,
      coalesce((select prepared_quantity_snapshot from public.qb_order_delivery_items where order_item_id=p_order_item_id),0)
    ), 0
  );
  v_result := public.save_qb_matrix_delivery_item_with_unit(
    p_order_item_id,p_expected_version,v_external_legacy,p_delivered_quantity,
    p_delivery_check,p_actual_weight_kg,p_display_unit_id,p_note,p_idempotency_key
  );
  select * into v_delivery from public.qb_order_delivery_items where order_item_id=p_order_item_id for update;
  if coalesce((v_result->>'replayed')::boolean,false) then return v_result; end if;

  if p_source_origin_confirmed and (
    p_review_base_quantity > 0.000001
    or abs(p_warehouse_base_quantity + p_pending_base_quantity + p_external_definitive_base_quantity
      + p_review_base_quantity - v_delivery.delivered_base_quantity) > 0.00001
  ) then
    raise exception 'Para confirmar, el origen debe coincidir con la cantidad realmente entregada y no puede quedar cantidad por verificar.';
  end if;
  v_old := jsonb_build_object(
    'warehouse',v_delivery.warehouse_used_base_quantity,
    'pending',v_delivery.pending_incoming_base_quantity,
    'external',v_delivery.external_definitive_base_quantity,
    'review',v_delivery.origin_review_base_quantity,
    'confirmed',v_delivery.source_origin_confirmed
  );
  v_new := jsonb_build_object(
    'warehouse',p_warehouse_base_quantity,
    'pending',p_pending_base_quantity,
    'external',p_external_definitive_base_quantity,
    'review',p_review_base_quantity,
    'confirmed',p_source_origin_confirmed
  );
  update public.qb_order_delivery_items
    set warehouse_used_base_quantity=p_warehouse_base_quantity,
        pending_incoming_base_quantity=p_pending_base_quantity,
        external_definitive_base_quantity=p_external_definitive_base_quantity,
        origin_review_base_quantity=p_review_base_quantity,
        source_origin_confirmed=p_source_origin_confirmed,
        externally_sourced_base_quantity=p_pending_base_quantity+p_external_definitive_base_quantity+p_review_base_quantity,
        externally_sourced_quantity=round((p_pending_base_quantity+p_external_definitive_base_quantity+p_review_base_quantity)
          / v_order_item.conversion_factor_to_base,6)
    where id=v_delivery.id;
  insert into public.qb_order_line_change_events(
    order_id,order_item_id,customer_account_id,stage,field_name,old_value,new_value,
    unit_label,actor_id,actor_role,correlation_key,idempotency_key
  ) values (
    v_order_item.order_id,v_order_item.id,
    (select customer_account_id from public.qb_orders where id=v_order_item.order_id),
    'entrega','merchandise_origin_actual',v_old,v_new,v_order_item.base_unit_symbol,
    v_user,v_role,p_idempotency_key,p_idempotency_key
  ) on conflict do nothing;
  return v_result || jsonb_build_object(
    'source_origin_confirmed',p_source_origin_confirmed,
    'delivered_base_quantity',v_delivery.delivered_base_quantity
  );
end;
$$;

create or replace function public.finalize_qb_matrix_preparation(
  p_order_id uuid,
  p_expected_updated_at timestamptz,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_order public.qb_orders%rowtype;
  v_preparation public.qb_order_preparations%rowtype;
begin
  select role into v_role from public.profiles where id=v_user and is_active;
  if v_user is null or v_role not in ('admin','administrador','inventario') then
    raise exception 'No tienes permisos para finalizar preparación.';
  end if;
  if length(trim(coalesce(p_idempotency_key,''))) < 8 then raise exception 'Clave de idempotencia inválida.'; end if;
  select * into v_order from public.qb_orders where id=p_order_id for update;
  if v_order.id is null or v_order.updated_at is distinct from p_expected_updated_at then
    raise exception 'QB_MATRIX_CONFLICT: el pedido cambió en otro dispositivo.' using errcode='40001';
  end if;
  select * into v_preparation from public.qb_order_preparations where order_id=p_order_id for update;
  if v_preparation.id is null or v_preparation.status<>'en_preparacion' then
    raise exception 'La preparación no está abierta.';
  end if;
  if exists (
    select 1 from public.qb_order_items oi
    left join public.qb_order_preparation_items pi on pi.order_item_id=oi.id
    where oi.order_id=p_order_id and (
      pi.prepared_at_line is null or not pi.origin_plan_confirmed
      or abs(pi.actual_base_quantity+pi.planned_pending_base_quantity+
        pi.planned_external_base_quantity+pi.planned_review_base_quantity-oi.base_quantity)>0.00001
    )
  ) then
    raise exception 'Revisa y confirma el reparto del origen para cada producto antes de finalizar preparación.';
  end if;
  update public.qb_order_preparations set status='preparado',prepared_by=v_user,prepared_at=now() where id=v_preparation.id;
  update public.qb_orders set status='preparado' where id=p_order_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,metadata)
  values(v_user,'finalize_qb_matrix_preparation','qb_order',p_order_id,
    jsonb_build_object('idempotency_key',p_idempotency_key,'origin_plan','explicit'));
  return p_order_id;
end;
$$;

-- All delivery quantities and origin components are finalized in one transaction.
create or replace function public.confirm_qb_matrix_delivery_finalization_v1(
  p_order_id uuid,
  p_expected_updated_at timestamptz,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_order public.qb_orders%rowtype;
  v_preparation public.qb_order_preparations%rowtype;
  v_line record;
  v_before numeric(14,3);
  v_after numeric(14,3);
  v_inventory_movement uuid;
  v_delivery_movement uuid;
  v_request public.qb_same_day_reconciliation_requests%rowtype;
  v_day date;
  v_source_class text;
  v_source_key text;
begin
  select role into v_role from public.profiles where id=v_user and is_active;
  if v_user is null or v_role not in ('admin','administrador','entregador') then
    raise exception 'Solo administración o entrega puede confirmar la entrega.';
  end if;
  select * into v_order from public.qb_orders where id=p_order_id for update;
  if v_order.id is null or v_order.updated_at is distinct from p_expected_updated_at then
    raise exception 'QB_MATRIX_CONFLICT: el pedido cambió en otro dispositivo.' using errcode='40001';
  end if;
  if v_order.status <> 'preparado' then raise exception 'El pedido debe estar preparado.'; end if;
  select * into v_preparation from public.qb_order_preparations
    where order_id=p_order_id and status='preparado' for update;
  if v_preparation.id is null then raise exception 'Preparación finalizada no encontrada.'; end if;
  if exists (
    select 1 from public.qb_order_items oi
    left join public.qb_order_delivery_items di on di.order_item_id=oi.id
    where oi.order_id=p_order_id and (di.id is null or not di.delivery_check or not di.source_origin_confirmed)
  ) then raise exception 'Revisa la entrega física y confirma el origen real de cada producto antes de finalizar.'; end if;
  if exists (
    select 1 from public.qb_order_delivery_items di
    where di.order_id=p_order_id and (
      di.origin_review_base_quantity > 0.000001
      or abs(di.warehouse_used_base_quantity+di.pending_incoming_base_quantity+
        di.external_definitive_base_quantity+di.origin_review_base_quantity-di.delivered_base_quantity)>0.00001
    )
  ) then raise exception 'La distribución de origen no coincide con lo entregado; resuelve las diferencias antes de confirmar.'; end if;

  for v_line in
    select di.*, prep.preparation_id, oi.base_unit_symbol as requested_base_unit_symbol
      from public.qb_order_delivery_items di
      join public.qb_order_preparation_items prep on prep.id=di.preparation_item_id
      join public.qb_order_items oi on oi.id=di.order_item_id
     where di.order_id=p_order_id order by di.product_id,di.id
  loop
    select movement.id,movement.inventory_movement_id into v_delivery_movement,v_inventory_movement
      from public.qb_order_delivery_movements movement
     where movement.preparation_item_id=v_line.preparation_item_id;
    if not found then
      v_inventory_movement := null;
      if v_line.warehouse_used_base_quantity > 0 then
        select stock_current into v_before from public.products
         where id=v_line.product_id and is_active and not coalesce(is_qb_loss_product,false) for update;
        if v_before is null then raise exception 'Producto de almacén no disponible.'; end if;
        if v_before < v_line.warehouse_used_base_quantity then
          raise exception 'QB_STOCK_INSUFFICIENT: producto %, se necesitan % % y hay % % disponibles.',
            v_line.source_label,v_line.warehouse_used_base_quantity,v_line.requested_base_unit_symbol,v_before,v_line.requested_base_unit_symbol
            using errcode='P0001';
        end if;
        v_after := v_before-v_line.warehouse_used_base_quantity;
        insert into public.inventory_movements(product_id,movement_type,quantity,stock_before,stock_after,reason,notes,created_by)
        values(v_line.product_id,'salida',v_line.warehouse_used_base_quantity,v_before,v_after,'Entrega QB',
          'Componente confirmado desde almacén; pedido '||p_order_id::text,v_user)
        returning id into v_inventory_movement;
        update public.products set stock_current=v_after where id=v_line.product_id;
      end if;
      insert into public.qb_order_delivery_movements(
        order_id,preparation_id,preparation_item_id,product_id,inventory_movement_id,
        delivered_base_quantity,warehouse_base_quantity,delivery_item_id,delivered_by,delivered_at
      ) values(
        p_order_id,v_line.preparation_id,v_line.preparation_item_id,v_line.product_id,v_inventory_movement,
        v_line.delivered_base_quantity,v_line.warehouse_used_base_quantity,v_line.id,v_user,now()
      ) returning id into v_delivery_movement;
    else
      update public.qb_order_delivery_movements set
        delivered_base_quantity=v_line.delivered_base_quantity,
        warehouse_base_quantity=v_line.warehouse_used_base_quantity,
        delivery_item_id=v_line.id,delivered_by=v_user,delivered_at=now()
      where id=v_delivery_movement;
    end if;

    if v_line.pending_incoming_base_quantity > 0 or v_line.external_definitive_base_quantity > 0 then
      v_day := (coalesce((select delivered_at from public.qb_order_delivery_movements where id=v_delivery_movement),now()) at time zone 'America/La_Paz')::date;
      v_source_class := case when v_line.pending_incoming_base_quantity > 0 then 'pending' else 'external_definitive' end;
      v_source_key := 'delivery-origin-'||v_delivery_movement::text;
      select * into v_request from public.qb_same_day_reconciliation_requests where delivery_movement_id=v_delivery_movement for update;
      if v_request.id is null then
        insert into public.qb_same_day_reconciliation_requests(
          delivery_movement_id,delivery_item_id,order_id,product_id,operational_date,
          delivered_base_quantity,warehouse_base_quantity,externally_sourced_base_quantity,
          pending_quantity,reconciled_quantity,classification,status,classification_note,idempotency_key,classified_by
        ) values(
          v_delivery_movement,v_line.id,p_order_id,v_line.product_id,v_day,
          v_line.delivered_base_quantity,v_line.warehouse_used_base_quantity,
          v_line.pending_incoming_base_quantity+v_line.external_definitive_base_quantity,
          v_line.pending_incoming_base_quantity,0,v_source_class,v_source_class,
          'Origen confirmado antes de finalizar la entrega.',v_source_key,v_user
        ) returning * into v_request;
        insert into public.qb_same_day_reconciliation_events(request_id,classification,pending_quantity,note,idempotency_key,actor_id)
        values(v_request.id,v_source_class,v_line.pending_incoming_base_quantity,
          'Origen confirmado antes de finalizar la entrega.',v_source_key||'-event',v_user);
      elsif v_request.product_id<>v_line.product_id
        or v_request.delivered_base_quantity<>v_line.delivered_base_quantity
        or v_request.warehouse_base_quantity<>v_line.warehouse_used_base_quantity
        or v_request.pending_quantity<>v_line.pending_incoming_base_quantity then
        raise exception 'El origen de esta entrega ya tiene conciliación registrada; una corrección requiere el procedimiento auditado.';
      end if;
      if v_line.pending_incoming_base_quantity > 0 then
        perform private.reconcile_qb_same_day_pending_for_product(v_line.product_id,v_day,null,v_user);
      end if;
    end if;
  end loop;

  insert into public.qb_order_delivery_confirmations(order_id,status,idempotency_key,confirmed_by,confirmed_at)
  values(p_order_id,'confirmado',p_idempotency_key,v_user,now())
  on conflict(order_id) do update set status='confirmado',
    confirmation_version=public.qb_order_delivery_confirmations.confirmation_version+1,
    idempotency_key=excluded.idempotency_key,confirmed_by=excluded.confirmed_by,confirmed_at=excluded.confirmed_at;
  update public.qb_orders set status='entregado_pendiente_recibo',delivered_by=v_user,delivered_at=now()
    where id=p_order_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,metadata)
  values(v_user,'confirm_qb_matrix_delivery','qb_order',p_order_id,
    jsonb_build_object('idempotency_key',p_idempotency_key,'source_distribution','explicit'));
  return p_order_id;
end;
$$;

revoke all on function public.save_qb_matrix_preparation_origin_with_unit(uuid,integer,numeric,boolean,numeric,text,text,numeric,numeric,numeric,boolean,text) from public,anon;
grant execute on function public.save_qb_matrix_preparation_origin_with_unit(uuid,integer,numeric,boolean,numeric,text,text,numeric,numeric,numeric,boolean,text) to authenticated;
revoke all on function public.save_qb_matrix_delivery_origin_with_unit(uuid,integer,numeric,numeric,boolean,numeric,text,text,numeric,numeric,numeric,numeric,boolean,text) from public,anon;
grant execute on function public.save_qb_matrix_delivery_origin_with_unit(uuid,integer,numeric,numeric,boolean,numeric,text,text,numeric,numeric,numeric,numeric,boolean,text) to authenticated;
revoke all on function public.confirm_qb_matrix_delivery_finalization_v1(uuid,timestamptz,text) from public,anon;
grant execute on function public.confirm_qb_matrix_delivery_finalization_v1(uuid,timestamptz,text) to authenticated;

commit;
