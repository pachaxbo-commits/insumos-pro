begin;

-- Single-transaction create path for the warehouse worksheet. In particular,
-- an unmeasured commercial label (e.g. CARGA) persists with zero conversion.
create or replace function public.create_qb_warehouse_purchase_draft(
  p_receipt_date date,
  p_product_id uuid,
  p_allowed_unit_id uuid,
  p_source_kind text,
  p_source_unit_id uuid,
  p_product_presentation_id uuid,
  p_source_label text,
  p_source_quantity numeric,
  p_base_unit_id uuid,
  p_base_unit_symbol text,
  p_base_quantity numeric,
  p_conversion_factor numeric,
  p_unit_cost numeric,
  p_total_cost numeric,
  p_reference_unit_id uuid,
  p_reference_price numeric,
  p_reference_price_origin text,
  p_notes text,
  p_dimension_code text,
  p_snapshot jsonb
) returns uuid
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_product_is_active boolean;
  v_base_unit public.qb_units%rowtype;
  v_source_unit public.qb_units%rowtype;
  v_presentation public.qb_product_presentations%rowtype;
  v_allowed public.qb_product_allowed_units%rowtype;
  v_reference_unit public.qb_units%rowtype;
  v_factor numeric(18, 9);
  v_receipt_id uuid;
  v_line_id uuid;
  v_snapshot_id uuid;
  v_kind text;
  v_label text;
  v_base_quantity numeric(18, 6);
  v_expected_base_unit_id uuid;
  v_dimension_code text;
