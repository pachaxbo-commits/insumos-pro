-- Fase 5B.1: archival, transactional prepublication cleanup.
-- This is deliberately separate from the QA reset RPCs used by the application.
begin;

create table if not exists private.qb_prepublication_cleanup_runs (
  id uuid primary key,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  reason text not null check (length(btrim(reason)) >= 12 and length(reason) <= 500),
  status text not null check (status in ('completed')),
  before_snapshot jsonb not null,
  after_snapshot jsonb not null,
  archived_rows bigint not null check (archived_rows >= 0),
  stock_adjustments jsonb not null default '[]'::jsonb,
  result jsonb not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz not null default now()
);

create table if not exists private.qb_prepublication_cleanup_archive (
  id bigint generated always as identity primary key,
  run_id uuid not null references private.qb_prepublication_cleanup_runs(id) on delete restrict,
  record_class text not null check (record_class in ('operation', 'operation_audit')),
  source_schema text not null,
  source_table text not null,
  source_key jsonb not null,
  record_data jsonb not null,
  record_md5 text not null check (record_md5 ~ '^[0-9a-f]{32}$'),
  archived_at timestamptz not null default now()
);
create index if not exists qb_prepublication_cleanup_archive_run_idx
  on private.qb_prepublication_cleanup_archive(run_id, source_schema, source_table);

revoke all on private.qb_prepublication_cleanup_runs,
  private.qb_prepublication_cleanup_archive from public, anon, authenticated, service_role;

-- Issued receipt lines normally remain immutable. Permit DELETE only while the
-- direct-admin archival executor holds its transaction-local run marker.
create or replace function private.protect_qb_issued_receipt_lines()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_receipt_id uuid;
  v_cleanup_run text := current_setting('qb.prepublication_cleanup_run_id', true);
begin
  if tg_op = 'DELETE' then v_receipt_id := old.receipt_id;
  else v_receipt_id := new.receipt_id;
  end if;
  if tg_op = 'DELETE'
    and session_user in ('postgres','supabase_admin')
    and current_user = 'postgres'
    and v_cleanup_run ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1 from private.qb_prepublication_cleanup_runs run
      where run.id=v_cleanup_run::uuid and run.status='completed'
    ) then
    return old;
  end if;
  if exists (
    select 1 from public.qb_receipts receipt
    where receipt.id=v_receipt_id and receipt.status <> 'borrador'
  ) then
    raise exception 'Las lineas de un recibo emitido son inmutables.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.protect_qb_issued_receipt_lines() from public, anon, authenticated, service_role;

create or replace function private.qb_prepublication_cleanup_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_tables jsonb := '{}'::jsonb;
  v_masters jsonb := '{}'::jsonb;
  v_count bigint;
  v_md5 text;
  v_products jsonb;
  v_item text[];
  v_schema text;
  v_table text;
