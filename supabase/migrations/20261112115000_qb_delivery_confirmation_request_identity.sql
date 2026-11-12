begin;

create table if not exists private.qb_delivery_confirmation_requests (
  request_key text primary key,
  actor_id uuid not null,
  order_id uuid not null,
  expected_updated_at timestamptz not null,
  confirmed_id uuid
);
alter table private.qb_delivery_confirmation_requests enable row level security;
revoke all on private.qb_delivery_confirmation_requests from public, anon, authenticated;

create or replace function public.confirm_qb_matrix_delivery(
  p_order_id uuid, p_expected_updated_at timestamptz, p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  actor uuid := auth.uid();
  request_id text := trim(p_idempotency_key);
  saved private.qb_delivery_confirmation_requests%rowtype;
  confirmation_id uuid;
begin
  if actor is null or not coalesce(public.current_user_role() in ('admin','administrador','entregador'),false) then
    raise exception 'Solo administración o entrega puede confirmar la entrega.' using errcode='42501';
  end if;
  if p_order_id is null or p_expected_updated_at is null
    or request_id is null or length(request_id) not between 8 and 200 then
    raise exception 'QB_DELIVERY_REQUEST_INVALID' using errcode='22023';
  end if;

  insert into private.qb_delivery_confirmation_requests(request_key,actor_id,order_id,expected_updated_at)
  values(request_id,actor,p_order_id,p_expected_updated_at) on conflict do nothing;
  select * into strict saved from private.qb_delivery_confirmation_requests
  where request_key=request_id for update;
  if saved.actor_id is distinct from actor or saved.order_id is distinct from p_order_id
    or saved.expected_updated_at is distinct from p_expected_updated_at then
    raise exception 'QB_DELIVERY_IDEMPOTENCY_CONFLICT' using errcode='23505';
  end if;
  if saved.confirmed_id is not null then return saved.confirmed_id; end if;

  -- A legacy confirmation has no recorded expected version to validate a replay.
  if exists (select 1 from public.qb_order_delivery_confirmations c
      where c.idempotency_key=request_id) then
    raise exception 'QB_DELIVERY_LEGACY_REPLAY_REQUIRES_REFRESH' using errcode='23505';
  end if;
  confirmation_id := public.confirm_qb_matrix_delivery_v2(p_order_id,p_expected_updated_at,request_id);
  update private.qb_delivery_confirmation_requests set confirmed_id=confirmation_id where request_key=request_id;
  return confirmation_id;
end;
$$;

revoke all on function public.confirm_qb_matrix_delivery(uuid,timestamptz,text),
  public.confirm_qb_matrix_delivery_v2(uuid,timestamptz,text),
  public.confirm_qb_matrix_delivery_finalization_v1(uuid,timestamptz,text) from public, anon, authenticated;
grant execute on function public.confirm_qb_matrix_delivery(uuid,timestamptz,text) to authenticated;

commit;
