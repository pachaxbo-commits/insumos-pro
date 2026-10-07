begin;

-- One warehouse purchase is one physical QB receipt line. Stock is posted only
-- through confirm_qb_merchandise_receipt, never by this reference-price field.
alter table public.qb_merchandise_receipt_lines
  add column if not exists reference_unit_id uuid references public.qb_units(id) on delete restrict,
  add column if not exists reference_price numeric(20, 8),
  add column if not exists actual_base_quantity_recorded boolean not null default false;

alter table public.qb_merchandise_receipt_lines
  drop constraint if exists qb_purchase_reference_pair_check;
alter table public.qb_merchandise_receipt_lines
  add constraint qb_purchase_reference_pair_check check (
    (reference_unit_id is null and reference_price is null) or
    (reference_unit_id is not null and reference_price is not null
      and reference_price >= 0 and reference_price <= 999999
      and reference_price::text not in ('NaN', 'Infinity', '-Infinity'))
  );

create index if not exists qb_warehouse_purchase_reference_lookup_idx
  on public.qb_merchandise_receipt_lines(product_id, created_at desc)
  where reference_price is not null;

comment on column public.qb_merchandise_receipt_lines.reference_price is
  'Manual useful reference cost per reference_unit_id; never derived from purchase quantity, carga, or nominal presentation factors.';

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
  where line.id = p_line_id and line.reference_price is not null
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
      where line.receipt_id = new.id and line.reference_price is not null
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
  select line.id, line.reference_unit_id, line.reference_price
    into v_purchase
  from public.qb_merchandise_receipt_lines line
  join public.qb_merchandise_receipts receipt on receipt.id = line.receipt_id
  where line.product_id = new.product_id
    and line.reference_price is not null
    and receipt.status = 'confirmado'
    and receipt.confirmed_at <= now()
  order by receipt.confirmed_at desc, line.created_at desc, line.id desc
  limit 1;

  if not found then return new; end if;
  new.warehouse_purchase_line_id := v_purchase.id;
  new.purchase_cost_reference_unit_id := v_purchase.reference_unit_id;
  new.purchase_cost_reference_value := v_purchase.reference_price;

  select * into v_reference_unit from public.qb_units where id = v_purchase.reference_unit_id;
  select * into v_base_unit from public.qb_units where id = new.base_unit_id;

  -- No conversion through nominal purchase presentations such as CARGA.
  if v_reference_unit.id is null or v_base_unit.id is null
    or v_reference_unit.dimension_id <> v_base_unit.dimension_id
    or v_reference_unit.conversion_factor_to_base <= 0
    or v_base_unit.conversion_factor_to_base <= 0 then
    new.cost_base_unit_snapshot := null;
    new.cost_total_input_precise := null;
    new.cost_source := null;
    return new;
  end if;

  v_cost := round(v_purchase.reference_price *
    v_base_unit.conversion_factor_to_base /
    v_reference_unit.conversion_factor_to_base, 8);
  new.cost_base_unit_snapshot := v_cost;
  new.cost_total_input_precise := round(new.delivered_base_quantity * v_cost, 8);
  new.cost_source := 'purchase_snapshot';
  return new;
end;
$$;

-- The old Provisión RPC still precharges draft costs. Once a purchase has been
-- snapshotted, it must not overwrite that cost or an explicit manual override.
create or replace function public.protect_warehouse_purchase_receipt_cost()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if old.warehouse_purchase_line_id is not null
    and new.cost_source = 'purchase_snapshot'
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
