-- El administrador decide si un cliente duplicado debe desaparecer incluso
-- cuando tiene historial. La eliminación se ejecuta en una sola transacción
-- y abarca todo el historial dependiente de esa cuenta.

begin;

create or replace function public.admin_update_qb_customer_directory(
  p_customer_id uuid,
  p_business_name text,
  p_responsible_name text,
  p_phone text,
  p_location_id uuid,
  p_location_label text,
  p_address text,
  p_reference text,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_location_id uuid;
begin
  select profile.role
  into v_role
  from public.profiles profile
  where profile.id = v_user_id
    and profile.is_active = true;

  if v_user_id is null or v_role not in ('admin', 'administrador') then
    raise exception 'Solo el administrador puede gestionar clientes.';
  end if;

  update public.customer_accounts account
  set
    full_name = trim(p_business_name),
    business_name = trim(p_business_name),
    responsible_name = trim(p_responsible_name),
    phone = nullif(trim(coalesce(p_phone, '')), ''),
    is_active = p_is_active
  where account.id = p_customer_id;

  if not found then
    raise exception 'El cliente ya no existe.';
  end if;

  if p_location_id is not null then
    update public.qb_customer_locations location
    set
      label = trim(p_location_label),
      address = trim(p_address),
      reference = nullif(trim(coalesce(p_reference, '')), ''),
      phone = nullif(trim(coalesce(p_phone, '')), ''),
      is_primary = true,
      is_active = true
    where location.id = p_location_id
      and location.customer_account_id = p_customer_id
    returning location.id into v_location_id;
  end if;

  if v_location_id is null then
    insert into public.qb_customer_locations (
      customer_account_id,
      label,
      address,
      reference,
      phone,
      is_primary,
      is_active
    )
    values (
      p_customer_id,
      trim(p_location_label),
      trim(p_address),
      nullif(trim(coalesce(p_reference, '')), ''),
      nullif(trim(coalesce(p_phone, '')), ''),
      true,
      true
    )
    returning id into v_location_id;
  end if;

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_user_id,
    'update_customer',
    'customer',
    p_customer_id,
    jsonb_build_object(
      'source', 'admin_directory',
      'is_active', p_is_active
    )
  );

  return jsonb_build_object(
    'customer_id', p_customer_id,
    'location_id', v_location_id,
    'is_active', p_is_active
  );
end;
$$;

create or replace function public.admin_force_delete_qb_customer(
  p_customer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_customer public.customer_accounts%rowtype;
  v_qb_orders integer := 0;
  v_legacy_orders integer := 0;
  v_receipts integer := 0;
begin
  select profile.role
  into v_role
  from public.profiles profile
  where profile.id = v_user_id
    and profile.is_active = true;

  if v_user_id is null or v_role not in ('admin', 'administrador') then
    raise exception 'Solo el administrador puede eliminar clientes.';
  end if;

  if exists (
    select 1
    from public.profiles profile
    where profile.id = p_customer_id
  ) then
    raise exception 'Una cuenta interna no puede eliminarse desde Clientes.';
  end if;

  select *
  into v_customer
  from public.customer_accounts account
  where account.id = p_customer_id
  for update;

  if v_customer.id is null then
    raise exception 'El cliente ya no existe.';
  end if;

  select count(*)::integer
  into v_qb_orders
  from public.qb_orders orders
  where orders.customer_account_id = p_customer_id;

  select count(*)::integer
  into v_legacy_orders
  from public.orders orders
  where orders.customer_account_id = p_customer_id;

  select count(*)::integer
  into v_receipts
  from public.qb_receipts receipt
  where receipt.customer_account_id = p_customer_id;

  delete from public.qb_receipts receipt
  where receipt.customer_account_id = p_customer_id;

  delete from public.qb_order_delivery_movements movement
  where movement.order_id in (
    select orders.id
    from public.qb_orders orders
    where orders.customer_account_id = p_customer_id
  );

  delete from public.qb_order_delivery_items delivery
  where delivery.order_id in (
    select orders.id
    from public.qb_orders orders
    where orders.customer_account_id = p_customer_id
  );

  delete from public.qb_order_line_change_events event
  where event.customer_account_id = p_customer_id
    or event.order_id in (
      select orders.id
      from public.qb_orders orders
      where orders.customer_account_id = p_customer_id
    );

  delete from public.qb_order_price_snapshots snapshot
  where snapshot.order_item_id in (
    select item.id
    from public.qb_order_items item
    join public.qb_orders orders on orders.id = item.order_id
    where orders.customer_account_id = p_customer_id
  );

  delete from public.qb_orders orders
  where orders.customer_account_id = p_customer_id;

  delete from public.orders orders
  where orders.customer_account_id = p_customer_id;

  delete from public.customer_accounts account
  where account.id = p_customer_id;

  delete from auth.users auth_user
  where auth_user.id = p_customer_id;

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_user_id,
    'delete_customer',
    'customer',
    p_customer_id,
    jsonb_build_object(
      'email', v_customer.email,
      'business_name', v_customer.business_name,
      'source', 'admin_directory',
      'deleted_qb_orders', v_qb_orders,
      'deleted_legacy_orders', v_legacy_orders,
      'deleted_receipts', v_receipts
    )
  );

  return jsonb_build_object(
    'customer_id', p_customer_id,
    'deleted_qb_orders', v_qb_orders,
    'deleted_legacy_orders', v_legacy_orders,
    'deleted_receipts', v_receipts
  );
end;
$$;

revoke all on function public.admin_update_qb_customer_directory(
  uuid, text, text, text, uuid, text, text, text, boolean
) from public, anon;

revoke all on function public.admin_force_delete_qb_customer(uuid)
from public, anon;

grant execute on function public.admin_update_qb_customer_directory(
  uuid, text, text, text, uuid, text, text, text, boolean
) to authenticated;

grant execute on function public.admin_force_delete_qb_customer(uuid)
to authenticated;

comment on function public.admin_force_delete_qb_customer(uuid) is
  'Elimina definitivamente una cuenta de cliente y todo su historial dependiente cuando un administrador lo confirma.';

commit;