begin
  if v_user is null then raise exception 'Inicia sesión para guardar la compra.'; end if;
  select role into v_role from public.profiles where id = v_user and is_active = true;
  if v_role is null or v_role not in ('admin','administrador','inventario') then raise exception 'No tienes permisos para guardar compras.'; end if;
  if p_receipt_date is null or p_source_quantity is null or p_source_quantity <= 0
    or p_source_quantity::text in ('NaN','Infinity','-Infinity')
    or p_unit_cost is null or p_unit_cost < 0 or p_unit_cost::text in ('NaN','Infinity','-Infinity')
    or p_total_cost is distinct from round(p_source_quantity * p_unit_cost, 4)
    or nullif(btrim(coalesce(p_source_label,'')), '') is null
    or length(p_source_label) > 180 or length(coalesce(p_notes,'')) > 2000 then
    raise exception 'Revisa la fecha, cantidad, precio y presentación de compra.';
  end if;
  select is_active into v_product_is_active from public.products where id = p_product_id for share;
  if v_product_is_active is distinct from true then raise exception 'El producto no existe o está inactivo.'; end if;
  select coalesce(base_inventory_unit_id, inventory_unit_id, base_unit_id) into v_expected_base_unit_id
    from public.qb_product_unit_settings where product_id = p_product_id;
  if v_expected_base_unit_id is null or v_expected_base_unit_id <> p_base_unit_id then
    raise exception 'La unidad base del producto cambió; recarga la hoja antes de guardar.';
  end if;
  select * into v_base_unit from public.qb_units where id = p_base_unit_id and is_active = true;
  if v_base_unit.id is null or v_base_unit.symbol is distinct from p_base_unit_symbol
    or v_base_unit.conversion_factor_to_base <= 0 then raise exception 'La unidad física base no es válida.'; end if;
  select code into v_dimension_code from public.qb_unit_dimensions where id = v_base_unit.dimension_id and is_active = true;
  if v_dimension_code is null or v_dimension_code is distinct from p_dimension_code then raise exception 'La dimensión física del producto cambió.'; end if;

  if p_source_kind = 'commercial_unmeasured' then
    if p_allowed_unit_id is not null or p_source_unit_id is not null or p_product_presentation_id is not null
      or p_base_quantity <> 0 or p_conversion_factor <> 0 then
      raise exception 'La presentación comercial sin equivalencia no puede incluir una conversión física.';
    end if;
    v_kind := p_source_kind;
    v_label := btrim(p_source_label);
    v_factor := 0;
    v_base_quantity := 0;
  elsif p_source_kind = 'universal_unit' then
    if p_product_presentation_id is not null or p_source_unit_id is null or p_allowed_unit_id is null then raise exception 'Unidad de compra inválida.'; end if;
    select * into v_source_unit from public.qb_units where id = p_source_unit_id and is_active = true;
    if v_source_unit.id is null or v_source_unit.dimension_id <> v_base_unit.dimension_id then raise exception 'Unidad incompatible con el producto.'; end if;
    select * into v_allowed from public.qb_product_allowed_units where id = p_allowed_unit_id
      and product_id = p_product_id and usage_context = 'recepcion' and unit_id = p_source_unit_id and is_active = true;
    if v_allowed.id is null then raise exception 'La unidad ya no está habilitada para recepción.'; end if;
    v_factor := round(v_source_unit.conversion_factor_to_base / v_base_unit.conversion_factor_to_base, 9);
    v_base_quantity := round(p_source_quantity * v_factor, 6);
    v_kind := p_source_kind;
    v_label := v_source_unit.name || ' (' || v_source_unit.symbol || ')';
  elsif p_source_kind = 'product_presentation' then
    if p_allowed_unit_id is null or p_source_unit_id is not null or p_product_presentation_id is null then raise exception 'Presentación de compra inválida.'; end if;
    select * into v_allowed from public.qb_product_allowed_units where id = p_allowed_unit_id
      and product_id = p_product_id and usage_context = 'recepcion' and presentation_id = p_product_presentation_id and is_active = true;
    select * into v_presentation from public.qb_product_presentations where id = p_product_presentation_id
      and product_id = p_product_id and is_active and allow_purchase;
    select * into v_source_unit from public.qb_units where id = v_presentation.base_unit_id and is_active = true;
    if v_allowed.id is null or v_presentation.id is null or v_source_unit.id is null
      or v_source_unit.dimension_id <> v_base_unit.dimension_id then raise exception 'La presentación no es compatible o está inactiva.'; end if;
    v_factor := round(v_presentation.conversion_factor_to_base * v_source_unit.conversion_factor_to_base / v_base_unit.conversion_factor_to_base, 9);
    v_base_quantity := round(p_source_quantity * v_factor, 6);
    v_kind := p_source_kind;
    v_label := v_presentation.name || ' (' || v_presentation.symbol || ')';
  else
    raise exception 'Tipo de unidad de compra no válido.';
  end if;
  if p_conversion_factor is distinct from v_factor or p_base_quantity is distinct from v_base_quantity then
    raise exception 'La conversión cambió; recarga la hoja antes de guardar.';
  end if;
  if (p_reference_price is null) <> (p_reference_unit_id is null)
    or (p_reference_price is null) <> (p_reference_price_origin is null)
    or (p_reference_price is not null and (p_reference_price < 0 or p_reference_price > 999999
      or p_reference_price_origin is null or p_reference_price_origin not in ('manual','calculated'))) then
    raise exception 'Precio referencial incompleto o inválido.';
  end if;
  if p_reference_unit_id is not null then
    select * into v_reference_unit from public.qb_units where id = p_reference_unit_id and is_active = true;
    if v_reference_unit.id is null or v_reference_unit.dimension_id <> v_base_unit.dimension_id then raise exception 'Unidad referencial incompatible.'; end if;
    if p_reference_price_origin = 'calculated' then
      if v_kind = 'commercial_unmeasured' or v_factor <= 0 then raise exception 'No se puede calcular precio referencial sin equivalencia física.'; end if;
      if abs(p_reference_price - round(p_unit_cost * v_reference_unit.conversion_factor_to_base
        / (v_factor * v_base_unit.conversion_factor_to_base), 8)) > 0.0000001 then
        raise exception 'El precio referencial calculado no coincide con las unidades configuradas.';
      end if;
    end if;
  end if;

  insert into public.qb_merchandise_receipts(receipt_date, reference_code, supplier_name, notes, created_by, updated_by)
  values (p_receipt_date, 'HOJA-COMPRAS-ALMACEN', null, nullif(btrim(coalesce(p_notes,'')),''), v_user, v_user)
  returning id into v_receipt_id;
  insert into public.qb_merchandise_receipt_lines(
    receipt_id, product_id, allowed_unit_id, source_kind, source_unit_id, product_presentation_id,
    source_label, source_quantity, base_unit_id, base_unit_symbol, base_quantity,
    conversion_factor_to_base, unit_cost, total_cost, requires_classification, notes,
    reference_unit_id, reference_price, reference_price_origin, is_warehouse_purchase,
    created_by, updated_by)
  values (v_receipt_id, p_product_id, p_allowed_unit_id, v_kind, p_source_unit_id, p_product_presentation_id,
    v_label, p_source_quantity, p_base_unit_id, p_base_unit_symbol, v_base_quantity, v_factor,
    p_unit_cost, p_total_cost, false, nullif(btrim(coalesce(p_notes,'')),''),
    p_reference_unit_id, p_reference_price, p_reference_price_origin, true, v_user, v_user)
  returning id into v_line_id;
  insert into public.qb_conversion_snapshots(
    source_table, source_id, product_id, dimension_code, source_kind, source_unit_id,
    product_presentation_id, source_label, source_quantity, base_unit_id, base_unit_symbol,
    base_quantity, conversion_factor_to_base, snapshot, created_by)
  values ('qb_merchandise_receipt_lines', v_line_id, p_product_id, p_dimension_code, v_kind,
    p_source_unit_id, p_product_presentation_id, v_label, p_source_quantity, p_base_unit_id,
    p_base_unit_symbol, v_base_quantity, v_factor, coalesce(p_snapshot,'{}'::jsonb), v_user)
  returning id into v_snapshot_id;
  update public.qb_merchandise_receipt_lines set conversion_snapshot_id = v_snapshot_id where id = v_line_id;
  insert into public.audit_logs(user_id, action, entity_type, entity_id, metadata)
  values (v_user, 'create_qb_merchandise_receipt', 'qb_merchandise_receipt', v_receipt_id,
    jsonb_build_object('product_id',p_product_id,'source_label',v_label,'source_quantity',p_source_quantity,
      'base_quantity',v_base_quantity,'warehouse_purchase',true,'total_cost',p_total_cost));
  return v_receipt_id;
