-- QB-4: Ingresos de mercaderia y clasificacion opcional.
-- Alcance local: crea ingresos QB separados de compras legacy, pagos, CxP y finanzas.

begin;

create table if not exists public.qb_merchandise_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_date date not null default current_date,
  status text not null default 'borrador',
  reference_code text,
  supplier_name text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  confirmed_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz,
  annulled_by uuid references public.profiles(id) on delete set null,
  annulled_at timestamptz,
  annulled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qb_merchandise_receipts_status_check
    check (status in ('borrador', 'confirmado', 'anulado'))
);

comment on table public.qb_merchandise_receipts is
  'QB-4: ingresos fisicos de mercaderia, separados de compras legacy, pagos y finanzas.';
comment on column public.qb_merchandise_receipts.supplier_name is
  'Referencia libre opcional. No crea proveedor, compra, CxP ni pago.';

create table if not exists public.qb_merchandise_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.qb_merchandise_receipts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  allowed_unit_id uuid references public.qb_product_allowed_units(id) on delete restrict,
  source_kind text not null,
  source_unit_id uuid references public.qb_units(id) on delete restrict,
  product_presentation_id uuid references public.qb_product_presentations(id) on delete restrict,
  source_label text not null,
  source_quantity numeric(18, 6) not null,
  base_unit_id uuid not null references public.qb_units(id) on delete restrict,
  base_unit_symbol text not null,
  base_quantity numeric(18, 6) not null,
  conversion_factor_to_base numeric(18, 9) not null,
  conversion_snapshot_id uuid references public.qb_conversion_snapshots(id) on delete set null,
  unit_cost numeric(18, 4),
  total_cost numeric(18, 4) not null default 0,
  requires_classification boolean not null default false,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qb_merchandise_receipt_lines_source_kind_check
    check (source_kind in ('universal_unit', 'product_presentation')),
  constraint qb_merchandise_receipt_lines_one_source_check
    check (
      (source_kind = 'universal_unit' and source_unit_id is not null and product_presentation_id is null) or
      (source_kind = 'product_presentation' and source_unit_id is null and product_presentation_id is not null)
    ),
  constraint qb_merchandise_receipt_lines_source_quantity_check check (source_quantity > 0),
  constraint qb_merchandise_receipt_lines_base_quantity_check check (base_quantity > 0),
  constraint qb_merchandise_receipt_lines_factor_check check (conversion_factor_to_base > 0),
  constraint qb_merchandise_receipt_lines_unit_cost_check check (unit_cost is null or unit_cost >= 0),
  constraint qb_merchandise_receipt_lines_total_cost_check check (total_cost >= 0)
);

comment on table public.qb_merchandise_receipt_lines is
  'QB-4: linea recibida con unidad/presentacion, cantidad convertida y snapshot. No actualiza stock hasta confirmar.';
comment on column public.qb_merchandise_receipt_lines.total_cost is
  'Costo de ingreso separado de precio base de venta. No modifica products.sale_price ni recibos.';

create table if not exists public.qb_merchandise_receipt_classification_results (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references public.qb_merchandise_receipt_lines(id) on delete cascade,
  configured_output_id uuid references public.qb_product_classification_outputs(id) on delete set null,
  output_type text not null default 'product',
  output_product_id uuid references public.products(id) on delete restrict,
  label text not null,
  base_quantity numeric(18, 6) not null,
  assigned_cost numeric(18, 4) not null default 0,
  notes text,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qb_merchandise_classification_results_type_check
    check (output_type in ('product', 'loss')),
  constraint qb_merchandise_classification_results_target_check
    check (
      (output_type = 'product' and output_product_id is not null) or
      (output_type = 'loss' and output_product_id is null)
    ),
  constraint qb_merchandise_classification_results_quantity_check check (base_quantity >= 0),
  constraint qb_merchandise_classification_results_cost_check check (assigned_cost >= 0),
  constraint qb_merchandise_classification_results_sort_order_check check (sort_order >= 0)
);

comment on table public.qb_merchandise_receipt_classification_results is
  'QB-4: distribucion real de un ingreso clasificado. Las filas loss registran merma sin aumentar stock.';

