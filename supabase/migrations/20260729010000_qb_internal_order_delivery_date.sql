-- Fecha de entrega explícita para pedidos internos.
-- Conserva la RPC canónica y sincroniza la fecha con la matriz operativa.

begin;

create or replace function public.create_qb17_internal_catalog_order_with_date(
  p_order_mode text,
  p_customer_account_id uuid,
  p_customer_location_id uuid,
  p_business_name text,
  p_full_name text,
  p_phone text,
  p_email text,
  p_address text,
  p_location_label text,
  p_location_reference text,
  p_customer_notes text,
  p_operational_date date,
  p_items jsonb,
  p_idempotency_key text
)
returns table (created_order_id uuid, order_reference text, result_code text)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_result record;
  v_current_date date := (now() at time zone 'America/La_Paz')::date;
  v_previous_date date;
  v_position integer;
begin
  if p_operational_date is null or p_operational_date < v_current_date then
    return query select null::uuid, null::text, 'invalid_operational_date'::text;
    return;
  end if;

  select *
  into v_result
  from public.create_qb17_internal_catalog_order(
    p_order_mode,
    p_customer_account_id,
    p_customer_location_id,
    p_business_name,
    p_full_name,
    p_phone,
    p_email,
    p_address,
    p_location_label,
    p_location_reference,
    p_customer_notes,
    p_items,
    p_idempotency_key
  );

  if v_result.result_code = 'created' then
    perform pg_advisory_xact_lock(
      hashtextextended('qb-operational-date-assignment', 0)
    );

    select orders.operational_date
    into v_previous_date
    from public.qb_orders orders
    where orders.id = v_result.created_order_id
    for update;

    if v_previous_date is distinct from p_operational_date then
      select coalesce(max(day_order.position), 0) + 1
      into v_position
      from public.qb_operational_day_orders day_order
      where day_order.operational_date = p_operational_date;

      update public.qb_operational_day_orders day_order
      set operational_date = p_operational_date,
          position = v_position,
          updated_at = now()
      where day_order.order_id = v_result.created_order_id;

      update public.qb_orders orders
      set operational_date = p_operational_date
      where orders.id = v_result.created_order_id;
    end if;
  end if;

  return query
  select
    v_result.created_order_id,
    v_result.order_reference,
    v_result.result_code;
end;
$$;

revoke all on function public.create_qb17_internal_catalog_order_with_date(
  text, uuid, uuid, text, text, text, text, text, text, text, text, date, jsonb, text
) from public, anon, authenticated;

grant execute on function public.create_qb17_internal_catalog_order_with_date(
  text, uuid, uuid, text, text, text, text, text, text, text, text, date, jsonb, text
) to authenticated;

comment on function public.create_qb17_internal_catalog_order_with_date(
  text, uuid, uuid, text, text, text, text, text, text, text, text, date, jsonb, text
) is
  'Crea un pedido interno y lo asigna atómicamente a la fecha de entrega elegida en la matriz operativa.';

commit;