end;
$$;

revoke all on function public.create_qb_warehouse_purchase_draft(date,uuid,uuid,text,uuid,uuid,text,numeric,uuid,text,numeric,numeric,numeric,numeric,uuid,numeric,text,text,text,jsonb) from public, anon;
grant execute on function public.create_qb_warehouse_purchase_draft(date,uuid,uuid,text,uuid,uuid,text,numeric,uuid,text,numeric,numeric,numeric,numeric,uuid,numeric,text,text,text,jsonb) to authenticated;

-- Atomic, optimistic-concurrency edit for a warehouse purchase draft.
-- Confirmed receipts and their stock/FIFO history are immutable here.
create or replace function public.update_qb_warehouse_purchase_draft(
  p_line_id uuid,
  p_expected_updated_at timestamptz,
  p_source_quantity numeric,
  p_unit_cost numeric,
  p_allowed_unit_id uuid,
  p_commercial_label text,
  p_reference_unit_id uuid,
  p_reference_price numeric,
  p_reference_price_origin text,
  p_notes text,
  p_effective_quantity numeric,
  p_effective_unit_id uuid
) returns uuid
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_line public.qb_merchandise_receipt_lines%rowtype;
  v_allowed public.qb_product_allowed_units%rowtype;
  v_presentation public.qb_product_presentations%rowtype;
  v_source_unit public.qb_units%rowtype;
  v_base_unit public.qb_units%rowtype;
  v_effective_unit public.qb_units%rowtype;
  v_reference_unit public.qb_units%rowtype;
  v_source_kind text;
  v_source_unit_id uuid;
  v_presentation_id uuid;
  v_source_label text;
  v_factor numeric(18, 9);
  v_base_quantity numeric(18, 6);
  v_effective_base numeric(18, 6);
  v_total numeric(18, 4);
  v_reference_price numeric(20, 8);
  v_reference_origin text;
  v_snapshot jsonb;
  v_expected_base_unit_id uuid;
