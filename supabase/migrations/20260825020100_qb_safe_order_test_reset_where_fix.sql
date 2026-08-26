begin;

do $fix$
declare
  v_definition text;
  v_before text;
  v_after text;
begin
  select pg_get_functiondef(
    'public.reset_qb_order_test_data(text)'::regprocedure
  )
  into v_definition;

  for v_before, v_after in
    values
      ('delete from public.qb_receipts;', 'delete from public.qb_receipts where true;'),
      ('delete from public.qb_order_line_change_events;', 'delete from public.qb_order_line_change_events where true;'),
      ('delete from private.qb_guest_order_idempotency;', 'delete from private.qb_guest_order_idempotency where true;'),
      ('delete from public.qb_order_delivery_movements;', 'delete from public.qb_order_delivery_movements where true;'),
      ('delete from public.qb_order_delivery_items;', 'delete from public.qb_order_delivery_items where true;'),
      ('delete from public.qb_orders;', 'delete from public.qb_orders where true;'),
      ('delete from public.orders;', 'delete from public.orders where true;'),
      ('delete from private.qb_guest_order_rate_limits;', 'delete from private.qb_guest_order_rate_limits where true;'),
      (
        'delete from public.public_order_submission_attempts',
        'delete from public.public_order_submission_attempts where true'
      )
  loop
    if strpos(v_definition, v_before) = 0 then
      raise exception 'No se encontró la sentencia protegida: %', v_before;
    end if;

    v_definition := replace(v_definition, v_before, v_after);
  end loop;

  execute v_definition;
end;
$fix$;

comment on function public.reset_qb_order_test_data(text) is
  'Reinicio transaccional restringido: restaura stock descontado por entregas y elimina pedidos, recibos y dependencias de prueba sin tocar catálogo ni clientes. Las eliminaciones declaran alcance explícito.';

commit;