create table if not exists public.qb_merchandise_receipt_movements (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.qb_merchandise_receipts(id) on delete cascade,
  line_id uuid not null references public.qb_merchandise_receipt_lines(id) on delete cascade,
  classification_result_id uuid references public.qb_merchandise_receipt_classification_results(id) on delete set null,
  inventory_movement_id uuid references public.inventory_movements(id) on delete restrict,
  product_id uuid references public.products(id) on delete restrict,
  movement_type text not null default 'entrada',
  movement_role text not null,
  movement_quantity numeric(18, 6) not null,
  created_at timestamptz not null default now(),
  constraint qb_merchandise_receipt_movements_type_check
    check (movement_type in ('entrada', 'merma')),
  constraint qb_merchandise_receipt_movements_role_check
    check (movement_role in ('direct_entry', 'classified_output', 'loss')),
  constraint qb_merchandise_receipt_movements_quantity_check check (movement_quantity >= 0),
  constraint qb_merchandise_receipt_movements_inventory_required_check
    check (
      (movement_role = 'loss' and inventory_movement_id is null and product_id is null) or
      (movement_role in ('direct_entry', 'classified_output') and inventory_movement_id is not null and product_id is not null)
    )
);

comment on table public.qb_merchandise_receipt_movements is
  'QB-4: enlace auditable entre ingresos QB y movimientos de inventario. La merma se registra sin movimiento de stock.';

create index if not exists qb_merchandise_receipts_status_date_idx
  on public.qb_merchandise_receipts (status, receipt_date desc);

create index if not exists qb_merchandise_receipt_lines_receipt_idx
  on public.qb_merchandise_receipt_lines (receipt_id);

create index if not exists qb_merchandise_receipt_lines_product_idx
  on public.qb_merchandise_receipt_lines (product_id, created_at desc);

create index if not exists qb_merchandise_classification_results_line_idx
  on public.qb_merchandise_receipt_classification_results (line_id, sort_order);

create index if not exists qb_merchandise_receipt_movements_receipt_idx
  on public.qb_merchandise_receipt_movements (receipt_id, line_id);

create unique index if not exists qb_merchandise_receipt_movements_inventory_unique_idx
  on public.qb_merchandise_receipt_movements (inventory_movement_id)
  where inventory_movement_id is not null;

drop trigger if exists set_qb_merchandise_receipts_updated_at on public.qb_merchandise_receipts;
create trigger set_qb_merchandise_receipts_updated_at
  before update on public.qb_merchandise_receipts
  for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_qb_merchandise_receipt_lines_updated_at on public.qb_merchandise_receipt_lines;
create trigger set_qb_merchandise_receipt_lines_updated_at
  before update on public.qb_merchandise_receipt_lines
  for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_qb_merchandise_classification_results_updated_at on public.qb_merchandise_receipt_classification_results;
create trigger set_qb_merchandise_classification_results_updated_at
  before update on public.qb_merchandise_receipt_classification_results
  for each row execute function public.set_current_timestamp_updated_at();

