-- FASE 12A - ENDURECIMIENTO DE SEGURIDAD
-- PENDIENTE DE APLICAR EN STAGING.
-- No ejecutar directamente en produccion sin backup, validacion y aprobacion.

begin;

-- 1. Bloquear escalamiento de privilegios por update directo al perfil propio.
drop policy if exists "Users can update own profile" on public.profiles;

create or replace function public.current_user_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true
  limit 1
$$;

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;

create or replace function public.admin_update_profile(
  p_profile_id uuid,
  p_full_name text,
  p_role text,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text;
begin
  v_actor_role := public.current_user_role();

  if v_actor_role <> 'administrador' then
    raise exception 'Solo un administrador puede modificar perfiles.';
  end if;

  if p_profile_id is null then
    raise exception 'Perfil invalido.';
  end if;

  if p_role not in ('administrador', 'ventas', 'inventario', 'finanzas') then
    raise exception 'Rol invalido.';
  end if;

  update public.profiles
  set full_name = nullif(trim(coalesce(p_full_name, '')), ''),
      role = p_role,
      is_active = coalesce(p_is_active, false)
  where id = p_profile_id;

  if not found then
    raise exception 'Perfil no encontrado.';
  end if;
end;
$$;

revoke all on function public.admin_update_profile(uuid, text, text, boolean) from public;
grant execute on function public.admin_update_profile(uuid, text, text, boolean) to authenticated;

-- 2. Bloquear mutaciones directas que saltan reglas de negocio.
drop policy if exists "Inventory roles can insert inventory movements" on public.inventory_movements;

drop policy if exists "Inventory roles can insert purchases" on public.purchases;
drop policy if exists "Inventory roles can update purchases" on public.purchases;
drop policy if exists "Inventory roles can insert purchase items" on public.purchase_items;

drop policy if exists "Sales roles can insert sales" on public.sales;
drop policy if exists "Sales roles can update sales" on public.sales;
drop policy if exists "Sales roles can insert sale items" on public.sale_items;

drop policy if exists "Sales roles can insert accounts receivable" on public.accounts_receivable;
drop policy if exists "Finance roles can insert accounts receivable" on public.accounts_receivable;
drop policy if exists "Finance roles can update accounts receivable" on public.accounts_receivable;

drop policy if exists "Finance roles can mutate accounts payable" on public.accounts_payable;
drop policy if exists "Finance roles can insert payments" on public.payments;
drop policy if exists "Finance roles can insert cash movements" on public.cash_movements;

-- Las mutaciones operativas quedan por RPC/Server Actions:
-- - register_inventory_movement
-- - create_purchase_draft, confirm_purchase, cancel_purchase_draft
-- - create_sale_draft, confirm_sale, cancel_sale_draft
-- - register_customer_payment, register_supplier_payment, register_manual_cash_movement

commit;

