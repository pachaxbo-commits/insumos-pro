begin;

create table if not exists public.qb_warehouse_operating_expenses (
  id uuid primary key default gen_random_uuid(),
  client_key uuid not null unique,
  expense_date date not null,
  concept text not null check (length(btrim(concept)) between 1 and 180),
  amount numeric(14, 2) not null check (amount > 0),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists qb_warehouse_operating_expenses_date_idx
  on public.qb_warehouse_operating_expenses (expense_date, created_at, id)
  where deleted_at is null;

alter table public.qb_warehouse_operating_expenses enable row level security;
revoke all on public.qb_warehouse_operating_expenses from public, anon;
grant select on public.qb_warehouse_operating_expenses to authenticated;

drop policy if exists "Authorized roles can view warehouse operating expenses"
  on public.qb_warehouse_operating_expenses;
create policy "Authorized roles can view warehouse operating expenses"
  on public.qb_warehouse_operating_expenses for select to authenticated
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'));

create or replace function public.save_qb_warehouse_operating_expenses(
  p_expense_date date,
  p_rows jsonb,
  p_deleted_ids uuid[] default '{}'
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := public.current_user_role();
  v_row jsonb;
  v_client_key uuid;
  v_expense_id uuid;
  v_concept text;
  v_amount numeric(14, 2);
  v_existing public.qb_warehouse_operating_expenses%rowtype;
  v_saved integer := 0;
  v_id uuid;
begin
  if v_user_id is null then raise exception 'QB_EXPENSE_AUTH_REQUIRED'; end if;
  if v_role not in ('admin', 'administrador', 'inventario') then
    raise exception 'QB_EXPENSE_ROLE_REQUIRED';
  end if;
  if p_expense_date is null or jsonb_typeof(p_rows) <> 'array' or p_deleted_ids is null then
    raise exception 'QB_EXPENSE_INVALID_PAYLOAD';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_client_key := (v_row->>'clientKey')::uuid;
    v_concept := btrim(coalesce(v_row->>'concept', ''));
    v_amount := (v_row->>'amount')::numeric(14, 2);
    if v_client_key is null or length(v_concept) not between 1 and 180
      or v_amount is null or v_amount <= 0 then
      raise exception 'QB_EXPENSE_INVALID_ROW';
    end if;

    select * into v_existing from public.qb_warehouse_operating_expenses
      where client_key = v_client_key for update;
    if found then
      if v_existing.expense_date <> p_expense_date or v_existing.deleted_at is not null then
        raise exception 'QB_EXPENSE_ROW_CONFLICT';
      end if;
      if v_existing.concept is distinct from v_concept or v_existing.amount is distinct from v_amount then
        update public.qb_warehouse_operating_expenses
        set concept = v_concept, amount = v_amount, updated_by = v_user_id, updated_at = now()
        where id = v_existing.id;
        insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
        values (v_user_id, 'update_qb_warehouse_operating_expense', 'qb_warehouse_operating_expense', v_existing.id,
          jsonb_build_object('expense_date', p_expense_date, 'previous_concept', v_existing.concept,
            'previous_amount', v_existing.amount, 'concept', v_concept, 'amount', v_amount));
        v_saved := v_saved + 1;
      end if;
    else
      insert into public.qb_warehouse_operating_expenses
        (client_key, expense_date, concept, amount, created_by, updated_by)
      values (v_client_key, p_expense_date, v_concept, v_amount, v_user_id, v_user_id)
      on conflict (client_key) do nothing returning id into v_expense_id;
      if v_expense_id is null then raise exception 'QB_EXPENSE_ROW_CONFLICT'; end if;
      insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
      values (v_user_id, 'create_qb_warehouse_operating_expense', 'qb_warehouse_operating_expense', v_expense_id,
        jsonb_build_object('expense_date', p_expense_date, 'concept', v_concept, 'amount', v_amount));
      v_saved := v_saved + 1;
    end if;
  end loop;

  foreach v_id in array p_deleted_ids
  loop
    select * into v_existing from public.qb_warehouse_operating_expenses
      where id = v_id and expense_date = p_expense_date for update;
    if found and v_existing.deleted_at is null then
      update public.qb_warehouse_operating_expenses
      set deleted_at = now(), deleted_by = v_user_id, updated_by = v_user_id, updated_at = now()
      where id = v_id;
      insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
      values (v_user_id, 'void_qb_warehouse_operating_expense', 'qb_warehouse_operating_expense', v_id,
        jsonb_build_object('expense_date', p_expense_date, 'concept', v_existing.concept, 'amount', v_existing.amount));
      v_saved := v_saved + 1;
    end if;
  end loop;
  return v_saved;
end;
$$;

revoke all on function public.save_qb_warehouse_operating_expenses(date, jsonb, uuid[]) from public, anon;
grant execute on function public.save_qb_warehouse_operating_expenses(date, jsonb, uuid[]) to authenticated;

comment on table public.qb_warehouse_operating_expenses is
  'Manual non-inventory operating expenses per warehouse purchase date; never creates inventory movements or receipt costs.';

commit;
