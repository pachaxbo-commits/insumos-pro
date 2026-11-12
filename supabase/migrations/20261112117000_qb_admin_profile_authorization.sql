begin;

create or replace function public.admin_update_profile(
  p_profile_id uuid, p_full_name text, p_role text, p_is_active boolean
) returns void language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_actor_id uuid := auth.uid();
  v_target_role text;
  v_target_is_active boolean;
  v_other_active_admins integer;
begin
  -- Serialize profile changes and recheck the actor against the locked row.
  perform pg_advisory_xact_lock(hashtextextended('qb-admin-update-profile', 0));
  perform 1 from public.profiles
  where id = v_actor_id and is_active is true and role = 'administrador'
  for update;
  if not found then
    raise exception 'Solo un administrador puede modificar perfiles.' using errcode = '42501';
  end if;
  if p_profile_id is null or p_role is null or p_role not in ('administrador','ventas','inventario','entregador','supervisor','finanzas') then
    raise exception 'Perfil o rol inválido.';
  end if;
  select role, is_active into v_target_role, v_target_is_active
  from public.profiles where id = p_profile_id for update;
  if not found then raise exception 'Perfil no encontrado.'; end if;
  if p_profile_id = v_actor_id and p_role <> v_target_role then raise exception 'No puedes cambiar tu propio rol.'; end if;
  if p_profile_id = v_actor_id and coalesce(p_is_active,false) = false then raise exception 'No puedes desactivar tu propio usuario.'; end if;
  if v_target_role = 'administrador' and v_target_is_active
     and (p_role <> 'administrador' or coalesce(p_is_active,false) = false) then
    select count(*) into v_other_active_admins from public.profiles
    where role = 'administrador' and is_active and id <> p_profile_id;
    if coalesce(v_other_active_admins,0) < 1 then raise exception 'No se puede dejar el sistema sin al menos un administrador activo.'; end if;
  end if;
  update public.profiles set full_name = nullif(trim(coalesce(p_full_name,'')),''),
    role = p_role, is_active = coalesce(p_is_active,false) where id = p_profile_id;
end $$;
revoke all on function public.admin_update_profile(uuid,text,text,boolean) from public, anon;
grant execute on function public.admin_update_profile(uuid,text,text,boolean) to authenticated;

commit;
