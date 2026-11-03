-- Executed by the disposable postgres workflow after the actual migration.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);

do $$
declare v_count integer; v_amount numeric; v_denied boolean := false;
begin
  if public.current_user_role() <> 'supervisor' then raise exception 'Supervisor profile was not resolved'; end if;
  select count(*), max(total_amount) into v_count, v_amount from public.qb_supervisor_receipts;
  if v_count <> 2 or v_amount <> 15 then raise exception 'Supervisor receipt customer projection mismatch'; end if;
  if exists (select 1 from information_schema.columns where table_schema='public'
    and table_name in ('qb_supervisor_receipts','qb_supervisor_receipt_lines')
    and column_name in ('cost_total_precise','profit_total_precise','profit_unit_precise',
      'factor_total_percent','distance_factor_percent','internal_notes')) then
    raise exception 'A restricted financial column leaked into the Supervisor projection';
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
  perform public.create_qb_receipt_draft(null,null);
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
  perform public.void_qb_receipt('30000000-0000-0000-0000-000000000001','fixture');
  perform public.set_qb_receipt_manual_tracking('30000000-0000-0000-0000-000000000001',false,'pendiente');

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
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $$ begin
  if public.current_user_role() <> 'administrador' then raise exception 'Admin profile mismatch'; end if;
  if not has_function_privilege('authenticated','public.update_qb_receipt_draft(uuid,numeric,numeric,numeric,numeric,text,text,jsonb)','EXECUTE') then
    raise exception 'Authenticated receipt RPC grant was lost';
  end if;
  perform public.update_qb_receipt_draft(
    '30000000-0000-0000-0000-000000000002',0,0,0,0,'Admin note','Admin private note','[]'::jsonb);
end $$;
