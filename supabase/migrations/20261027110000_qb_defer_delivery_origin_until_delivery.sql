begin;

-- Preparation records what inventory verified. Merchandise origin is selected
-- at Delivery, where the physical handoff happens. Keep the established auth,
-- optimistic concurrency, open-preparation, persisted-per-line, and audit
-- contract. Zero or partial warehouse preparation is valid because origin is
-- classified later during Delivery.
create or replace function public.finalize_qb_matrix_preparation(
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
  v_user uuid := auth.uid();
  v_role text;
  v_order public.qb_orders%rowtype;
  v_preparation public.qb_order_preparations%rowtype;
begin
  select role into v_role from public.profiles where id=v_user and is_active;
  if v_user is null or v_role not in ('admin','administrador','inventario') then
    raise exception 'No tienes permisos para finalizar preparación.';
  end if;
  if length(trim(coalesce(p_idempotency_key,''))) < 8 then
    raise exception 'Clave de idempotencia inválida.';
  end if;
  select * into v_order from public.qb_orders where id=p_order_id for update;
  if v_order.id is null or v_order.updated_at is distinct from p_expected_updated_at then
    raise exception 'QB_MATRIX_CONFLICT: el pedido cambió en otro dispositivo.' using errcode='40001';
  end if;
  select * into v_preparation from public.qb_order_preparations where order_id=p_order_id for update;
  if v_preparation.id is null or v_preparation.status<>'en_preparacion' then
    raise exception 'La preparación no está abierta.';
  end if;
  if exists (
    select 1 from public.qb_order_items oi
    left join public.qb_order_preparation_items pi on pi.order_item_id=oi.id
    where oi.order_id=p_order_id and (
      pi.prepared_at_line is null
    )
  ) then
    raise exception 'Verifica la preparación de cada producto antes de finalizarla.';
  end if;
  update public.qb_order_preparations
    set status='preparado',prepared_by=v_user,prepared_at=now()
    where id=v_preparation.id;
  update public.qb_orders set status='preparado' where id=p_order_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,metadata)
  values(v_user,'finalize_qb_matrix_preparation','qb_order',p_order_id,
    jsonb_build_object('idempotency_key',p_idempotency_key,'preparation_saved',true));
  return p_order_id;
end;
$$;

revoke all on function public.finalize_qb_matrix_preparation(uuid,timestamptz,text) from public,anon;
grant execute on function public.finalize_qb_matrix_preparation(uuid,timestamptz,text) to authenticated;

commit;
