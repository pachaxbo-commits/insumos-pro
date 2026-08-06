-- Recibos: los porcentajes personalizados avanzan y se guardan de 1% en 1%.

begin;

create or replace function private.qb_receipt_factor_is_valid(p_value numeric)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select
    p_value is not null
    and p_value::text not in ('NaN', 'Infinity', '-Infinity')
    and p_value >= 0
    and p_value <= 1000
    and p_value = trunc(p_value);
$$;

revoke all on function private.qb_receipt_factor_is_valid(numeric)
  from public, anon, authenticated;

create or replace function private.validate_qb_draft_factors()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.status = 'borrador' and (
    not private.qb_receipt_factor_is_valid(new.distance_factor_percent)
    or not private.qb_receipt_factor_is_valid(new.exigency_factor_percent)
    or not private.qb_receipt_factor_is_valid(new.weather_factor_percent)
    or not private.qb_receipt_factor_is_valid(new.extraordinary_factor_percent)
  ) then
    raise exception 'Cada porcentaje interno debe ser un entero entre 0%% y 1000%%.';
  end if;

  if tg_op = 'UPDATE' and old.status <> 'borrador' and (
    new.distance_factor_percent is distinct from old.distance_factor_percent
    or new.exigency_factor_percent is distinct from old.exigency_factor_percent
    or new.weather_factor_percent is distinct from old.weather_factor_percent
    or new.extraordinary_factor_percent is distinct from old.extraordinary_factor_percent
    or new.subtotal_amount is distinct from old.subtotal_amount
    or new.total_amount is distinct from old.total_amount
    or new.factor_total_percent is distinct from old.factor_total_percent
    or new.surcharge_amount is distinct from old.surcharge_amount
    or new.summary_snapshot is distinct from old.summary_snapshot
  ) then
    raise exception 'Los importes y factores de un recibo emitido son inmutables.';
  end if;

  return new;
end;
$$;

do $do$
declare
  v_definition text;
  v_needle text := $needle$  if v_receipt.distance_factor_percent is null
    or v_receipt.distance_factor_percent::text in ('NaN', 'Infinity', '-Infinity')
    or v_receipt.distance_factor_percent < 0
    or v_receipt.distance_factor_percent > 1000
    or v_receipt.exigency_factor_percent is null
    or v_receipt.exigency_factor_percent::text in ('NaN', 'Infinity', '-Infinity')
    or v_receipt.exigency_factor_percent < 0
    or v_receipt.exigency_factor_percent > 1000
    or v_receipt.weather_factor_percent is null
    or v_receipt.weather_factor_percent::text in ('NaN', 'Infinity', '-Infinity')
    or v_receipt.weather_factor_percent < 0
    or v_receipt.weather_factor_percent > 1000
    or v_receipt.extraordinary_factor_percent is null
    or v_receipt.extraordinary_factor_percent::text in ('NaN', 'Infinity', '-Infinity')
    or v_receipt.extraordinary_factor_percent < 0
    or v_receipt.extraordinary_factor_percent > 1000 then
    raise exception 'Cada porcentaje interno debe estar entre 0%% y 1000%%.';
  end if;$needle$;
  v_replacement text := $replacement$  if not private.qb_receipt_factor_is_valid(v_receipt.distance_factor_percent)
    or not private.qb_receipt_factor_is_valid(v_receipt.exigency_factor_percent)
    or not private.qb_receipt_factor_is_valid(v_receipt.weather_factor_percent)
    or not private.qb_receipt_factor_is_valid(v_receipt.extraordinary_factor_percent) then
    raise exception 'Cada porcentaje interno debe ser un entero entre 0%% y 1000%%.';
  end if;$replacement$;
  v_occurrences integer;
begin
  select pg_get_functiondef(
    'public.recalculate_qb_receipt_totals(uuid)'::regprocedure
  )
  into v_definition;

  if position(
    'private.qb_receipt_factor_is_valid(v_receipt.distance_factor_percent)'
    in v_definition
  ) > 0 then
    null;
  else
    v_occurrences :=
      (length(v_definition) - length(replace(v_definition, v_needle, '')))
      / length(v_needle);

    if v_occurrences <> 1 then
      raise exception
        'No se pudo actualizar la validacion de porcentajes enteros: coincidencias %.',
        v_occurrences;
    end if;

    execute replace(v_definition, v_needle, v_replacement);
  end if;
end;
$do$;

comment on function private.qb_receipt_factor_is_valid(numeric) is
  'Valida que un recargo de recibo sea un porcentaje entero entre 0 y 1000.';

commit;
