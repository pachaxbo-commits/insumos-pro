-- Pricing: reuse the guarded base-price RPC from receipt drafts.

begin;

create or replace function public.update_qb_receipt_draft(
  p_receipt_id uuid,
  p_distance_factor_percent numeric,
  p_exigency_factor_percent numeric,
  p_weather_factor_percent numeric,
  p_extraordinary_factor_percent numeric,
  p_visible_note text,
  p_internal_notes text,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_receipt public.qb_receipts%rowtype;
  v_line jsonb;
  v_line_id uuid;
  v_line_price_text text;
  v_line_price numeric(14, 4);
  v_expected_price_text text;
  v_expected_price numeric(18, 4);
  v_current_price numeric(18, 4);
  v_save_new boolean;
  v_receipt_line public.qb_receipt_lines%rowtype;
begin
  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role into v_user_role
  from public.profiles
  where id = v_user_id and is_active = true;

  if v_user_role is null or v_user_role not in ('admin', 'administrador') then
    raise exception 'No tienes permisos para editar recibos QB.';
  end if;

  select *
  into v_receipt
  from public.qb_receipts
  where id = p_receipt_id
  for update;

  if v_receipt.id is null then
    raise exception 'Recibo QB no encontrado.';
  end if;

  if v_receipt.status <> 'borrador' then
    raise exception 'Solo se pueden editar recibos QB en borrador.';
  end if;

  if p_distance_factor_percent is null
    or p_distance_factor_percent::text in ('NaN', 'Infinity', '-Infinity')
    or p_distance_factor_percent < -100 or p_distance_factor_percent > 1000
    or p_exigency_factor_percent is null
    or p_exigency_factor_percent::text in ('NaN', 'Infinity', '-Infinity')
    or p_exigency_factor_percent < -100 or p_exigency_factor_percent > 1000
    or p_weather_factor_percent is null
    or p_weather_factor_percent::text in ('NaN', 'Infinity', '-Infinity')
    or p_weather_factor_percent < -100 or p_weather_factor_percent > 1000
    or p_extraordinary_factor_percent is null
    or p_extraordinary_factor_percent::text in ('NaN', 'Infinity', '-Infinity')
    or p_extraordinary_factor_percent < -100 or p_extraordinary_factor_percent > 1000 then
    raise exception 'Los factores del recibo deben ser numeros validos dentro del rango permitido.';
  end if;

  update public.qb_receipts
  set distance_factor_percent = p_distance_factor_percent,
      exigency_factor_percent = p_exigency_factor_percent,
      weather_factor_percent = p_weather_factor_percent,
      extraordinary_factor_percent = p_extraordinary_factor_percent,
      visible_note = nullif(trim(coalesce(p_visible_note, '')), ''),
      internal_notes = nullif(trim(coalesce(p_internal_notes, '')), '')
  where id = p_receipt_id;

  if p_lines is not null and jsonb_typeof(p_lines) = 'array' then
    for v_line in select * from jsonb_array_elements(p_lines)
    loop
      v_line_id := (v_line ->> 'line_id')::uuid;
      v_line_price_text := nullif(trim(coalesce(v_line ->> 'base_price_used', '')), '');
      v_expected_price_text := nullif(trim(coalesce(v_line ->> 'expected_base_price', '')), '');
      v_save_new := coalesce((v_line ->> 'save_as_new_base_price')::boolean, false);

      if v_line_price_text is null then
        v_line_price := null;
      else
        begin
          v_line_price := v_line_price_text::numeric;
        exception
          when invalid_text_representation or numeric_value_out_of_range then
            raise exception 'El precio debe ser un numero positivo valido.';
        end;

        if v_line_price::text in ('NaN', 'Infinity', '-Infinity')
          or v_line_price <= 0
          or v_line_price > 99999999 then
          raise exception 'El precio debe ser un numero positivo valido.';
        end if;
      end if;

      if v_expected_price_text is null then
        v_expected_price := null;
      else
        begin
          v_expected_price := v_expected_price_text::numeric;
        exception
          when invalid_text_representation or numeric_value_out_of_range then
            raise exception 'El precio base actual no es valido. Actualiza la pagina e intentalo nuevamente.';
        end;
      end if;

      if v_save_new and v_line_price is null then
        raise exception 'Ingresa un precio positivo antes de guardarlo como precio base.';
      end if;

      select *
      into v_receipt_line
      from public.qb_receipt_lines
      where id = v_line_id
        and receipt_id = p_receipt_id
      for update;

      if v_receipt_line.id is null then
        raise exception 'Linea de recibo QB invalida.';
      end if;

      update public.qb_receipt_lines
      set base_price_used = v_line_price,
          base_price_edited = case
            when v_line_price is null then original_base_price is not null
            else original_base_price is null
              or original_base_price::text in ('NaN', 'Infinity', '-Infinity')
              or abs(v_line_price - original_base_price) > 0.0001
          end,
          save_as_new_base_price = case when v_line_price is null then false else v_save_new end,
          notes = nullif(trim(coalesce(v_line ->> 'notes', '')), '')
      where id = v_line_id;

      if v_save_new then
        select base_sale_price
        into v_current_price
        from public.qb_product_unit_settings
        where product_id = v_receipt_line.product_id;

        if v_current_price is distinct from v_line_price then
          perform public.update_qb_product_base_price(
            v_receipt_line.product_id,
            v_line_price,
            v_expected_price,
            false
          );

          insert into public.qb_receipt_events (receipt_id, event_type, metadata, created_by)
          values (
            p_receipt_id,
            'precio_base_actualizado',
            jsonb_build_object(
              'product_id', v_receipt_line.product_id,
              'receipt_line_id', v_line_id,
              'previous_base_price', v_expected_price,
              'new_base_price', v_line_price
            ),
            v_user_id
          );
        end if;
      end if;
    end loop;
  end if;

  perform public.recalculate_qb_receipt_totals(p_receipt_id);

  insert into public.qb_receipt_events (receipt_id, event_type, metadata, created_by)
  values (
    p_receipt_id,
    'lineas_editadas',
    jsonb_build_object(
      'distance_factor_percent', p_distance_factor_percent,
      'exigency_factor_percent', p_exigency_factor_percent,
      'weather_factor_percent', p_weather_factor_percent,
      'extraordinary_factor_percent', p_extraordinary_factor_percent
    ),
    v_user_id
  );

  return p_receipt_id;
end;
$$;

revoke all on function public.update_qb_receipt_draft(uuid, numeric, numeric, numeric, numeric, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.update_qb_receipt_draft(uuid, numeric, numeric, numeric, numeric, text, text, jsonb)
  to authenticated;

comment on function public.update_qb_receipt_draft(uuid, numeric, numeric, numeric, numeric, text, text, jsonb) is
  'Edita un borrador y delega los cambios de precio base a la RPC protegida, con consentimiento y concurrencia.';

commit;
