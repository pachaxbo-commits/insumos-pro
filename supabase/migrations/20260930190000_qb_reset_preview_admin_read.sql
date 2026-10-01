begin;

create or replace function public.preview_qb_test_data_reset(p_mode text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if auth.role() <> 'service_role' and not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active = true and p.role = 'administrador'
  ) then
    raise exception 'Vista previa no autorizada.';
  end if;
  if p_mode not in ('receipts', 'orders') then
    raise exception 'Selección inválida.';
  end if;
  return jsonb_build_object(
    'mode', p_mode,
    'receipts', (select count(*) from public.qb_receipts),
    'orders', case when p_mode = 'orders' then (select count(*) from public.qb_orders) else 0 end,
    'preparations', case when p_mode = 'orders' then (select count(*) from public.qb_order_preparations) else 0 end,
    'deliveries', case when p_mode = 'orders' then (select count(*) from public.qb_order_delivery_movements) else 0 end,
    'delivery_stock_movements', case when p_mode = 'orders' then (select count(*) from public.qb_order_delivery_movements where inventory_movement_id is not null) else 0 end,
    'customers_preserved', (select count(*) from public.customer_accounts),
    'products_preserved', (select count(*) from public.products),
    'profiles_preserved', (select count(*) from public.profiles)
  );
end;
$$;

revoke all on function public.preview_qb_test_data_reset(text) from public, anon;
grant execute on function public.preview_qb_test_data_reset(text) to authenticated, service_role;

commit;
