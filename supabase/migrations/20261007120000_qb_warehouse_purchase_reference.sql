begin;

-- One warehouse purchase is one physical QB receipt line. Stock is posted only
-- through confirm_qb_merchandise_receipt, never by this reference-price field.
alter table public.qb_merchandise_receipt_lines
  add column if not exists reference_unit_id uuid references public.qb_units(id) on delete restrict,
  add column if not exists reference_price numeric(20, 8),
  add column if not exists reference_price_origin text,
  add column if not exists is_warehouse_purchase boolean not null default false,
  add column if not exists actual_base_quantity_recorded boolean not null default false;

alter table public.qb_merchandise_receipt_lines
  drop constraint if exists qb_purchase_reference_pair_check;
alter table public.qb_merchandise_receipt_lines
  add constraint qb_purchase_reference_pair_check check (
    (reference_price is null and reference_price_origin is null) or
    (reference_unit_id is not null and reference_price is not null
      and reference_price_origin in ('manual', 'calculated')
      and reference_price >= 0 and reference_price <= 999999
      and reference_price::text not in ('NaN', 'Infinity', '-Infinity'))
  );

create index if not exists qb_warehouse_purchase_reference_lookup_idx
  on public.qb_merchandise_receipt_lines(product_id, created_at desc)
  where is_warehouse_purchase = true;

comment on column public.qb_merchandise_receipt_lines.reference_price is
  'Useful reference cost per reference_unit_id, either manual or calculated from a configured conversion or measured quantity.';

create or replace function public.set_warehouse_purchase_actual_quantity(
  p_line_id uuid, p_actual_base_quantity numeric
) returns uuid language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_line public.qb_merchandise_receipt_lines%rowtype;
  v_role text;
  v_factor numeric(18, 9);
begin
  select role into v_role from public.profiles
  where id = auth.uid() and is_active = true;
  if v_role not in ('admin', 'administrador', 'inventario') then
    raise exception 'No tienes permisos para registrar cantidad física.';
  end if;
  if p_actual_base_quantity is null or p_actual_base_quantity <= 0
    or p_actual_base_quantity > 999999999
    or p_actual_base_quantity::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'Cantidad física inválida.';
  end if;
  select line.* into v_line
  from public.qb_merchandise_receipt_lines line
  join public.qb_merchandise_receipts receipt on receipt.id = line.receipt_id
  where line.id = p_line_id and line.is_warehouse_purchase = true
    and receipt.status = 'borrador'
  for update of line;
  if not found then raise exception 'Compra borrador no encontrada.'; end if;
  if exists (select 1 from public.qb_merchandise_receipt_classification_results
    where line_id = p_line_id) then
    raise exception 'Registra la cantidad física antes de clasificar.';
  end if;
  v_factor := round(p_actual_base_quantity / v_line.source_quantity, 9);
  if v_factor <= 0 then raise exception 'La cantidad física es demasiado pequeña.'; end if;
  update public.qb_conversion_snapshots
  set base_quantity = round(p_actual_base_quantity, 6),
      conversion_factor_to_base = v_factor,
      snapshot = snapshot || jsonb_build_object(
        'warehouse_purchase_actual_base_quantity', round(p_actual_base_quantity, 6),
        'measured_by', auth.uid(), 'measured_at', now())
  where id = v_line.conversion_snapshot_id
    and source_table = 'qb_merchandise_receipt_lines'
    and source_id = v_line.id;
  if not found then raise exception 'Snapshot de conversión no encontrado.'; end if;
  update public.qb_merchandise_receipt_lines
  set base_quantity = round(p_actual_base_quantity, 6),
      conversion_factor_to_base = v_factor,
      actual_base_quantity_recorded = true,
      updated_by = auth.uid()
  where id = p_line_id;
  -- A measured useful quantity is a safe denominator. Keep any manual override.
  update public.qb_merchandise_receipt_lines line
  set reference_price = round(
        line.total_cost / round(p_actual_base_quantity, 6) *
        reference_unit.conversion_factor_to_base /
        base_unit.conversion_factor_to_base, 8),
      reference_price_origin = 'calculated'
  from public.qb_units reference_unit, public.qb_units base_unit
  where line.id = p_line_id
    and line.reference_unit_id = reference_unit.id
    and line.base_unit_id = base_unit.id
    and reference_unit.dimension_id = base_unit.dimension_id
    and reference_unit.conversion_factor_to_base > 0
    and base_unit.conversion_factor_to_base > 0
    and line.reference_price_origin is distinct from 'manual';
  return p_line_id;
end;
$$;
revoke all on function public.set_warehouse_purchase_actual_quantity(uuid,numeric)
  from public, anon, authenticated;
grant execute on function public.set_warehouse_purchase_actual_quantity(uuid,numeric)
  to authenticated;

create or replace function public.require_measured_warehouse_purchase_before_stock()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if old.status = 'borrador' and new.status = 'confirmado'
    and exists (
      select 1 from public.qb_merchandise_receipt_lines line
      where line.receipt_id = new.id and line.is_warehouse_purchase = true
        and line.actual_base_quantity_recorded = false
    ) then
    raise exception 'Registra la cantidad física útil antes de confirmar esta compra.';
  end if;
  return new;
