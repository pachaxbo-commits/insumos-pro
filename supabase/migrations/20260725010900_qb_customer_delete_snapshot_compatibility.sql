-- La instantánea de pedidos por monto vive en private.qb_order_amount_snapshots.
-- Se mantiene un alias privado de compatibilidad para la función de eliminación
-- y se incluye una comprobación transaccional restringida a service_role.

begin;

create or replace view public.qb_order_price_snapshots
as
select *
from private.qb_order_amount_snapshots;

revoke all on table public.qb_order_price_snapshots
from public, anon, authenticated;

create or replace function public.diagnose_qb_customer_force_delete(
  p_customer_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_admin_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Diagnóstico no autorizado.';
  end if;

  select profile.id
  into v_admin_id
  from public.profiles profile
  where profile.role in ('admin', 'administrador')
    and profile.is_active = true
  order by profile.created_at
  limit 1;

  if v_admin_id is null then
    raise exception 'No existe un administrador activo para el diagnóstico.';
  end if;

  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_admin_id,
      'role', 'authenticated'
    )::text,
    true
  );

  perform public.admin_force_delete_qb_customer(p_customer_id);

  raise exception 'QB_DELETE_DRY_RUN_OK';
end;
$$;

revoke all on function public.diagnose_qb_customer_force_delete(uuid)
from public, anon, authenticated;

grant execute on function public.diagnose_qb_customer_force_delete(uuid)
to service_role;

commit;
