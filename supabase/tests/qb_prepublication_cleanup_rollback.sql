-- Full transaction test for the prepublication cleanup.
-- Every deletion, archive row, and stock adjustment is rolled back at the end.
begin;

do $$
declare
  v_actor uuid;
  v_run_id uuid := extensions.gen_random_uuid();
  v_snapshot jsonb;
  v_first jsonb;
  v_retry jsonb;
  v_products bigint;
  v_customers bigint;
  v_profiles bigint;
  v_archive_rows bigint;
  v_stock_adjustments bigint;
begin
  select id into v_actor from public.profiles
  where is_active and role in ('admin','administrador') order by id limit 1;
  if v_actor is null then raise exception 'QB_PREPUBLICATION_TEST_ACTIVE_ADMIN_REQUIRED'; end if;
  select count(*) into v_products from public.products;
  select count(*) into v_customers from public.customer_accounts;
  select count(*) into v_profiles from public.profiles;
  v_snapshot := private.qb_prepublication_cleanup_snapshot();
  v_first := private.execute_qb_prepublication_cleanup(
    v_run_id,v_actor,'Transacción de prueba aislada de limpieza','ARCHIVAR OPERACIONES FICTICIAS',v_snapshot
  );
  if v_first->>'status' <> 'completed' then raise exception 'QB_PREPUBLICATION_TEST_CLEANUP_FAILED'; end if;
  select count(*) into v_archive_rows from private.qb_prepublication_cleanup_archive where run_id=v_run_id;
  if v_archive_rows <> (v_first->>'remaining_archive_rows')::bigint or v_archive_rows=0 then
    raise exception 'QB_PREPUBLICATION_TEST_ARCHIVE_INCOMPLETE';
  end if;
  if (select count(*) from public.products) <> v_products
    or (select count(*) from public.customer_accounts) <> v_customers
    or (select count(*) from public.profiles) <> v_profiles
    or exists(select 1 from public.products where stock_current<>0)
    or exists(select 1 from public.inventory_lots)
    or exists(select 1 from public.inventory_lot_consumptions)
    or exists(select 1 from public.qb_orders)
    or exists(select 1 from public.qb_merchandise_receipts)
    or exists(select 1 from public.qb_receipts)
    or exists(select 1 from public.qb_warehouse_operating_expenses) then
    raise exception 'QB_PREPUBLICATION_TEST_POSTCONDITION_FAILED';
  end if;
  select count(*) into v_stock_adjustments from public.inventory_movements;
  if v_stock_adjustments <> jsonb_array_length(v_first->'stock_adjustments') then
    raise exception 'QB_PREPUBLICATION_TEST_STOCK_LEDGER_FAILED';
  end if;
  v_retry := private.execute_qb_prepublication_cleanup(
    v_run_id,v_actor,'Transacción de prueba aislada de limpieza','ARCHIVAR OPERACIONES FICTICIAS',v_snapshot
  );
  if v_retry->>'status' <> 'already_completed'
    or (select count(*) from public.inventory_movements) <> v_stock_adjustments
    or (select count(*) from private.qb_prepublication_cleanup_archive where run_id=v_run_id) <> v_archive_rows then
    raise exception 'QB_PREPUBLICATION_TEST_IDEMPOTENCY_FAILED';
  end if;
end;
$$;

rollback;
