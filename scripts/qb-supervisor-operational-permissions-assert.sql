-- Executed by the disposable postgres workflow after the actual migration.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);

do $$
declare v_count integer; v_amount numeric; v_denied boolean := false;
  v_receipt_id uuid; v_line_count integer; v_status text; v_payment_status text;
  v_sent_at timestamptz; v_unit_cost numeric; v_unit_price numeric; v_line_total numeric;
begin
  if public.current_user_role() <> 'supervisor' then raise exception 'Supervisor profile was not resolved'; end if;
  v_receipt_id := public.create_qb_receipt_line_draft(
    '10000000-0000-0000-0000-000000000001',
    array['20000000-0000-0000-0000-000000000001']::uuid[]);
  select count(*) into v_line_count from public.qb_supervisor_receipt_lines
    where receipt_id = v_receipt_id;
  if v_line_count <> 1 then raise exception 'Supervisor receipt RPC did not create its delivered line'; end if;
  if not exists (select 1 from public.qb_supervisor_receipt_lines
    where receipt_id = v_receipt_id and order_id='20000000-0000-0000-0000-000000000001'
      and delivered_base_quantity=2 and product_name_snapshot='Fixture Producto') then
    raise exception 'Supervisor receipt did not preserve delivery snapshot fields';
  end if;
  if not exists (select 1 from public.qb_supervisor_receipt_orders
    where receipt_id=v_receipt_id and order_id='20000000-0000-0000-0000-000000000001'
      and inclusion_status='borrador') then
    raise exception 'Supervisor receipt did not preserve receipt inclusion state';
  end if;
  select count(*), max(total_amount) into v_count, v_amount from public.qb_supervisor_receipts;
  if v_count <> 3 or v_amount <> 15 then raise exception 'Supervisor receipt customer projection mismatch'; end if;
  if exists (select 1 from information_schema.columns where table_schema='public'
    and table_name in ('qb_supervisor_receipts','qb_supervisor_receipt_lines')
    and column_name in ('cost_total_precise','profit_total_precise','profit_unit_precise',
      'cost_total_input_precise','purchase_cost_total','total_cost','profit_total',
      'profit_unit','margin_percent','margin','factor_total_percent',
      'distance_factor_percent','exigency_factor_percent','weather_factor_percent',
      'extraordinary_factor_percent','internal_notes')) then
    raise exception 'A restricted financial column leaked into the Supervisor projection';
  end if;
  if (select count(distinct column_name) from information_schema.columns where table_schema='public'
    and table_name='qb_supervisor_receipts' and column_name in
      ('subtotal_amount','total_amount','receipt_sent_at','payment_status')) <> 4
    or (select count(distinct column_name) from information_schema.columns where table_schema='public'
      and table_name='qb_supervisor_receipt_lines' and column_name in
        ('cost_base_unit_snapshot','final_unit_price','line_total')) <> 3 then
    raise exception 'The operational receipt projection omitted approved customer-document fields';
  end if;
  begin
    perform cost_total_precise from public.qb_receipts limit 1;
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied then raise exception 'Direct base receipt table SELECT must remain denied'; end if;
  if has_function_privilege('authenticated','public.recalculate_qb_receipt_totals(uuid)','EXECUTE') then
    raise exception 'Authenticated can directly execute the internal receipt calculator';
  end if;
  v_denied := false;
  begin
    perform public.update_qb_receipt_draft_legacy(
      '30000000-0000-0000-0000-000000000001',0,0,0,0,null,null,'[]'::jsonb);
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied then raise exception 'Supervisor can directly execute the legacy finance editor'; end if;

  perform public.create_qb_warehouse_purchase_draft(null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null);
  perform public.update_qb_warehouse_purchase_draft(null,null,null,null,null,null,null,null,null,null,null,null);
  perform public.confirm_qb_warehouse_purchase_draft(null);
  perform public.annul_qb_warehouse_purchase_draft(null,null);
  perform public.set_warehouse_purchase_actual_quantity(null,null);
  perform public.confirm_qb_merchandise_receipt('40000000-0000-0000-0000-000000000001');
  v_denied := false;
  begin
    perform public.create_qb_receipt_draft(null,null);
  exception when others then v_denied := true;
  end;
  if not v_denied then raise exception 'Supervisor received unused legacy receipt-draft RPC access'; end if;
  perform public.update_qb_receipt_draft_supervisor(
    '30000000-0000-0000-0000-000000000002','Updated fixture note','[]'::jsonb);
  perform public.set_qb_receipt_line_pricing(
    '30000000-0000-0000-0000-000000000001',
    '[{"line_id":"50000000-0000-0000-0000-000000000001","cost_base_unit":4,"cost_total":null,"distance_factor_percent":0,"exigency_factor_percent":0,"weather_factor_percent":0,"extraordinary_factor_percent":0}]'::jsonb);
  v_denied := false;
  begin
    perform public.set_qb_receipt_line_pricing(
      '30000000-0000-0000-0000-000000000001',
      '[{"line_id":"50000000-0000-0000-0000-000000000001","cost_base_unit":4,"cost_total":null,"distance_factor_percent":5,"exigency_factor_percent":0,"weather_factor_percent":0,"extraordinary_factor_percent":0}]'::jsonb);
  exception when others then
    if sqlerrm like '%QB_RECEIPT_SUPERVISOR_PRICING_CONFIG_FORBIDDEN%' then v_denied := true; end if;
  end;
  if not v_denied then raise exception 'Supervisor could alter receipt pricing factors directly'; end if;
  perform public.set_qb_receipt_supervisor_line_costs(
    '30000000-0000-0000-0000-000000000001',
    '[{"line_id":"50000000-0000-0000-0000-000000000001","cost_base_unit":4,"notes":"Fixture"}]'::jsonb);
  perform public.emit_qb_receipt('30000000-0000-0000-0000-000000000001');
  perform public.set_qb_receipt_manual_tracking('30000000-0000-0000-0000-000000000001',true,'pagado');
  select status, payment_status, receipt_sent_at, total_amount
    into v_status, v_payment_status, v_sent_at, v_amount
    from public.qb_supervisor_receipts where id='30000000-0000-0000-0000-000000000001';
  if v_status is distinct from 'emitido' or v_payment_status is distinct from 'pagado'
    or v_sent_at is null or v_amount is distinct from 15 then
    raise exception 'Supervisor cannot read the individual receipt commercial/status fields';
  end if;
  select cost_base_unit_snapshot, final_unit_price, line_total
    into v_unit_cost, v_unit_price, v_line_total
    from public.qb_supervisor_receipt_lines where id='50000000-0000-0000-0000-000000000001';
  if v_unit_cost is distinct from 4 or v_unit_price is distinct from 5
    or v_line_total is distinct from 15 then
    raise exception 'Supervisor cannot read approved unit cost and customer-facing line amounts';
  end if;
  perform public.void_qb_receipt('30000000-0000-0000-0000-000000000001','fixture');

  v_denied := false;
  begin
    perform public.update_qb_receipt_draft(
      '30000000-0000-0000-0000-000000000001',0,0,0,0,null,null,'[]'::jsonb);
  exception when others then v_denied := true;
  end;
  if not v_denied then raise exception 'Supervisor could call the administrative receipt editor'; end if;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