create or replace function public.confirm_qb_merchandise_receipt(p_receipt_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user_role text;
  v_receipt public.qb_merchandise_receipts%rowtype;
  v_line public.qb_merchandise_receipt_lines%rowtype;
  v_result public.qb_merchandise_receipt_classification_results%rowtype;
  v_result_total numeric(18, 6);
  v_stock_before numeric(14, 3);
  v_stock_after numeric(14, 3);
  v_movement_id uuid;
  v_target_product_id uuid;
  v_expected_base_unit_id uuid;
  v_settings_qb_active boolean;
  v_settings_classifiable boolean;
  v_allowed_unit_id uuid;
  v_allowed_unit_source_unit_id uuid;
  v_allowed_unit_presentation_id uuid;
  v_snapshot_id uuid;
  v_configured_output_type text;
  v_configured_output_product_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role
  into v_user_role
  from public.profiles
  where id = v_user_id
    and is_active = true;

  if v_user_role is null or v_user_role not in ('admin', 'administrador', 'inventario') then
    raise exception 'No tienes permisos para confirmar ingresos QB.';
  end if;

  select *
  into v_receipt
  from public.qb_merchandise_receipts
  where id = p_receipt_id
  for update;

  if v_receipt.id is null then
    raise exception 'Ingreso QB no encontrado.';
  end if;

  if v_receipt.status <> 'borrador' then
    raise exception 'Solo se pueden confirmar ingresos QB en borrador.';
  end if;

  if exists (
    select 1 from public.qb_merchandise_receipt_movements where receipt_id = p_receipt_id
  ) then
    raise exception 'Este ingreso QB ya tiene movimientos asociados.';
  end if;

  if not exists (
    select 1 from public.qb_merchandise_receipt_lines where receipt_id = p_receipt_id
  ) then
    raise exception 'El ingreso QB debe tener al menos una linea.';
  end if;

  for v_line in
    select *
    from public.qb_merchandise_receipt_lines
    where receipt_id = p_receipt_id
    order by created_at, id
  loop
    if v_line.source_quantity <= 0 or v_line.base_quantity <= 0 or v_line.conversion_factor_to_base <= 0 then
      raise exception 'La linea del ingreso QB tiene cantidades o factor de conversion invalidos.';
    end if;

    if not exists (
      select 1
      from public.products product
      where product.id = v_line.product_id
        and product.is_active = true
    ) then
      raise exception 'Producto recibido no encontrado o inactivo.';
    end if;

    v_expected_base_unit_id := null;
    v_settings_qb_active := null;
    v_settings_classifiable := null;

    select
      coalesce(settings.base_inventory_unit_id, settings.inventory_unit_id, settings.base_unit_id),
      settings.is_qb_active,
      settings.is_classifiable
    into v_expected_base_unit_id, v_settings_qb_active, v_settings_classifiable
    from public.qb_product_unit_settings settings
    where settings.product_id = v_line.product_id;

    if v_expected_base_unit_id is null or coalesce(v_settings_qb_active, false) = false then
      raise exception 'Producto recibido sin configuracion QB activa suficiente.';
    end if;

    if v_expected_base_unit_id <> v_line.base_unit_id then
      raise exception 'La unidad base del ingreso QB no coincide con la configuracion activa del producto.';
    end if;

    if v_line.requires_classification and coalesce(v_settings_classifiable, false) = false then
      raise exception 'El producto recibido no esta configurado como clasificable.';
    end if;

    v_allowed_unit_id := null;
    v_allowed_unit_source_unit_id := null;
    v_allowed_unit_presentation_id := null;

    select allowed_unit.id, allowed_unit.unit_id, allowed_unit.presentation_id
    into v_allowed_unit_id, v_allowed_unit_source_unit_id, v_allowed_unit_presentation_id
    from public.qb_product_allowed_units allowed_unit
    where allowed_unit.id = v_line.allowed_unit_id
      and allowed_unit.product_id = v_line.product_id
      and allowed_unit.usage_context = 'recepcion'
      and allowed_unit.is_active = true;

    if v_allowed_unit_id is null then
      raise exception 'La unidad o presentacion de recepcion no esta permitida o activa.';
    end if;

    if v_line.source_kind = 'universal_unit' then
      if v_allowed_unit_source_unit_id is distinct from v_line.source_unit_id then
        raise exception 'La unidad universal del ingreso QB no coincide con la unidad permitida.';
      end if;

      if not exists (
        select 1
        from public.qb_units unit
        where unit.id = v_line.source_unit_id
          and unit.is_active = true
      ) then
        raise exception 'La unidad universal del ingreso QB no esta activa.';
      end if;
    elsif v_line.source_kind = 'product_presentation' then
      if v_allowed_unit_presentation_id is distinct from v_line.product_presentation_id then
        raise exception 'La presentacion del ingreso QB no coincide con la presentacion permitida.';
      end if;

      if not exists (
        select 1
        from public.qb_product_presentations presentation
        where presentation.id = v_line.product_presentation_id
          and presentation.product_id = v_line.product_id
          and presentation.is_active = true
      ) then
        raise exception 'La presentacion del ingreso QB no esta activa.';
      end if;
    else
      raise exception 'Tipo de unidad de recepcion QB invalido.';
    end if;

    v_snapshot_id := null;

    select snapshot.id
    into v_snapshot_id
    from public.qb_conversion_snapshots snapshot
    where snapshot.id = v_line.conversion_snapshot_id
      and snapshot.source_table = 'qb_merchandise_receipt_lines'
      and snapshot.source_id = v_line.id
      and snapshot.product_id = v_line.product_id
      and abs(snapshot.source_quantity - v_line.source_quantity) <= 0.001
      and abs(snapshot.base_quantity - v_line.base_quantity) <= 0.001
    limit 1;

    if v_snapshot_id is null then
      raise exception 'El ingreso QB no tiene snapshot de conversion valido.';
    end if;

    if v_line.requires_classification then
      select coalesce(sum(base_quantity), 0)
      into v_result_total
      from public.qb_merchandise_receipt_classification_results
      where line_id = v_line.id;

      if abs(v_result_total - v_line.base_quantity) > 0.001 then
        raise exception 'La clasificacion debe sumar exactamente la cantidad base recibida.';
      end if;

      for v_result in
        select *
        from public.qb_merchandise_receipt_classification_results
        where line_id = v_line.id
        order by sort_order, created_at
      loop
        v_configured_output_type := null;
        v_configured_output_product_id := null;

        select output.output_type, output.output_product_id
        into v_configured_output_type, v_configured_output_product_id
        from public.qb_product_classification_outputs output
        where output.id = v_result.configured_output_id
          and output.source_product_id = v_line.product_id
          and output.is_active = true;

        if v_configured_output_type is null then
          raise exception 'Resultado de clasificacion QB sin configuracion activa.';
        end if;

        if v_configured_output_type <> v_result.output_type then
          raise exception 'Resultado de clasificacion QB no coincide con su configuracion.';
        end if;

        if v_result.output_type = 'product'
          and v_configured_output_product_id is distinct from v_result.output_product_id then
          raise exception 'Producto resultado de clasificacion QB no coincide con su configuracion.';
        end if;

        if v_result.output_type = 'loss' and v_result.output_product_id is not null then
          raise exception 'La merma QB no debe apuntar a un producto de inventario.';
        end if;

        if v_result.output_type = 'loss' then
          insert into public.qb_merchandise_receipt_movements (
            receipt_id,
            line_id,
            classification_result_id,
            movement_type,
            movement_role,
            movement_quantity
          )
          values (
            p_receipt_id,
            v_line.id,
            v_result.id,
            'merma',
            'loss',
            v_result.base_quantity
          );
        elsif v_result.base_quantity > 0 then
          v_target_product_id := v_result.output_product_id;

          select stock_current
          into v_stock_before
          from public.products
          where id = v_target_product_id
            and is_active = true
          for update;

          if v_stock_before is null then
            raise exception 'Producto resultado no encontrado o inactivo.';
          end if;

          v_stock_after := v_stock_before + v_result.base_quantity;

          insert into public.inventory_movements (
            product_id,
            movement_type,
            quantity,
            stock_before,
            stock_after,
            reason,
            notes,
            created_by
          )
          values (
            v_target_product_id,
            'entrada',
            v_result.base_quantity,
            v_stock_before,
            v_stock_after,
            'Ingreso QB clasificado',
            'Ingreso QB ' || p_receipt_id::text || ', linea ' || v_line.id::text || ', resultado ' || v_result.label,
            v_user_id
          )
          returning id into v_movement_id;

          update public.products
          set stock_current = v_stock_after
          where id = v_target_product_id;

          insert into public.qb_merchandise_receipt_movements (
            receipt_id,
            line_id,
            classification_result_id,
            inventory_movement_id,
            product_id,
            movement_type,
            movement_role,
            movement_quantity
          )
          values (
            p_receipt_id,
            v_line.id,
            v_result.id,
            v_movement_id,
            v_target_product_id,
            'entrada',
            'classified_output',
            v_result.base_quantity
          );
        end if;
      end loop;
    else
      select stock_current
      into v_stock_before
      from public.products
      where id = v_line.product_id
        and is_active = true
      for update;

      if v_stock_before is null then
        raise exception 'Producto recibido no encontrado o inactivo.';
      end if;

      v_stock_after := v_stock_before + v_line.base_quantity;

      insert into public.inventory_movements (
        product_id,
        movement_type,
        quantity,
        stock_before,
        stock_after,
        reason,
        notes,
        created_by
      )
      values (
        v_line.product_id,
        'entrada',
        v_line.base_quantity,
        v_stock_before,
        v_stock_after,
        'Ingreso QB de mercaderia',
        'Ingreso QB ' || p_receipt_id::text || ', linea ' || v_line.id::text,
        v_user_id
      )
      returning id into v_movement_id;

      update public.products
      set stock_current = v_stock_after
      where id = v_line.product_id;

      insert into public.qb_merchandise_receipt_movements (
        receipt_id,
        line_id,
        inventory_movement_id,
        product_id,
        movement_type,
        movement_role,
        movement_quantity
      )
      values (
        p_receipt_id,
        v_line.id,
        v_movement_id,
        v_line.product_id,
        'entrada',
        'direct_entry',
        v_line.base_quantity
      );
    end if;
  end loop;

  update public.qb_merchandise_receipts
  set status = 'confirmado',
      confirmed_by = v_user_id,
      confirmed_at = now(),
      updated_by = v_user_id
  where id = p_receipt_id;

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_user_id,
    'confirm_qb_merchandise_receipt',
    'qb_merchandise_receipt',
    p_receipt_id,
    jsonb_build_object(
      'line_count', (select count(*) from public.qb_merchandise_receipt_lines where receipt_id = p_receipt_id),
      'movement_count', (select count(*) from public.qb_merchandise_receipt_movements where receipt_id = p_receipt_id)
    )
  );

  return p_receipt_id;
