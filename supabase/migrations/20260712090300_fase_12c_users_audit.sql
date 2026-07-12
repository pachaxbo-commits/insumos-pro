-- Fase 12C - Administracion interna de usuarios y auditoria endurecida
-- PENDIENTE DE APLICAR EN SUPABASE STAGING.
-- No ejecutar en produccion sin backup, validacion y aprobacion explicita.

-- 1. Reforzar RPC de administracion de perfiles.
-- La UI tambien valida estas reglas, pero la RPC debe defenderse si alguien la llama directo.
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
  v_actor_id uuid;
  v_actor_role text;
  v_target_role text;
  v_target_is_active boolean;
  v_other_active_admins integer;
begin
  v_actor_id := auth.uid();
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

  select role, is_active
  into v_target_role, v_target_is_active
  from public.profiles
  where id = p_profile_id
  for update;

  if not found then
    raise exception 'Perfil no encontrado.';
  end if;

  if p_profile_id = v_actor_id and p_role <> v_target_role then
    raise exception 'No puedes cambiar tu propio rol.';
  end if;

  if p_profile_id = v_actor_id and coalesce(p_is_active, false) = false then
    raise exception 'No puedes desactivar tu propio usuario.';
  end if;

  if v_target_role = 'administrador'
    and v_target_is_active = true
    and (p_role <> 'administrador' or coalesce(p_is_active, false) = false)
  then
    select count(*)
    into v_other_active_admins
    from public.profiles
    where role = 'administrador'
      and is_active = true
      and id <> p_profile_id;

    if coalesce(v_other_active_admins, 0) < 1 then
      raise exception 'No se puede dejar el sistema sin al menos un administrador activo.';
    end if;
  end if;

  update public.profiles
  set full_name = nullif(trim(coalesce(p_full_name, '')), ''),
      role = p_role,
      is_active = coalesce(p_is_active, false)
  where id = p_profile_id;
end;
$$;

revoke all on function public.admin_update_profile(uuid, text, text, boolean) from public;
grant execute on function public.admin_update_profile(uuid, text, text, boolean) to authenticated;

-- 2. Bloquear auditoria arbitraria desde clientes autenticados.
-- La aplicacion debe escribir audit_logs con SUPABASE_SERVICE_ROLE_KEY desde servidor.
drop policy if exists "Authenticated users can insert own audit logs" on public.audit_logs;
revoke insert, update, delete on table public.audit_logs from anon, authenticated;

-- 3. Asegurar lectura solo para administradores.
drop policy if exists "Admins can view audit logs" on public.audit_logs;
create policy "Admins can view audit logs"
on public.audit_logs
for select
to authenticated
using (public.current_user_role() = 'administrador');
