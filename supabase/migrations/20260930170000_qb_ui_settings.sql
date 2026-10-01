begin;

create table if not exists public.qb_ui_settings (
  id integer primary key default 1 check (id = 1),
  system_name text not null default 'QB Insumos' check (char_length(btrim(system_name)) between 2 and 60),
  logo_path text,
  menu_labels jsonb not null default '{}'::jsonb check (jsonb_typeof(menu_labels) = 'object'),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.qb_ui_settings (id) values (1) on conflict (id) do nothing;

alter table public.qb_ui_settings enable row level security;
revoke all on public.qb_ui_settings from public, anon, authenticated;
grant select, update on public.qb_ui_settings to authenticated;

create policy "Active staff can read interface labels"
on public.qb_ui_settings for select to authenticated
using (exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.is_active = true
));

create policy "Administrators can update interface labels"
on public.qb_ui_settings for update to authenticated
using (exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.is_active = true and p.role = 'administrador'
))
with check (id = 1 and exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.is_active = true and p.role = 'administrador'
));

commit;