end;
$$;

revoke all on function public.confirm_qb_merchandise_receipt(uuid) from public;
grant execute on function public.confirm_qb_merchandise_receipt(uuid) to authenticated;

alter table public.qb_merchandise_receipts enable row level security;
alter table public.qb_merchandise_receipt_lines enable row level security;
alter table public.qb_merchandise_receipt_classification_results enable row level security;
alter table public.qb_merchandise_receipt_movements enable row level security;

drop policy if exists "Authenticated users can view QB merchandise receipts" on public.qb_merchandise_receipts;
create policy "Authenticated users can view QB merchandise receipts"
  on public.qb_merchandise_receipts for select
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Inventory roles can insert QB merchandise receipts" on public.qb_merchandise_receipts;
create policy "Inventory roles can insert QB merchandise receipts"
  on public.qb_merchandise_receipts for insert
  with check (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Inventory roles can update draft QB merchandise receipts" on public.qb_merchandise_receipts;
create policy "Inventory roles can update draft QB merchandise receipts"
  on public.qb_merchandise_receipts for update
  using (public.current_user_role() in ('admin', 'administrador', 'inventario') and status = 'borrador')
  with check (
    public.current_user_role() in ('admin', 'administrador', 'inventario')
    and status in ('borrador', 'anulado')
  );

drop policy if exists "Authenticated users can view QB merchandise receipt lines" on public.qb_merchandise_receipt_lines;
create policy "Authenticated users can view QB merchandise receipt lines"
  on public.qb_merchandise_receipt_lines for select
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Inventory roles can insert QB merchandise receipt lines" on public.qb_merchandise_receipt_lines;
create policy "Inventory roles can insert QB merchandise receipt lines"
  on public.qb_merchandise_receipt_lines for insert
  with check (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Inventory roles can update QB merchandise receipt lines" on public.qb_merchandise_receipt_lines;
create policy "Inventory roles can update QB merchandise receipt lines"
  on public.qb_merchandise_receipt_lines for update
  using (
    public.current_user_role() in ('admin', 'administrador', 'inventario')
    and exists (
      select 1
      from public.qb_merchandise_receipts receipt
      where receipt.id = receipt_id
        and receipt.status = 'borrador'
    )
  )
  with check (
    public.current_user_role() in ('admin', 'administrador', 'inventario')
    and exists (
      select 1
      from public.qb_merchandise_receipts receipt
      where receipt.id = receipt_id
        and receipt.status = 'borrador'
    )
  );

drop policy if exists "Authenticated users can view QB merchandise classification results" on public.qb_merchandise_receipt_classification_results;
create policy "Authenticated users can view QB merchandise classification results"
  on public.qb_merchandise_receipt_classification_results for select
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Inventory roles can manage QB merchandise classification results" on public.qb_merchandise_receipt_classification_results;
create policy "Inventory roles can manage QB merchandise classification results"
  on public.qb_merchandise_receipt_classification_results for all
  using (
    public.current_user_role() in ('admin', 'administrador', 'inventario')
    and exists (
      select 1
      from public.qb_merchandise_receipt_lines line
      join public.qb_merchandise_receipts receipt on receipt.id = line.receipt_id
      where line.id = public.qb_merchandise_receipt_classification_results.line_id
        and receipt.status = 'borrador'
    )
  )
  with check (
    public.current_user_role() in ('admin', 'administrador', 'inventario')
    and exists (
      select 1
      from public.qb_merchandise_receipt_lines line
      join public.qb_merchandise_receipts receipt on receipt.id = line.receipt_id
      where line.id = public.qb_merchandise_receipt_classification_results.line_id
        and receipt.status = 'borrador'
    )
  );

drop policy if exists "Authenticated users can view QB merchandise receipt movements" on public.qb_merchandise_receipt_movements;
create policy "Authenticated users can view QB merchandise receipt movements"
  on public.qb_merchandise_receipt_movements for select
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Inventory roles can insert QB merchandise receipt movements" on public.qb_merchandise_receipt_movements;
-- Los vinculos de movimientos se crean exclusivamente dentro de confirm_qb_merchandise_receipt().

commit;
