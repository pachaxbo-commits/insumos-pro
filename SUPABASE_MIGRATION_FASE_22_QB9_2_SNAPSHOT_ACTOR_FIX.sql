-- QB-9.2: actores autenticados e internos en snapshots de conversion.
-- Migracion aditiva: no reescribe snapshots historicos ni modifica RLS existente.

begin;

alter table public.qb_conversion_snapshots
  add column if not exists created_by_auth_user_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'qb_conversion_snapshots_created_by_auth_user_id_fkey'
      and conrelid = 'public.qb_conversion_snapshots'::regclass
  ) then
    alter table public.qb_conversion_snapshots
      add constraint qb_conversion_snapshots_created_by_auth_user_id_fkey
      foreign key (created_by_auth_user_id)
      references auth.users(id)
      on delete set null;
  end if;
end;
$$;

create index if not exists qb_conversion_snapshots_auth_actor_idx
  on public.qb_conversion_snapshots (created_by_auth_user_id, created_at desc);

comment on column public.qb_conversion_snapshots.created_by is
  'Perfil interno que creo el snapshot. Es NULL para clientes externos y operaciones sin perfil interno.';

comment on column public.qb_conversion_snapshots.created_by_auth_user_id is
  'Usuario autenticado que creo el snapshot, interno o cliente externo. ON DELETE SET NULL preserva el snapshot fisico.';

create or replace function public.set_qb_conversion_snapshot_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
begin
  if v_auth_user_id is null then
    -- Permite operaciones locales/de sistema explicitas sin inventar un actor.
    return new;
  end if;

  new.created_by_auth_user_id := v_auth_user_id;

  if exists (
    select 1
    from public.profiles profile
    where profile.id = v_auth_user_id
  ) then
    new.created_by := v_auth_user_id;
  else
    -- Los clientes externos conservan su identidad Auth sin convertirse en perfil interno.
    new.created_by := null;
  end if;

  return new;
end;
$$;

revoke all on function public.set_qb_conversion_snapshot_actor() from public, anon, authenticated;

drop trigger if exists set_qb_conversion_snapshot_actor_on_insert
  on public.qb_conversion_snapshots;

create trigger set_qb_conversion_snapshot_actor_on_insert
  before insert on public.qb_conversion_snapshots
  for each row execute function public.set_qb_conversion_snapshot_actor();

commit;
