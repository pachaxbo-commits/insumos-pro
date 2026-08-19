begin;

alter table public.qb_receipt_lines
  add column if not exists purchase_cost_total numeric(14,2),
  add column if not exists purchase_cost_reference_unit_id uuid
    references public.qb_units(id) on delete restrict,
  add column if not exists purchase_cost_reference_value numeric(14,4);

alter table public.qb_receipt_lines
  drop constraint if exists qb_receipt_lines_purchase_cost_check;
alter table public.qb_receipt_lines
  add constraint qb_receipt_lines_purchase_cost_check check (
    (purchase_cost_total is null or purchase_cost_total >= 0)
    and (purchase_cost_reference_value is null or purchase_cost_reference_value >= 0)
    and (
      (purchase_cost_reference_unit_id is null and purchase_cost_reference_value is null)
      or
      (purchase_cost_reference_unit_id is not null and purchase_cost_reference_value is not null)
    )
  );

comment on column public.qb_receipt_lines.purchase_cost_total is
  'Costo total real de compra de la linea, ingresado manualmente por administracion.';
comment on column public.qb_receipt_lines.purchase_cost_reference_unit_id is
  'Unidad de comparacion elegida manualmente (por ejemplo arroba, cuartilla o libra).';
comment on column public.qb_receipt_lines.purchase_cost_reference_value is
  'Costo de compra comparativo por la unidad elegida. No usa conversion automatica porque refleja el peso real recibido.';

alter table public.qb_receipt_events
  drop constraint if exists qb_receipt_events_type_check;
alter table public.qb_receipt_events
  add constraint qb_receipt_events_type_check
  check (event_type in (
    'creado', 'lineas_editadas', 'precio_base_actualizado', 'emitido',
    'anulado', 'reemplazado', 'control_actualizado',
    'costos_compra_actualizados'
  ));

create or replace function public.set_qb_receipt_purchase_costs(
  p_receipt_id uuid,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_receipt_status text;
  v_line jsonb;
  v_line_id uuid;
  v_total numeric;
  v_reference_unit_id uuid;
  v_reference_value numeric;
  v_updated_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'QB_PURCHASE_COST_AUTH_REQUIRED';
  end if;

  v_role := public.current_user_role();
  if v_role not in ('admin', 'administrador') then
    raise exception 'QB_PURCHASE_COST_ADMIN_REQUIRED';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'QB_PURCHASE_COST_LINES_INVALID';
  end if;

  select receipt.status into v_receipt_status
  from public.qb_receipts receipt
  where receipt.id = p_receipt_id
  for update;

  if not found then
    raise exception 'QB_PURCHASE_COST_RECEIPT_NOT_FOUND';
  end if;
  if v_receipt_status <> 'borrador' then
    raise exception 'QB_PURCHASE_COST_REQUIRES_DRAFT';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    begin
      v_line_id := (v_line ->> 'line_id')::uuid;
      v_total := nullif(trim(v_line ->> 'purchase_cost_total'), '')::numeric;
      v_reference_unit_id := nullif(trim(v_line ->> 'reference_unit_id'), '')::uuid;
      v_reference_value := nullif(trim(v_line ->> 'reference_value'), '')::numeric;
    exception when others then
      raise exception 'QB_PURCHASE_COST_LINE_INVALID';
    end;

    if v_total is not null and (v_total < 0 or v_total > 999999999999.99) then
      raise exception 'QB_PURCHASE_COST_TOTAL_INVALID';
    end if;
    if v_reference_value is not null
       and (v_reference_value < 0 or v_reference_value > 9999999999.9999) then
      raise exception 'QB_PURCHASE_COST_REFERENCE_INVALID';
    end if;
    if (v_reference_unit_id is null) <> (v_reference_value is null) then
      raise exception 'QB_PURCHASE_COST_REFERENCE_INCOMPLETE';
    end if;
    if v_reference_unit_id is not null and not exists (
      select 1
      from public.qb_units unit
      join public.qb_unit_dimensions dimension
        on dimension.id = unit.dimension_id
      where unit.id = v_reference_unit_id
        and unit.is_active = true
        and dimension.is_active = true
        and dimension.code = 'peso'
    ) then
      raise exception 'QB_PURCHASE_COST_UNIT_INVALID';
    end if;

    update public.qb_receipt_lines line
    set purchase_cost_total = v_total,
        purchase_cost_reference_unit_id = v_reference_unit_id,
        purchase_cost_reference_value = v_reference_value
    where line.id = v_line_id
      and line.receipt_id = p_receipt_id;

    if not found then
      raise exception 'QB_PURCHASE_COST_LINE_NOT_FOUND';
    end if;
    v_updated_count := v_updated_count + 1;
  end loop;

  insert into public.qb_receipt_events (
    receipt_id, event_type, metadata, created_by
  ) values (
    p_receipt_id,
    'costos_compra_actualizados',
    jsonb_build_object('line_count', v_updated_count),
    v_user_id
  );

  return p_receipt_id;
end;
$$;

revoke all on function public.set_qb_receipt_purchase_costs(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.set_qb_receipt_purchase_costs(uuid, jsonb)
  to authenticated;

comment on function public.set_qb_receipt_purchase_costs(uuid, jsonb) is
  'Guarda costos reales y comparaciones manuales en un recibo borrador; no modifica pedidos, entregas, precios de venta ni inventario.';

commit;