do $$ begin
  if public.current_user_role() <> 'inventario' then raise exception 'Inventory profile mismatch'; end if;
  if exists(select 1 from public.qb_supervisor_receipts) then
    raise exception 'Inventory unexpectedly received Supervisor receipt records';
  end if;
  begin
    perform public.create_qb_receipt_line_draft(
      '10000000-0000-0000-0000-000000000001',
      array['20000000-0000-0000-0000-000000000002']::uuid[]);
    raise exception 'Inventory was able to create a receipt';
  exception when raise_exception then
    if sqlerrm <> 'No tienes permisos para crear recibos QB.' then raise; end if;
  end;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
do $$ begin
  if public.current_user_role() <> 'entregador' then raise exception 'Deliverer profile mismatch'; end if;
  begin
    perform public.create_qb_receipt_line_draft(
      '10000000-0000-0000-0000-000000000001',
      array['20000000-0000-0000-0000-000000000002']::uuid[]);
    raise exception 'Deliverer was able to create a receipt';
  exception when raise_exception then
    if sqlerrm <> 'No tienes permisos para crear recibos QB.' then raise; end if;
  end;
end $$;

reset role;
-- Verify private base-table state as the database owner. The Supervisor must
-- not be granted direct SELECT on qb_receipt_lines just for this assertion.
do $$ begin
  if not exists (select 1 from public.qb_receipt_lines
    where id='50000000-0000-0000-0000-000000000001'
      and cost_base_unit_snapshot=4 and distance_factor_percent=0
      and exigency_factor_percent=0 and weather_factor_percent=0
      and extraordinary_factor_percent=0) then
    raise exception 'Supervisor unit-cost update failed or changed private factors';
  end if;
  if not exists (select 1 from public.qb_orders
    where id='20000000-0000-0000-0000-000000000001'
      and status='incluido_en_recibo_borrador') then
    raise exception 'Receipt creation did not transition the delivered order into its draft receipt state';
  end if;
  if not exists (select 1 from public.qb_order_delivery_movements
    where order_id='20000000-0000-0000-0000-000000000001'
      and preparation_item_id='22000000-0000-0000-0000-000000000001'
      and delivered_base_quantity=2) then
    raise exception 'Receipt creation changed or removed its source delivery movement';
  end if;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $$ declare v_receipt_id uuid; v_count integer; begin
  if public.current_user_role() <> 'administrador' then raise exception 'Admin profile mismatch'; end if;
  if not has_function_privilege('authenticated','public.update_qb_receipt_draft(uuid,numeric,numeric,numeric,numeric,text,text,jsonb)','EXECUTE') then
    raise exception 'Authenticated receipt RPC grant was lost';
  end if;
  perform public.update_qb_receipt_draft(
    '30000000-0000-0000-0000-000000000002',0,0,0,0,'Admin note','Admin private note','[]'::jsonb);
  v_receipt_id := public.create_qb_receipt_line_draft(
    '10000000-0000-0000-0000-000000000001',
    array['20000000-0000-0000-0000-000000000002']::uuid[]);
  select count(*) into v_count from public.qb_receipt_lines where receipt_id=v_receipt_id;
  if v_count <> 1 then raise exception 'Admin receipt-line RPC behavior regressed'; end if;
end $$;