begin
  -- Hash entire operational tables, not just row counts. This makes the
  -- reviewed read-only preview invalid after inserts, deletes, or edits.
  foreach v_item slice 1 in array array[
    array['public','qb_orders'], array['public','qb_order_items'],
    array['public','qb_order_preparations'], array['public','qb_order_preparation_items'],
    array['public','qb_order_delivery_confirmations'], array['public','qb_order_delivery_items'],
    array['public','qb_order_delivery_movements'], array['public','qb_order_line_change_events'],
    array['public','qb_operational_day_orders'], array['public','qb_receipts'],
    array['public','qb_receipt_orders'], array['public','qb_receipt_lines'],
    array['public','qb_receipt_events'], array['public','qb_merchandise_receipts'],
    array['public','qb_merchandise_receipt_lines'],
    array['public','qb_merchandise_receipt_classification_results'],
    array['public','qb_merchandise_receipt_movements'],
    array['public','qb_same_day_reconciliation_requests'],
    array['public','qb_same_day_reconciliation_allocations'],
    array['public','qb_same_day_reconciliation_events'],
    array['public','qb_conversion_snapshots'], array['public','inventory_movements'],
    array['public','inventory_lots'], array['public','inventory_lot_consumptions'],
    array['public','inventory_fifo_consumption_runs'], array['public','inventory_lot_writeoffs'],
    array['public','qb_warehouse_operating_expenses'], array['public','orders'],
    array['public','order_items'], array['public','purchases'], array['public','purchase_items'],
    array['public','sales'], array['public','sale_items'], array['public','payments'],
    array['public','cash_movements'], array['public','accounts_receivable'],
    array['public','accounts_payable'], array['private','qb_guest_order_idempotency'],
    array['private','qb_guest_order_rate_limits'], array['private','qb_order_amount_snapshots'],
    array['private','qb_operational_import_batches'], array['public','audit_logs']
  ] loop
    v_schema := v_item[1];
    v_table := v_item[2];
    execute format(
      'select count(*), md5(coalesce(string_agg(payload, E''\n'' order by payload), '''')) from (select to_jsonb(t)::text payload from %I.%I t) rows',
      v_schema, v_table
    ) into v_count, v_md5;
    v_tables := v_tables || jsonb_build_object(
      v_schema || '.' || v_table,
      jsonb_build_object('rows', v_count, 'md5', v_md5)
    );
  end loop;

  -- Fingerprint the masters/configuration that must remain unchanged.
  foreach v_item slice 1 in array array[
    array['public','product_categories'], array['public','qb_units'],
    array['public','qb_unit_dimensions'], array['public','units_of_measure'],
    array['public','qb_product_unit_settings'], array['public','qb_product_allowed_units'],
    array['public','qb_product_presentations'], array['public','qb_product_classification_outputs'],
    array['public','qb_product_unit_regularization_audit'], array['public','product_deletion_audit'],
    array['public','customer_accounts'], array['public','customers'],
    array['public','qb_customer_locations'], array['public','profiles'],
    array['public','qb_operational_settings'], array['public','qb_ui_settings']
  ] loop
    v_schema := v_item[1];
    v_table := v_item[2];
    execute format(
      'select count(*), md5(coalesce(string_agg(payload, E''\n'' order by payload), '''')) from (select to_jsonb(t)::text payload from %I.%I t) rows',
      v_schema, v_table
    ) into v_count, v_md5;
    v_masters := v_masters || jsonb_build_object(
      v_schema || '.' || v_table,
      jsonb_build_object('rows', v_count, 'md5', v_md5)
    );
  end loop;

  select jsonb_build_object(
    'rows', count(*),
    'md5', md5(coalesce(string_agg((to_jsonb(p) - 'stock_current' - 'updated_at')::text, E'\n'
      order by (to_jsonb(p) - 'stock_current' - 'updated_at')::text), '')),
    'stock_md5', md5(coalesce(string_agg(p.id::text || ':' || p.stock_current::text, E'\n' order by p.id), ''))
  ) into v_products
  from public.products p;
  v_masters := v_masters || jsonb_build_object('public.products', v_products);

  return jsonb_build_object('operations', v_tables, 'preserved_masters', v_masters);
end;
$$;