end;
$$;
drop trigger if exists zz_require_measured_warehouse_purchase_before_stock on public.qb_merchandise_receipts;
create trigger zz_require_measured_warehouse_purchase_before_stock
before update on public.qb_merchandise_receipts
for each row execute function public.require_measured_warehouse_purchase_before_stock();

alter table public.qb_receipt_lines
  add column if not exists warehouse_purchase_line_id uuid
    references public.qb_merchandise_receipt_lines(id) on delete set null;
alter table public.qb_receipt_lines
  alter column purchase_cost_reference_value type numeric(20, 8);

create or replace function public.snapshot_warehouse_purchase_cost_for_receipt_line()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_purchase record;
  v_reference_unit public.qb_units%rowtype;
  v_base_unit public.qb_units%rowtype;
  v_cost numeric(20, 8);
begin
  -- A new draft must never inherit the old Provisión precharge as its base cost.
  new.cost_base_unit_snapshot := null;
  new.cost_total_input_precise := null;
  new.cost_source := null;
  new.warehouse_purchase_line_id := null;
  new.purchase_cost_reference_unit_id := null;
  new.purchase_cost_reference_value := null;
  select * into v_base_unit from public.qb_units where id = new.base_unit_id;
  if v_base_unit.id is null or v_base_unit.conversion_factor_to_base <= 0 then
    return new;
  end if;
  for v_purchase in
    select line.id, line.reference_unit_id, line.reference_price,
      line.total_cost, line.base_quantity, line.base_unit_id,
      line.actual_base_quantity_recorded
    from public.qb_merchandise_receipt_lines line
    join public.qb_merchandise_receipts receipt on receipt.id = line.receipt_id
    where line.product_id = new.product_id
      and line.is_warehouse_purchase = true
      and receipt.status = 'confirmado'
      and receipt.confirmed_at <= now()
    order by receipt.confirmed_at desc, line.created_at desc, line.id desc
  loop
    v_cost := null;
    if v_purchase.reference_price is not null then
      select * into v_reference_unit from public.qb_units
      where id = v_purchase.reference_unit_id;
      if v_reference_unit.id is not null
        and v_reference_unit.dimension_id = v_base_unit.dimension_id
        and v_reference_unit.conversion_factor_to_base > 0 then
        v_cost := round(v_purchase.reference_price *
          v_base_unit.conversion_factor_to_base /
          v_reference_unit.conversion_factor_to_base, 8);
        new.purchase_cost_reference_unit_id := v_purchase.reference_unit_id;
        new.purchase_cost_reference_value := v_purchase.reference_price;
      end if;
    end if;
    if v_cost is null and v_purchase.actual_base_quantity_recorded
      and v_purchase.base_quantity > 0 then
      select * into v_reference_unit from public.qb_units
      where id = v_purchase.base_unit_id;
      if v_reference_unit.id is not null
        and v_reference_unit.dimension_id = v_base_unit.dimension_id
        and v_reference_unit.conversion_factor_to_base > 0 then
        v_cost := round(v_purchase.total_cost / v_purchase.base_quantity *
          v_base_unit.conversion_factor_to_base /
          v_reference_unit.conversion_factor_to_base, 8);
      end if;
    end if;
    if v_cost is not null then
      new.warehouse_purchase_line_id := v_purchase.id;
      new.cost_base_unit_snapshot := v_cost;
      new.cost_total_input_precise := round(new.delivered_base_quantity * v_cost, 8);
      new.cost_source := 'purchase_snapshot';
      exit;
    end if;
  end loop;
  return new;
end;
$$;

-- The old Provisión RPC still precharges draft costs. Once a purchase has been
-- snapshotted, it must not overwrite that cost or an explicit manual override.
create or replace function public.protect_warehouse_purchase_receipt_cost()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if new.cost_source = 'purchase_snapshot'
    and (old.warehouse_purchase_line_id is not null
      or old.cost_source is null or old.cost_source = 'manual')
    and (
      new.cost_base_unit_snapshot is distinct from old.cost_base_unit_snapshot
      or new.cost_total_input_precise is distinct from old.cost_total_input_precise
      or old.cost_source = 'manual'
    ) then
    new.cost_base_unit_snapshot := old.cost_base_unit_snapshot;
    new.cost_total_input_precise := old.cost_total_input_precise;
    new.cost_source := old.cost_source;
  end if;
  return new;
end;
$$;

drop trigger if exists zz_protect_warehouse_purchase_receipt_cost on public.qb_receipt_lines;
create trigger zz_protect_warehouse_purchase_receipt_cost
before update on public.qb_receipt_lines
for each row execute function public.protect_warehouse_purchase_receipt_cost();

drop trigger if exists zz_snapshot_warehouse_purchase_cost_on_receipt_line on public.qb_receipt_lines;
create trigger zz_snapshot_warehouse_purchase_cost_on_receipt_line
before insert on public.qb_receipt_lines
for each row execute function public.snapshot_warehouse_purchase_cost_for_receipt_line();

commit;
