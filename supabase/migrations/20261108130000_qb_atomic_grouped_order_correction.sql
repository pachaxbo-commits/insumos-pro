-- Correcciones agrupadas de solicitado: ejecuta cada línea en una sola
-- transacción y hace idempotente el reintento del lote completo.
begin;

create table if not exists public.qb_order_grouped_correction_requests (
  idempotency_key text primary key,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  request_payload jsonb not null,
  response_payload jsonb,
  created_at timestamptz not null default now(),
  constraint qb_order_grouped_correction_key_check
    check (length(trim(idempotency_key)) between 8 and 200),
  constraint qb_order_grouped_correction_payload_check
    check (jsonb_typeof(request_payload) = 'object')
);

alter table public.qb_order_grouped_correction_requests enable row level security;
revoke all on public.qb_order_grouped_correction_requests from public, anon, authenticated;

create or replace function public.admin_update_qb_requested_quantities(
  p_changes jsonb,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_request jsonb := jsonb_build_object(
    'changes', p_changes,
    'reason', trim(coalesce(p_reason, ''))
  );
  v_saved public.qb_order_grouped_correction_requests%rowtype;
  v_change record;
  v_item_id uuid;
  v_expected_version integer;
  v_requested_quantity numeric;
  v_line_result jsonb;
  v_results jsonb := '[]'::jsonb;
begin
  select profile.role into v_role
  from public.profiles profile
  where profile.id = v_user_id and profile.is_active = true;

  if v_user_id is null or v_role not in ('admin', 'administrador') then
    raise exception 'Solo administracion puede corregir lo solicitado.';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception 'La clave de idempotencia no es valida.';
  end if;
  if p_reason is null or length(trim(p_reason)) not between 3 and 500 then
    raise exception 'Indica un motivo de 3 a 500 caracteres.';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'array'
    or jsonb_array_length(p_changes) not between 1 and 30 then
    raise exception 'El lote debe contener entre 1 y 30 lineas.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_changes) change(value)
    group by change.value ->> 'orderItemId'
    having count(*) > 1
  ) then
    raise exception 'El lote contiene lineas repetidas.';
  end if;

  insert into public.qb_order_grouped_correction_requests (
    idempotency_key, actor_id, request_payload
  ) values (trim(p_idempotency_key), v_user_id, v_request)
  on conflict (idempotency_key) do nothing;

  select * into v_saved
  from public.qb_order_grouped_correction_requests request
  where request.idempotency_key = trim(p_idempotency_key)
  for update;

  if v_saved.actor_id <> v_user_id or v_saved.request_payload <> v_request then
    raise exception 'QB_MATRIX_IDEMPOTENCY_CONFLICT';
  end if;
  if v_saved.response_payload is not null then
    return v_saved.response_payload || jsonb_build_object('replayed', true);
  end if;

  -- Bloquea el conjunto completo de líneas antes de invocar la RPC heredada,
  -- que toma locks por línea y pedido. Esto evita commits parciales y mantiene
  -- un orden de locks estable para lotes concurrentes.
  perform item.id
  from public.qb_order_items item
  where item.id in (
    select (change.value ->> 'orderItemId')::uuid
    from jsonb_array_elements(p_changes) change(value)
  )
  order by item.id
  for update;

  for v_change in
    select change.value
    from jsonb_array_elements(p_changes) change(value)
    order by (change.value ->> 'orderItemId')::uuid
  loop
    begin
      v_item_id := (v_change.value ->> 'orderItemId')::uuid;
      v_expected_version := (v_change.value ->> 'expectedVersion')::integer;
      v_requested_quantity := (v_change.value ->> 'requestedQuantity')::numeric;
    exception when others then
      raise exception 'Una linea del lote tiene identificadores o cantidades invalidos.';
    end;
    if v_requested_quantity is null or v_requested_quantity <= 0 then
      raise exception 'Cada cantidad corregida debe ser mayor a cero.';
    end if;

    v_line_result := public.admin_update_qb_requested_quantity(
      v_item_id,
      v_expected_version,
      v_requested_quantity,
      trim(p_reason),
      trim(p_idempotency_key) || ':' || v_item_id::text
    );
    v_results := v_results || jsonb_build_array(v_line_result);
  end loop;

  update public.qb_order_grouped_correction_requests request
  set response_payload = jsonb_build_object('results', v_results, 'replayed', false)
  where request.idempotency_key = trim(p_idempotency_key);

  return jsonb_build_object('results', v_results, 'replayed', false);
end;
$$;

revoke all on function public.admin_update_qb_requested_quantities(jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_update_qb_requested_quantities(jsonb, text, text)
  to authenticated;

commit;