create or replace function private.execute_qb_prepublication_cleanup(
  p_run_id uuid,
  p_actor uuid,
  p_reason text,
  p_confirmation text,
  p_expected_snapshot jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_existing private.qb_prepublication_cleanup_runs%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_actor_role text;
  v_item text[];
  v_schema text;
  v_table text;
  v_row_count bigint;
  v_archived bigint := 0;
  v_adjustment record;
  v_movement_id uuid;
  v_adjustments jsonb := '[]'::jsonb;
  v_result jsonb;
  v_bad bigint;
begin
  if session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Cleanup requires a direct database administrator session.';
  end if;
  if p_run_id is null or p_actor is null or p_expected_snapshot is null then
    raise exception 'Run id, administrator, and reviewed snapshot are required.';
  end if;
  if p_confirmation is distinct from 'ARCHIVAR OPERACIONES FICTICIAS' then
    raise exception 'Explicit cleanup confirmation is required.';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 12 or length(p_reason) > 500 then
    raise exception 'A specific cleanup reason is required.';
  end if;
  select p.role into v_actor_role from public.profiles p
   where p.id = p_actor and p.is_active for share;
  if v_actor_role not in ('admin', 'administrador') then
    raise exception 'An active administrator profile is required.';
  end if;

  select * into v_existing from private.qb_prepublication_cleanup_runs where id = p_run_id;
  if found then
    if v_existing.actor_profile_id = p_actor
      and v_existing.reason = btrim(p_reason)
      and v_existing.before_snapshot = p_expected_snapshot then
      return v_existing.result || jsonb_build_object('status', 'already_completed');
    end if;
    raise exception 'Run id already exists with a different reviewed scope.';
  end if;

  lock table public.accounts_payable, public.accounts_receivable, public.audit_logs,
    public.cash_movements, public.inventory_fifo_consumption_runs,
    public.inventory_lot_consumptions, public.inventory_lot_writeoffs,
    public.inventory_lots, public.inventory_movements, public.order_items,
    public.orders, public.payments, public.purchase_items, public.purchases,
    public.qb_conversion_snapshots, public.qb_merchandise_receipt_classification_results,
    public.qb_merchandise_receipt_lines, public.qb_merchandise_receipt_movements,
    public.qb_merchandise_receipts, public.qb_operational_day_orders,
    public.qb_order_delivery_confirmations, public.qb_order_delivery_items,
    public.qb_order_delivery_movements, public.qb_order_items,
    public.qb_order_line_change_events, public.qb_order_preparation_items,
    public.qb_order_preparations, public.qb_receipt_events, public.qb_receipt_lines,
    public.qb_receipt_orders, public.qb_receipts,
    public.qb_same_day_reconciliation_allocations,
    public.qb_same_day_reconciliation_events,
    public.qb_same_day_reconciliation_requests,
    public.qb_warehouse_operating_expenses, public.sale_items, public.sales,
    public.products in access exclusive mode;
  lock table private.qb_guest_order_idempotency, private.qb_guest_order_rate_limits,
    private.qb_operational_import_batches, private.qb_order_amount_snapshots in access exclusive mode;

  v_before := private.qb_prepublication_cleanup_snapshot();
  if v_before is distinct from p_expected_snapshot then
    raise exception 'The database changed after review; take a new preview before retrying.';
  end if;

  select count(*) into v_bad from public.products where stock_current < 0;
  if v_bad > 0 then raise exception 'Negative product stock exists; cleanup stopped.'; end if;
  select count(*) into v_bad
  from public.products p
  left join lateral (
    select m.stock_after from public.inventory_movements m
    where m.product_id = p.id order by m.created_at desc, m.id desc limit 1
  ) last_movement on true
  where p.stock_current <> coalesce(last_movement.stock_after, 0);
  if v_bad > 0 then raise exception 'Product stock differs from its movement ledger; cleanup stopped.'; end if;
  select count(*) into v_bad
  from public.inventory_lots lot
  left join (select lot_id, sum(quantity_consumed) quantity from public.inventory_lot_consumptions group by lot_id) c on c.lot_id=lot.id
  left join (select lot_id, sum(quantity) quantity from public.inventory_lot_writeoffs group by lot_id) w on w.lot_id=lot.id
  where lot.remaining_quantity < 0 or lot.remaining_quantity > lot.initial_quantity
     or lot.initial_quantity <> lot.remaining_quantity + coalesce(c.quantity,0) + coalesce(w.quantity,0);
  if v_bad > 0 then raise exception 'FIFO lot balances do not reconcile; cleanup stopped.'; end if;

  insert into private.qb_prepublication_cleanup_runs(
    id, actor_profile_id, reason, status, before_snapshot, after_snapshot,
    archived_rows, stock_adjustments, result
  ) values (p_run_id, p_actor, btrim(p_reason), 'completed', v_before, '{}'::jsonb, 0, '[]'::jsonb, '{}'::jsonb);
  perform set_config('qb.prepublication_cleanup_run_id',p_run_id::text,true);

  -- Archive complete rows before deleting any operational record. This list is
  -- intentionally explicit; product/customer/user/configuration masters are absent.
  foreach v_item slice 1 in array array[
    array['public','qb_orders'], array['public','qb_order_items'],
    array['public','qb_order_preparations'], array['public','qb_order_preparation_items'],
    array['public','qb_order_delivery_confirmations'], array['public','qb_order_delivery_items'],
    array['public','qb_order_delivery_movements'], array['public','qb_order_line_change_events'],
    array['public','qb_operational_day_orders'], array['public','qb_receipts'],
    array['public','qb_receipt_orders'], array['public','qb_receipt_lines'],
    array['public','qb_receipt_events'], array['public','qb_merchandise_receipts'],
    array['public','qb_merchandise_receipt_lines'],
    array['public','qb_merchandise_receipt_classification_results'],
    array['public','qb_merchandise_receipt_movements'],
    array['public','qb_same_day_reconciliation_requests'],
    array['public','qb_same_day_reconciliation_allocations'],
    array['public','qb_same_day_reconciliation_events'],
    array['public','qb_conversion_snapshots'], array['public','inventory_movements'],
    array['public','inventory_lots'], array['public','inventory_lot_consumptions'],
    array['public','inventory_fifo_consumption_runs'], array['public','inventory_lot_writeoffs'],
    array['public','qb_warehouse_operating_expenses'], array['public','orders'],
    array['public','order_items'], array['public','purchases'], array['public','purchase_items'],
    array['public','sales'], array['public','sale_items'], array['public','payments'],
    array['public','cash_movements'], array['public','accounts_receivable'],
    array['public','accounts_payable'], array['private','qb_guest_order_idempotency'],
    array['private','qb_guest_order_rate_limits'], array['private','qb_order_amount_snapshots'],
    array['private','qb_operational_import_batches']
  ] loop
    v_schema := v_item[1]; v_table := v_item[2];
    execute format(
      'insert into private.qb_prepublication_cleanup_archive(run_id,record_class,source_schema,source_table,source_key,record_data,record_md5) select $1,''operation'',%L,%L,coalesce(to_jsonb(t)->''id'',to_jsonb(t)->''inventory_movement_id'',to_jsonb(t)->''order_item_id'',to_jsonb(t)),to_jsonb(t),md5(to_jsonb(t)::text) from %I.%I t',
      v_schema, v_table, v_schema, v_table
    ) using p_run_id;
    get diagnostics v_row_count = row_count;
    v_archived := v_archived + v_row_count;
  end loop;

  -- Archive only logs tied to the operations just snapshotted. Security,
  -- administrative, unit regularization, and product-deletion audits stay live.
  insert into private.qb_prepublication_cleanup_archive(
    run_id,record_class,source_schema,source_table,source_key,record_data,record_md5
  )
  select p_run_id,'operation_audit','public','audit_logs',to_jsonb(a)->'id',to_jsonb(a),md5(to_jsonb(a)::text)
  from public.audit_logs a
  where (a.entity_id is not null and exists (
    select 1 from private.qb_prepublication_cleanup_archive archived
    where archived.run_id=p_run_id and archived.record_data->>'id'=a.entity_id::text
  ))
  or lower(coalesce(a.entity_type,'')) in (
    'order','qb_order','order_item','preparation','delivery','receipt','qb_receipt',
    'sale','purchase','inventory_movement','inventory_lot','merchandise_receipt',
    'qb_merchandise_receipt','stock_adjustment','qb_order_delivery_movement',
    'qb_order_preparation_items','qb_warehouse_operating_expense'
  );
  get diagnostics v_row_count = row_count;
  v_archived := v_archived + v_row_count;

  create temporary table if not exists qb_prepublication_cleanup_keep_movements(id uuid primary key) on commit drop;
  truncate table pg_temp.qb_prepublication_cleanup_keep_movements;
  for v_adjustment in
    select p.id, p.stock_current
    from public.products p where p.stock_current <> 0 order by p.id for update
  loop
    insert into public.inventory_movements(
      product_id,movement_type,quantity,stock_before,stock_after,reason,notes,created_by
    ) values(
      v_adjustment.id,'ajuste',abs(v_adjustment.stock_current),v_adjustment.stock_current,0,
      'Cierre preoperativo de datos ficticios',
      'Limpieza archivada. Lote de cierre ' || p_run_id::text,
      p_actor
    ) returning id into v_movement_id;
    insert into pg_temp.qb_prepublication_cleanup_keep_movements(id) values(v_movement_id);
    update public.products set stock_current=0,updated_at=now() where id=v_adjustment.id;
    v_adjustments := v_adjustments || jsonb_build_array(jsonb_build_object(
      'product_id',v_adjustment.id,'movement_id',v_movement_id,'quantity',abs(v_adjustment.stock_current)
    ));
  end loop;

  -- Break the operational graph in FK-safe order. No constraints are disabled.
  delete from private.qb_guest_order_idempotency;
  delete from private.qb_guest_order_rate_limits;
  delete from private.qb_order_amount_snapshots;
  delete from private.qb_operational_import_batches;
  delete from public.audit_logs a where exists (
    select 1 from private.qb_prepublication_cleanup_archive x
    where x.run_id=p_run_id and x.source_schema='public' and x.source_table='audit_logs'
      and x.record_data->>'id'=a.id::text
  );
  delete from public.qb_receipt_events;
  delete from public.qb_receipt_lines;
  delete from public.qb_receipt_orders;
  delete from public.qb_receipts;
  delete from public.qb_same_day_reconciliation_allocations;
  delete from public.qb_same_day_reconciliation_events;
  delete from public.qb_same_day_reconciliation_requests;
  delete from public.inventory_lot_consumptions;
  delete from public.inventory_lot_writeoffs;
  delete from public.inventory_fifo_consumption_runs;
  delete from public.qb_order_delivery_movements;
  delete from public.qb_order_delivery_items;
  delete from public.qb_order_line_change_events;
  delete from public.qb_order_delivery_confirmations;
  delete from public.qb_order_preparation_items;
  delete from public.qb_order_preparations;
  delete from public.qb_operational_day_orders;
  delete from public.qb_order_items;
  delete from public.qb_orders;
  delete from public.qb_merchandise_receipt_classification_results;
  delete from public.inventory_lots;
  delete from public.qb_merchandise_receipt_movements;
  delete from public.qb_merchandise_receipt_lines;
  delete from public.qb_merchandise_receipts;
  delete from public.inventory_movements m where not exists (
    select 1 from pg_temp.qb_prepublication_cleanup_keep_movements keep where keep.id=m.id
  );
  delete from public.qb_conversion_snapshots where source_table in (
    'qb_orders','qb_order_items','qb_order_preparations','qb_order_preparation_items',
    'qb_order_delivery_items','qb_order_delivery_movements','qb_receipts','qb_receipt_lines',
    'qb_merchandise_receipts','qb_merchandise_receipt_lines'
  );
  delete from public.purchase_items;
  delete from public.sale_items;
  delete from public.order_items;
  delete from public.payments;
  delete from public.cash_movements;
  delete from public.accounts_receivable;
  delete from public.accounts_payable;
  delete from public.purchases;
  delete from public.sales;
  delete from public.orders;
  delete from public.qb_warehouse_operating_expenses;

  -- Fail closed if any targeted operation remains or a master changed.
  select private.qb_prepublication_cleanup_snapshot() into v_after;
  select count(*) into v_bad from public.products where stock_current <> 0;
  if v_bad > 0 then raise exception 'Cleanup left nonzero product stock.'; end if;
  select count(*) into v_bad from jsonb_each(v_after->'operations') item
  where item.key not in ('public.inventory_movements','public.audit_logs')
    and (item.value->>'rows')::bigint <> 0;
  if v_bad > 0 then raise exception 'Cleanup left operational records.'; end if;
  select count(*) into v_bad from public.inventory_movements;
  if v_bad <> jsonb_array_length(v_adjustments) then
    raise exception 'Unexpected inventory movements remain after cleanup.';
  end if;
  if ((v_after->'preserved_masters') - 'public.products'::text)
       <> ((v_before->'preserved_masters') - 'public.products'::text)
    or (v_after->'preserved_masters'->'public.products'->>'rows')
       <> (v_before->'preserved_masters'->'public.products'->>'rows')
    or (v_after->'preserved_masters'->'public.products'->>'md5')
       <> (v_before->'preserved_masters'->'public.products'->>'md5') then
    raise exception 'A catalog, customer, user, or configuration master changed.';
  end if;
  if exists (
    select 1 from public.inventory_movements m
    where m.reason <> 'Cierre preoperativo de datos ficticios'
       or m.notes not like 'Limpieza archivada. Lote de cierre %'
  ) then raise exception 'A normal inventory movement remains after cleanup.'; end if;

  v_result := jsonb_build_object(
    'status','completed','run_id',p_run_id,'archived_rows',v_archived,
    'stock_adjustments',v_adjustments,
    'preserved_products',(select count(*) from public.products),
    'preserved_customers',(select count(*) from public.customer_accounts),
    'preserved_profiles',(select count(*) from public.profiles),
    'retained_audit_logs',(select count(*) from public.audit_logs),
    'remaining_archive_rows',(select count(*) from private.qb_prepublication_cleanup_archive where run_id=p_run_id)
  );
  update private.qb_prepublication_cleanup_runs set
    after_snapshot=v_after, archived_rows=v_archived,
    stock_adjustments=v_adjustments, result=v_result, completed_at=now()
  where id=p_run_id;
  return v_result;
end;
$$;

revoke all on function private.qb_prepublication_cleanup_snapshot() from public, anon, authenticated, service_role;
revoke all on function private.execute_qb_prepublication_cleanup(uuid,uuid,text,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function private.qb_prepublication_cleanup_snapshot() to postgres, supabase_admin;
grant execute on function private.execute_qb_prepublication_cleanup(uuid,uuid,text,text,jsonb) to postgres, supabase_admin;

comment on table private.qb_prepublication_cleanup_archive is
  'Restricted archival snapshots for explicitly reviewed prepublication cleanup runs; never exposed to PostgREST.';

commit;
