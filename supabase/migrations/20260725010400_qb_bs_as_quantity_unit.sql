-- En el flujo básico, BS es una unidad seleccionable y su valor se registra
-- en cantidad; ya no se interpreta como el modo monetario QB-17.

begin;

do $rewrite$
declare
  function_oid oid;
  function_definition text;
  unsupported_block text := $block$
    if exists (
      select 1
      from public.qb_units unit
      where unit.id = v_allowed.unit_id
        and upper(trim(unit.symbol)) in ('BS', 'BS.')
    ) or exists (
      select 1
      from public.qb_product_presentations presentation
      where presentation.id = v_allowed.presentation_id
        and upper(trim(presentation.symbol)) in ('BS', 'BS.')
    ) then
      result_code := 'unsupported_amount_mode';
      return next;
      return;
    end if;
$block$;
begin
  function_oid := pg_catalog.to_regprocedure(
    'public.create_qb_internal_catalog_order(text,uuid,uuid,text,text,text,text,text,text,text,text,jsonb,text)'
  );

  if function_oid is null then
    raise exception 'QB_INTERNAL_ORDER_FUNCTION_NOT_FOUND';
  end if;

  select pg_catalog.pg_get_functiondef(function_oid)
  into function_definition;

  if pg_catalog.strpos(function_definition, unsupported_block) = 0 then
    raise exception 'QB_BS_QUANTITY_GUARD_NOT_FOUND';
  end if;

  function_definition := pg_catalog.replace(
    function_definition,
    unsupported_block,
    E'\n'
  );
  execute function_definition;
end;
$rewrite$;

comment on function public.create_qb_internal_catalog_order(
  text, uuid, uuid, text, text, text, text, text, text, text, text, jsonb, text
) is
  'Crea pedidos internos registrados o invitados. BS se trata como una unidad de cantidad del catálogo básico.';

commit;