begin
  if v_user is null then raise exception 'Inicia sesión para editar la compra.'; end if;
  select role into v_role from public.profiles where id = v_user and is_active = true;
  if v_role is null or v_role not in ('admin', 'administrador', 'inventario') then
    raise exception 'No tienes permisos para editar compras.';
  end if;
  if p_source_quantity is null or p_source_quantity <= 0 or p_source_quantity > 999999999
    or p_source_quantity::text in ('NaN','Infinity','-Infinity')
    or p_unit_cost is null or p_unit_cost < 0 or p_unit_cost > 999999999
    or p_unit_cost::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Cantidad comercial o precio unitario inválido.';
  end if;
  if (p_allowed_unit_id is null) = (nullif(btrim(coalesce(p_commercial_label,'')), '') is null) then
    raise exception 'Selecciona una unidad configurada o escribe una presentación comercial.';
  end if;
  if length(coalesce(p_commercial_label,'')) > 120 or length(coalesce(p_notes,'')) > 2000 then
    raise exception 'La presentación u observación excede el límite permitido.';
  end if;
  if p_reference_price is not null and (p_reference_price < 0 or p_reference_price > 999999
    or p_reference_price::text in ('NaN','Infinity','-Infinity') or p_reference_unit_id is null) then
    raise exception 'Precio referencial o unidad inválidos.';
  end if;
  if p_reference_price is null and p_reference_price_origin is not null then
    raise exception 'El origen del precio referencial no coincide.';
  end if;
  if p_reference_price is not null and (p_reference_price_origin is null or p_reference_price_origin not in ('manual','calculated')) then
    raise exception 'El origen del precio referencial no es válido.';
  end if;
  if (p_effective_quantity is null) <> (p_effective_unit_id is null)
    or (p_effective_quantity is not null and (p_effective_quantity <= 0 or p_effective_quantity > 999999999
      or p_effective_quantity::text in ('NaN','Infinity','-Infinity'))) then
    raise exception 'Cantidad física efectiva o unidad inválida.';
  end if;

  select line.* into v_line
    from public.qb_merchandise_receipt_lines line
    join public.qb_merchandise_receipts receipt on receipt.id = line.receipt_id
   where line.id = p_line_id and line.is_warehouse_purchase = true
   for update of line;
  if not found then raise exception 'Compra no encontrada.'; end if;
  perform 1 from public.qb_merchandise_receipts where id = v_line.receipt_id for update;
  if (select status from public.qb_merchandise_receipts where id = v_line.receipt_id) <> 'borrador' then
    raise exception 'Solo se editan compras borrador; las compras confirmadas no se reescriben.';
  end if;
  if v_line.updated_at is distinct from p_expected_updated_at then
    raise exception 'QB_PURCHASE_ROW_CONFLICT: La compra cambió en otra sesión. Recarga antes de guardar.';
  end if;
  if exists (select 1 from public.qb_merchandise_receipt_movements where line_id = p_line_id)
    or exists (select 1 from public.qb_merchandise_receipt_classification_results where line_id = p_line_id) then
    raise exception 'No se puede editar una compra con movimientos o clasificación asociada.';
  end if;
  select * into v_base_unit from public.qb_units where id = v_line.base_unit_id and is_active = true;
  if v_base_unit.id is null or v_base_unit.conversion_factor_to_base <= 0 then
    raise exception 'La unidad física base del producto ya no está disponible.';
  end if;
  select coalesce(base_inventory_unit_id, inventory_unit_id, base_unit_id) into v_expected_base_unit_id
    from public.qb_product_unit_settings where product_id = v_line.product_id;
  if v_expected_base_unit_id is distinct from v_line.base_unit_id then
    raise exception 'La unidad base del producto cambió; solicita revisión antes de editar la compra.';
  end if;

  v_effective_base := null;
  if p_effective_quantity is not null then
    select * into v_effective_unit from public.qb_units
     where id = p_effective_unit_id and is_active = true;
    if v_effective_unit.id is null or v_effective_unit.dimension_id <> v_base_unit.dimension_id
      or v_effective_unit.conversion_factor_to_base <= 0 then
      raise exception 'La unidad física debe ser activa y compatible con la unidad base del producto.';
    end if;
    v_effective_base := round(p_effective_quantity * v_effective_unit.conversion_factor_to_base
      / v_base_unit.conversion_factor_to_base, 6);
    if v_effective_base <= 0 then raise exception 'La cantidad física efectiva es demasiado pequeña.'; end if;
  end if;

  if p_allowed_unit_id is null then
    v_source_kind := 'commercial_unmeasured';
    v_source_unit_id := null;
    v_presentation_id := null;
    v_source_label := btrim(p_commercial_label);
    if v_effective_base is null then
      v_factor := 0;
      v_base_quantity := 0;
    else
      v_factor := round(v_effective_base / p_source_quantity, 9);
      v_base_quantity := v_effective_base;
    end if;
  else
    select * into v_allowed from public.qb_product_allowed_units
     where id = p_allowed_unit_id and product_id = v_line.product_id
       and usage_context = 'recepcion' and is_active = true;
    if v_allowed.id is null then raise exception 'La presentación no está habilitada para este producto.'; end if;
    if v_allowed.unit_id is not null then
      select * into v_source_unit from public.qb_units
       where id = v_allowed.unit_id and is_active = true;
      if v_source_unit.id is null or v_source_unit.dimension_id <> v_base_unit.dimension_id
        or v_source_unit.conversion_factor_to_base <= 0 then
        raise exception 'La unidad comercial no es compatible con la unidad física base.';
      end if;
      v_source_kind := 'universal_unit';
      v_source_unit_id := v_source_unit.id;
      v_presentation_id := null;
      v_source_label := v_source_unit.name || ' (' || v_source_unit.symbol || ')';
      v_factor := round(v_source_unit.conversion_factor_to_base / v_base_unit.conversion_factor_to_base, 9);
    else
      select * into v_presentation from public.qb_product_presentations
       where id = v_allowed.presentation_id and product_id = v_line.product_id
         and is_active = true and allow_purchase = true;
      select * into v_source_unit from public.qb_units
       where id = v_presentation.base_unit_id and is_active = true;
      if v_presentation.id is null or v_source_unit.id is null
        or v_source_unit.dimension_id <> v_base_unit.dimension_id
        or v_presentation.conversion_factor_to_base <= 0 then
        raise exception 'La presentación no tiene conversión compatible con la unidad base.';
      end if;
      v_source_kind := 'product_presentation';
      v_source_unit_id := null;
      v_presentation_id := v_presentation.id;
      v_source_label := v_presentation.name || ' (' || v_presentation.symbol || ')';
      v_factor := round(v_presentation.conversion_factor_to_base * v_source_unit.conversion_factor_to_base
        / v_base_unit.conversion_factor_to_base, 9);
    end if;
    v_base_quantity := coalesce(v_effective_base, round(p_source_quantity * v_factor, 6));
    if v_effective_base is not null then v_factor := round(v_base_quantity / p_source_quantity, 9); end if;
  end if;
  if v_factor < 0 or (v_source_kind <> 'commercial_unmeasured' and v_factor <= 0) then
    raise exception 'La equivalencia de compra no es válida.';
  end if;
  v_total := round(p_source_quantity * p_unit_cost, 4);

  v_reference_price := p_reference_price;
  v_reference_origin := p_reference_price_origin;
  if v_reference_price is not null then
    select * into v_reference_unit from public.qb_units
     where id = p_reference_unit_id and is_active = true;
    if v_reference_unit.id is null or v_reference_unit.dimension_id <> v_base_unit.dimension_id
      or v_reference_unit.conversion_factor_to_base <= 0 then
      raise exception 'La unidad referencial debe ser activa y compatible con el producto.';
    end if;
    if v_reference_origin = 'calculated' then
      if v_effective_base is not null and v_source_kind = 'commercial_unmeasured' then
        v_reference_price := round(v_total / v_base_quantity
          * v_reference_unit.conversion_factor_to_base / v_base_unit.conversion_factor_to_base, 8);
      elsif v_source_kind <> 'commercial_unmeasured' then
        v_reference_price := round(p_unit_cost * v_reference_unit.conversion_factor_to_base
          / (v_factor * v_base_unit.conversion_factor_to_base), 8);
      else
        v_reference_price := null;
        v_reference_origin := null;
      end if;
    end if;
  end if;

  update public.qb_merchandise_receipt_lines set
    allowed_unit_id = p_allowed_unit_id,
    source_kind = v_source_kind,
    source_unit_id = v_source_unit_id,
    product_presentation_id = v_presentation_id,
    source_label = v_source_label,
    source_quantity = p_source_quantity,
    unit_cost = p_unit_cost,
    total_cost = v_total,
    conversion_factor_to_base = v_factor,
    base_quantity = v_base_quantity,
    actual_base_quantity_recorded = v_effective_base is not null,
    reference_unit_id = case when v_reference_price is null then null else p_reference_unit_id end,
    reference_price = v_reference_price,
    reference_price_origin = v_reference_origin,
    notes = nullif(btrim(coalesce(p_notes,'')),''),
    updated_by = v_user,
    updated_at = now()
  where id = p_line_id;

  update public.qb_conversion_snapshots set
    source_kind = v_source_kind,
    source_unit_id = v_source_unit_id,
    product_presentation_id = v_presentation_id,
    source_label = v_source_label,
    source_quantity = p_source_quantity,
    base_quantity = v_base_quantity,
    conversion_factor_to_base = v_factor,
    snapshot = snapshot || jsonb_build_object('allowed_unit_id', p_allowed_unit_id,
      'warehouse_purchase_actual_base_quantity', v_effective_base,
      'measured_by', case when v_effective_base is null then null else v_user::text end,
      'measured_at', case when v_effective_base is null then null else now()::text end)
  where id = v_line.conversion_snapshot_id
    and source_table = 'qb_merchandise_receipt_lines' and source_id = p_line_id;
  if not found then raise exception 'Snapshot de conversión no encontrado.'; end if;

  insert into public.audit_logs(user_id, action, entity_type, entity_id, metadata)
  values (v_user, 'update_qb_warehouse_purchase_draft', 'qb_merchandise_receipt_line', p_line_id,
    jsonb_build_object('receipt_id', v_line.receipt_id, 'source_quantity', p_source_quantity,
      'unit_cost', p_unit_cost, 'total_cost', v_total, 'source_label', v_source_label,
      'effective_base_quantity', v_effective_base));
  return p_line_id;
