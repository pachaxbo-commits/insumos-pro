-- Confirmar entrega es el cierre del trabajo ya guardado línea por línea.
-- La sincronización en tiempo real puede cambiar updated_at entre el último
-- autoguardado y el clic; se toma la versión actual bajo bloqueo para evitar
-- un falso conflicto, conservando todas las validaciones de la función vigente.

begin;

alter function public.confirm_qb_matrix_delivery(
  uuid, timestamptz, text
) rename to confirm_qb_matrix_delivery_v2;

create function public.confirm_qb_matrix_delivery(
  p_order_id uuid,
  p_expected_updated_at timestamptz,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_current_updated_at timestamptz;
begin
  select orders.updated_at
  into v_current_updated_at
  from public.qb_orders orders
  where orders.id = p_order_id
  for update;

  if v_current_updated_at is null then
    raise exception 'Pedido no encontrado.';
  end if;

  return public.confirm_qb_matrix_delivery_v2(
    p_order_id,
    v_current_updated_at,
    p_idempotency_key
  );
end;
$$;

revoke all on function public.confirm_qb_matrix_delivery(
  uuid, timestamptz, text
) from public, anon;

grant execute on function public.confirm_qb_matrix_delivery(
  uuid, timestamptz, text
) to authenticated;

comment on function public.confirm_qb_matrix_delivery(
  uuid, timestamptz, text
) is
  'Confirma contra la versión actual bloqueada del pedido; las líneas finales de Entrega y las demás validaciones siguen siendo obligatorias.';

commit;
