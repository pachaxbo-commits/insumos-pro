-- Run only against isolated local Supabase/PostgreSQL. Every write rolls back.
begin;

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-00000000a101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'warehouse-expense-admin@example.invalid'),
  ('00000000-0000-4000-8000-00000000a102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'warehouse-expense-viewer@example.invalid');
insert into public.profiles (id, role, is_active)
values
  ('00000000-0000-4000-8000-00000000a101', 'administrador', true),
  ('00000000-0000-4000-8000-00000000a102', 'ventas', true);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-00000000a101';
select public.save_qb_warehouse_operating_expenses(
  current_date,
  '[{"clientKey":"10000000-0000-4000-8000-00000000a101","concept":"Carretilla","amount":7.00},{"clientKey":"10000000-0000-4000-8000-00000000a102","concept":"Refrigerio","amount":15.00}]'::jsonb,
  '{}'
);
select public.save_qb_warehouse_operating_expenses(
  current_date,
  '[{"clientKey":"10000000-0000-4000-8000-00000000a101","concept":"Carretilla","amount":7.00},{"clientKey":"10000000-0000-4000-8000-00000000a102","concept":"Refrigerio","amount":15.00}]'::jsonb,
  '{}'
);

reset role;
do $$ begin
  if (select count(*) from public.qb_warehouse_operating_expenses where deleted_at is null) <> 2 then
    raise exception 'Expense save retry duplicated rows.';
  end if;
  if (select count(*) from public.audit_logs where entity_type = 'qb_warehouse_operating_expense' and action like 'create_%') <> 2 then
    raise exception 'Expense creates were not audited exactly once.';
  end if;
end $$;

set local role authenticated;
select public.save_qb_warehouse_operating_expenses(
  current_date,
  '[{"clientKey":"10000000-0000-4000-8000-00000000a101","concept":"Carretilla corregida","amount":8.50},{"clientKey":"10000000-0000-4000-8000-00000000a102","concept":"Refrigerio","amount":15.00}]'::jsonb,
  '{}'
);
select public.save_qb_warehouse_operating_expenses(
  current_date,
  '[]'::jsonb,
  array[(select id from public.qb_warehouse_operating_expenses where client_key = '10000000-0000-4000-8000-00000000a102')]
);
reset role;

do $$ begin
  if (select amount from public.qb_warehouse_operating_expenses where client_key = '10000000-0000-4000-8000-00000000a101') <> 8.50 then
    raise exception 'Manual expense correction was not persisted.';
  end if;
  if (select count(*) from public.audit_logs where entity_type = 'qb_warehouse_operating_expense' and action like 'update_%') <> 1 then
    raise exception 'Expense correction was not audited.';
  end if;
  if (select count(*) from public.qb_warehouse_operating_expenses where deleted_at is null) <> 1
    or (select count(*) from public.qb_warehouse_operating_expenses where deleted_at is not null) <> 1 then
    raise exception 'Expense removal did not preserve history.';
  end if;
  if (select count(*) from public.audit_logs where entity_type = 'qb_warehouse_operating_expense' and action like 'void_%') <> 1 then
    raise exception 'Expense removal was not audited.';
  end if;
end $$;

set local role authenticated;
do $$ begin
  begin
    perform public.save_qb_warehouse_operating_expenses(
      current_date,
      '[{"clientKey":"10000000-0000-4000-8000-00000000a103","concept":"Should roll back","amount":1},{"clientKey":"10000000-0000-4000-8000-00000000a104","concept":"Invalid","amount":0}]'::jsonb,
      '{}'
    );
    raise exception 'Invalid expense was accepted.';
  exception when others then
    if sqlerrm = 'Invalid expense was accepted.' then raise; end if;
  end;
end $$;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-00000000a102';
do $$ begin
  begin
    perform public.save_qb_warehouse_operating_expenses(current_date, '[]'::jsonb, '{}');
    raise exception 'Unauthorized role was accepted.';
  exception when others then
    if sqlerrm = 'Unauthorized role was accepted.' then raise; end if;
    if sqlerrm not like '%QB_EXPENSE_ROLE_REQUIRED%' then raise; end if;
  end;
end $$;
reset role;

do $$ begin
  if exists (select 1 from public.qb_warehouse_operating_expenses where client_key = '10000000-0000-4000-8000-00000000a103') then
    raise exception 'Invalid bulk save committed a partial row.';
  end if;
end $$;

rollback;
