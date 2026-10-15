-- Preserve commercial packaging without inventing a physical conversion.

begin;

alter table public.qb_merchandise_receipt_lines

  drop constraint if exists qb_merchandise_receipt_lines_source_kind_check,

  drop constraint if exists qb_merchandise_receipt_lines_one_source_check,

  drop constraint if exists qb_merchandise_receipt_lines_base_quantity_check,

  drop constraint if exists qb_merchandise_receipt_lines_factor_check,
  drop constraint if exists qb_merchandise_receipt_lines_unmeasured_pair_check;

alter table public.qb_merchandise_receipt_lines

  add constraint qb_merchandise_receipt_lines_source_kind_check

    check (source_kind in ('universal_unit', 'product_presentation', 'commercial_unmeasured')),

  add constraint qb_merchandise_receipt_lines_one_source_check

    check (

      (source_kind = 'universal_unit' and source_unit_id is not null and product_presentation_id is null) or

      (source_kind = 'product_presentation' and source_unit_id is null and product_presentation_id is not null) or

      (source_kind = 'commercial_unmeasured' and source_unit_id is null and product_presentation_id is null and allowed_unit_id is null)

    ),

  add constraint qb_merchandise_receipt_lines_base_quantity_check

    check ((source_kind = 'commercial_unmeasured' and base_quantity >= 0) or base_quantity > 0),

  add constraint qb_merchandise_receipt_lines_factor_check

    check ((source_kind = 'commercial_unmeasured' and conversion_factor_to_base >= 0) or conversion_factor_to_base > 0),

  add constraint qb_merchandise_receipt_lines_unmeasured_pair_check

    check ((base_quantity = 0 and conversion_factor_to_base = 0) or (base_quantity > 0 and conversion_factor_to_base > 0));

alter table public.qb_conversion_snapshots

  drop constraint if exists qb_conversion_snapshots_source_kind_check,

  drop constraint if exists qb_conversion_snapshots_base_quantity_check,

  drop constraint if exists qb_conversion_snapshots_factor_check,
  drop constraint if exists qb_conversion_snapshots_unmeasured_pair_check;

alter table public.qb_conversion_snapshots

  add constraint qb_conversion_snapshots_source_kind_check

    check (source_kind in ('universal_unit', 'product_presentation', 'commercial_unmeasured')),

  add constraint qb_conversion_snapshots_base_quantity_check

    check ((source_kind = 'commercial_unmeasured' and base_quantity >= 0) or base_quantity > 0),

  add constraint qb_conversion_snapshots_factor_check

    check ((source_kind = 'commercial_unmeasured' and conversion_factor_to_base >= 0) or conversion_factor_to_base > 0),

  add constraint qb_conversion_snapshots_unmeasured_pair_check

    check ((base_quantity = 0 and conversion_factor_to_base = 0) or (base_quantity > 0 and conversion_factor_to_base > 0));

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

    if v_line.source_quantity <= 0

      or (v_line.source_kind = 'commercial_unmeasured' and (

        v_line.is_warehouse_purchase = false or v_line.actual_base_quantity_recorded = false

        or v_line.allowed_unit_id is not null or v_line.source_unit_id is not null

        or v_line.product_presentation_id is not null or v_line.base_quantity <= 0

        or v_line.conversion_factor_to_base <= 0))

      or (v_line.source_kind <> 'commercial_unmeasured' and (v_line.base_quantity <= 0 or v_line.conversion_factor_to_base <= 0)) then

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

    if v_line.source_kind <> 'commercial_unmeasured' then

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

    elsif v_line.source_kind = 'commercial_unmeasured' then

      if v_line.is_warehouse_purchase = false or v_line.actual_base_quantity_recorded = false then

        raise exception 'Registra la cantidad fisica util medida antes de confirmar esta presentacion comercial.';

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

      and snapshot.source_kind = v_line.source_kind

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

comment on column public.qb_merchandise_receipt_lines.source_label is

  'Unidad física, presentación configurada o nombre comercial libre; comercial_unmeasured mantiene conversiones en cero hasta medir.';

commit;
