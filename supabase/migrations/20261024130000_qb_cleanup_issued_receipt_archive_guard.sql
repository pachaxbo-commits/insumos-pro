-- Keep issued receipt lines immutable for normal work while allowing the
-- separately authorized cleanup SECURITY DEFINER function to archive them.
begin;

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
    and current_user in ('postgres','supabase_admin')
    and v_cleanup_run ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1 from private.qb_prepublication_cleanup_runs run
      where run.id = v_cleanup_run::uuid and run.status = 'completed'
    ) then
    return old;
  end if;

  if exists (
    select 1 from public.qb_receipts receipt
    where receipt.id = v_receipt_id and receipt.status <> 'borrador'
  ) then
    raise exception 'Las lineas de un recibo emitido son inmutables.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.protect_qb_issued_receipt_lines()
  from public, anon, authenticated, service_role;

commit;