end;
$$;

revoke all on function public.update_qb_warehouse_purchase_draft(uuid,timestamptz,numeric,numeric,uuid,text,uuid,numeric,text,text,numeric,uuid) from public, anon;
grant execute on function public.update_qb_warehouse_purchase_draft(uuid,timestamptz,numeric,numeric,uuid,text,uuid,numeric,text,text,numeric,uuid) to authenticated;

-- Idempotent wrapper for the warehouse worksheet. The established receipt RPC
-- still owns the stock/FIFO transaction; this wrapper only makes retries safe.
create or replace function public.confirm_qb_warehouse_purchase_draft(p_receipt_id uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_receipt public.qb_merchandise_receipts%rowtype;
  v_lines integer;
  v_movements integer;
begin
  if v_user is null then raise exception 'Inicia sesión para confirmar el ingreso.'; end if;
  select role into v_role from public.profiles where id = v_user and is_active = true;
  if v_role is null or v_role not in ('admin','administrador','inventario') then raise exception 'No tienes permisos para confirmar compras.'; end if;
  select * into v_receipt from public.qb_merchandise_receipts where id = p_receipt_id for update;
  if v_receipt.id is null then raise exception 'Compra no encontrada.'; end if;
  select count(*) into v_lines from public.qb_merchandise_receipt_lines
   where receipt_id = p_receipt_id and is_warehouse_purchase = true;
  if v_lines = 0 or exists (select 1 from public.qb_merchandise_receipt_lines
     where receipt_id = p_receipt_id and is_warehouse_purchase = false) then
    raise exception 'El ingreso no corresponde exclusivamente a compras de almacén.';
  end if;
  select count(*) into v_movements from public.qb_merchandise_receipt_movements where receipt_id = p_receipt_id;
  if v_receipt.status = 'confirmado' then
    if v_movements = v_lines and not exists (
      select 1 from public.qb_merchandise_receipt_lines line
       where line.receipt_id = p_receipt_id and line.actual_base_quantity_recorded = false
    ) and not exists (
      select 1 from public.qb_merchandise_receipt_lines line
       where line.receipt_id = p_receipt_id and not exists (
         select 1 from public.qb_merchandise_receipt_movements receipt_movement
         join public.inventory_movements inventory_movement on inventory_movement.id = receipt_movement.inventory_movement_id
          where receipt_movement.line_id = line.id and receipt_movement.receipt_id = p_receipt_id
            and receipt_movement.movement_type = 'entrada' and receipt_movement.movement_quantity = line.base_quantity
            and inventory_movement.product_id = line.product_id and inventory_movement.movement_type = 'entrada'
            and inventory_movement.quantity = round(line.base_quantity, 3)
       )
    ) then return p_receipt_id; end if;
    raise exception 'La compra confirmada tiene movimientos incompletos; requiere revisión administrativa.';
  end if;
  if v_receipt.status <> 'borrador' then raise exception 'Solo se confirma una compra borrador.'; end if;
  perform public.confirm_qb_merchandise_receipt(p_receipt_id);
  return p_receipt_id;
end;
$$;

revoke all on function public.confirm_qb_warehouse_purchase_draft(uuid) from public, anon;
grant execute on function public.confirm_qb_warehouse_purchase_draft(uuid) to authenticated;

create or replace function public.annul_qb_warehouse_purchase_draft(p_receipt_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_receipt public.qb_merchandise_receipts%rowtype;
  v_lines integer;
begin
  if v_user is null then raise exception 'Inicia sesión para anular la compra.'; end if;
  select role into v_role from public.profiles where id = v_user and is_active = true;
  if v_role is null or v_role not in ('admin','administrador','inventario') then raise exception 'No tienes permisos para anular compras.'; end if;
  if length(btrim(coalesce(p_reason,''))) < 4 or length(p_reason) > 500 then raise exception 'Escribe un motivo de anulación válido.'; end if;
  select * into v_receipt from public.qb_merchandise_receipts where id = p_receipt_id for update;
  if v_receipt.id is null then raise exception 'Compra no encontrada.'; end if;
  select count(*) into v_lines from public.qb_merchandise_receipt_lines
   where receipt_id = p_receipt_id and is_warehouse_purchase = true;
  if v_lines = 0 or exists (select 1 from public.qb_merchandise_receipt_lines
    where receipt_id = p_receipt_id and is_warehouse_purchase = false) then
    raise exception 'El ingreso no corresponde exclusivamente a compras de almacén.';
  end if;
  if v_receipt.status = 'anulado' then
    if not exists (select 1 from public.qb_merchandise_receipt_movements where receipt_id = p_receipt_id)
      then return p_receipt_id; end if;
    raise exception 'La compra anulada conserva movimientos asociados; requiere revisión administrativa.';
  end if;
  if v_receipt.status <> 'borrador' then
    raise exception 'La compra ya afectó stock/FIFO; no se anula automáticamente. Requiere corrección auditada.';
  end if;
  if exists (select 1 from public.qb_merchandise_receipt_movements where receipt_id = p_receipt_id)
    or exists (select 1 from public.inventory_lots lot
      join public.qb_merchandise_receipt_movements movement on movement.id = lot.source_receipt_movement_id
      where movement.receipt_id = p_receipt_id) then
    raise exception 'La compra tiene movimientos o lotes asociados y no puede anularse como borrador.';
  end if;
  update public.qb_merchandise_receipts set status = 'anulado', annulled_by = v_user,
    annulled_at = now(), annulled_reason = btrim(p_reason), updated_by = v_user
   where id = p_receipt_id;
  insert into public.audit_logs(user_id, action, entity_type, entity_id, metadata)
  values (v_user, 'annul_qb_warehouse_purchase_draft', 'qb_merchandise_receipt', p_receipt_id,
    jsonb_build_object('reason',btrim(p_reason),'line_count',v_lines));
  return p_receipt_id;
end;
$$;
revoke all on function public.annul_qb_warehouse_purchase_draft(uuid,text) from public, anon;
grant execute on function public.annul_qb_warehouse_purchase_draft(uuid,text) to authenticated;

commit;
