-- Plantillas reutilizables del último pedido confirmado de cada cliente antiguo.
-- Solo se importan cantidades positivas, productos/unidades activos y combinaciones válidas.
-- Los productos repetidos se consolidan y las cantidades se ajustan al paso actual de 0.5.

begin;

create table if not exists public.qb_legacy_order_templates (
  id uuid primary key default extensions.gen_random_uuid(),
  customer_account_id uuid not null references public.customer_accounts(id) on delete cascade,
  source_order_id bigint not null,
  source_order_date date not null,
  source_email text not null,
  source_notes text,
  imported_at timestamptz not null default now(),
  unique (customer_account_id, source_order_id)
);

create table if not exists public.qb_legacy_order_template_lines (
  id uuid primary key default extensions.gen_random_uuid(),
  template_id uuid not null references public.qb_legacy_order_templates(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  allowed_unit_id uuid not null references public.qb_product_allowed_units(id) on delete restrict,
  quantity numeric(18, 6) not null check (quantity > 0),
  notes text,
  sort_order integer not null check (sort_order > 0),
  unique (template_id, product_id),
  constraint qb_legacy_template_line_notes_length check (char_length(coalesce(notes, '')) <= 500)
);

create index if not exists qb_legacy_order_templates_customer_date_idx
  on public.qb_legacy_order_templates(customer_account_id, source_order_date desc);
create index if not exists qb_legacy_order_template_lines_template_sort_idx
  on public.qb_legacy_order_template_lines(template_id, sort_order);

alter table public.qb_legacy_order_templates enable row level security;
alter table public.qb_legacy_order_template_lines enable row level security;

drop policy if exists "Admins can view legacy order templates"
  on public.qb_legacy_order_templates;
create policy "Admins can view legacy order templates"
  on public.qb_legacy_order_templates
  for select
  using (public.current_user_role() in ('admin', 'administrador'));

drop policy if exists "Admins can view legacy order template lines"
  on public.qb_legacy_order_template_lines;
create policy "Admins can view legacy order template lines"
  on public.qb_legacy_order_template_lines
  for select
  using (public.current_user_role() in ('admin', 'administrador'));

grant select on table public.qb_legacy_order_templates to authenticated, service_role;
grant select on table public.qb_legacy_order_template_lines to authenticated, service_role;

create temporary table qb_legacy_repeat_templates (
  email text not null,
  source_order_id bigint not null,
  source_order_date date not null,
  source_notes text
) on commit drop;

insert into qb_legacy_repeat_templates values
  ('barssport@pedidos.com', 1393, '2026-04-29', null),
  ('laestancia@pedidos.com', 2322, '2026-07-21', null),
  ('nativos@pedidos.com', 2317, '2026-07-21', null),
  ('lailai@pedidos.com', 2319, '2026-07-21', null),
  ('asin@pedidos.com', 1561, '2026-05-11', null),
  ('friends@pedidos.com', 2243, '2026-07-16', null),
  ('eventuald@pedidos.com', 1825, '2026-06-05', null),
  ('prevision@pedidos.com', 737, '2026-02-20', 'POR FAVOR LAVAR LA PAPA IMILLA'),
  ('circus@pedidos.com', 2220, '2026-07-14', null),
  ('burgerlab@pedidos.com', 2287, '2026-07-20', null),
  ('tuesdayamerica@pedidos.com', 2326, '2026-07-23', null),
  ('barsaranjuez@pedidos.com', 1384, '2026-04-28', null),
  ('vinopolis@pedidos.com', 2328, '2026-07-23', null),
  ('farolesensalada@pedidos.com', 2333, '2026-07-23', null),
  ('parrilla@pedidos.com', 2320, '2026-07-21', null),
  ('pizzaluna@pedidos.com', 2313, '2026-07-21', null),
  ('eventualb@pedidos.com', 2334, '2026-07-23', null),
  ('emblema@pedidos.com', 2299, '2026-07-20', null),
  ('capresso@pedidos.com', 2325, '2026-07-23', null),
  ('lemura@pedidos.com', 1423, '2026-04-29', null),
  ('criadero@pedidos.com', 2341, '2026-07-23', null),
  ('burgerhousemelchor@pedidos.com', 2238, '2026-07-16', null),
  ('portavenezia@pedidos.com', 2294, '2026-07-20', null),
  ('devega@pedidos.com', 149, '2025-11-25', null),
  ('micos@pedidos.com', 1994, '2026-06-23', null),
  ('sbarro@pedidos.com', 2338, '2026-07-23', null),
  ('sosprado@pedidos.com', 2297, '2026-07-20', null),
  ('chifabao@pedidos.com', 2310, '2026-07-21', null),
  ('criaderonoche@pedidos.com', 2308, '2026-07-21', null),
  ('view@pedidos.com', 677, '2026-02-12', null),
  ('barsvillarroel@pedidos.com', 1586, '2026-05-13', null),
  ('sbarrohuper@pedidos.com', 2339, '2026-07-23', null),
  ('eventuala@pedidos.com', 2331, '2026-07-23', null),
  ('farolescocina@pedidos.com', 2335, '2026-07-23', null),
  ('eventualc@pedidos.com', 2290, '2026-07-20', null),
  ('zomay@pedidos.com', 2145, '2026-07-07', null),
  ('eventuale@pedidos.com', 839, '2026-03-05', null),
  ('burgerhousecala@pedidos.com', 2336, '2026-07-23', null);

insert into public.qb_legacy_order_templates (
  customer_account_id,
  source_order_id,
  source_order_date,
  source_email,
  source_notes
)
select
  customer.id,
  source.source_order_id,
  source.source_order_date,
  source.email,
  source.source_notes
from qb_legacy_repeat_templates source
join public.customer_accounts customer
  on lower(trim(customer.email)) = source.email
 and customer.is_active = true
on conflict (customer_account_id, source_order_id) do update
set source_order_date = excluded.source_order_date,
    source_email = excluded.source_email,
    source_notes = excluded.source_notes,
    imported_at = now();

create temporary table qb_legacy_repeat_lines (
  email text not null,
  source_order_id bigint not null,
  product_id uuid not null,
  unit_code text not null,
  quantity numeric(18, 6) not null,
  notes text,
  sort_order integer not null
) on commit drop;

insert into qb_legacy_repeat_lines values
  ('barssport@pedidos.com', 1393, 'f675b46a-84de-5fbc-b1a2-eccffa6dd7a5'::uuid, 'legacy_15', 0.5, null, 1),
  ('barssport@pedidos.com', 1393, 'a9f225cf-9056-56a1-a192-7e331bb27e73'::uuid, 'legacy_5', 2.0, null, 2),
  ('barssport@pedidos.com', 1393, 'bb3ef268-bc40-5592-b4e9-a5ff8536b38d'::uuid, 'legacy_15', 0.5, null, 3),
  ('barssport@pedidos.com', 1393, '1e9d0b9f-bef7-500d-ba86-d3c3a76d9df8'::uuid, 'legacy_5', 1.0, null, 4),
  ('laestancia@pedidos.com', 2322, '7d9552f7-3bfd-5410-b421-81a34d888d0d'::uuid, 'legacy_3', 2.0, null, 1),
  ('laestancia@pedidos.com', 2322, '9a51c97c-9580-5622-a432-a769bfb8cb1a'::uuid, 'legacy_5', 10.0, null, 2),
  ('laestancia@pedidos.com', 2322, '40b99e63-6a1f-5d1d-8e9c-f4fc6eb47603'::uuid, 'legacy_5', 5.0, null, 3),
  ('laestancia@pedidos.com', 2322, 'f675b46a-84de-5fbc-b1a2-eccffa6dd7a5'::uuid, 'legacy_6', 1.0, null, 4),
  ('laestancia@pedidos.com', 2322, '43b4a34d-dbf0-5720-8f11-6b34b96b4845'::uuid, 'legacy_6', 1.0, null, 5),
  ('laestancia@pedidos.com', 2322, '8872276f-8904-5f1e-aec2-9ca58b61b897'::uuid, 'legacy_7', 10.0, null, 6),
  ('laestancia@pedidos.com', 2322, 'abeac931-c571-5511-a448-19147c212dcb'::uuid, 'legacy_3', 1.0, null, 7),
  ('laestancia@pedidos.com', 2322, '67468185-d9b6-5a16-9459-75cac1410f4d'::uuid, 'legacy_5', 10.0, null, 8),
  ('laestancia@pedidos.com', 2322, '7fdd7c49-51ad-59eb-a1f4-4ec51cc66cc2'::uuid, 'legacy_5', 300.0, null, 9),
  ('laestancia@pedidos.com', 2322, '1ab8e90f-2b10-5caf-8092-ace65825273c'::uuid, 'legacy_5', 25.0, null, 10),
  ('laestancia@pedidos.com', 2322, '4f06cc36-da47-5c3f-a31e-159015520b80'::uuid, 'legacy_1', 3.0, null, 11),
  ('laestancia@pedidos.com', 2322, '9f015690-64dd-5f8f-941d-c32c74c9173d'::uuid, 'legacy_5', 75.0, null, 12),
  ('laestancia@pedidos.com', 2322, 'cd391667-5977-5972-96e9-bc9fdc30a065'::uuid, 'legacy_6', 6.0, null, 13),
  ('laestancia@pedidos.com', 2322, '5eaeef01-e394-5e99-876a-eea5c16e361c'::uuid, 'legacy_5', 10.0, null, 14),
  ('laestancia@pedidos.com', 2322, '84ecc5d2-2b2a-55bb-bd06-319b6faaabd0'::uuid, 'legacy_3', 2.0, null, 15),
  ('laestancia@pedidos.com', 2322, 'f6535d45-b018-556c-8925-e9272998a1bd'::uuid, 'legacy_5', 10.0, null, 16),
  ('laestancia@pedidos.com', 2322, 'aa3bb98d-bbc5-5a27-9760-73d4b8d0f2f3'::uuid, 'legacy_5', 10.0, null, 17),
  ('laestancia@pedidos.com', 2322, 'a55e5b4a-95fc-5932-8077-8d93ec003ef5'::uuid, 'legacy_5', 10.0, null, 18),
  ('laestancia@pedidos.com', 2322, 'eb12deef-0694-5740-b5b4-29982f43f487'::uuid, 'legacy_3', 2.0, null, 19),
  ('laestancia@pedidos.com', 2322, '3d87779f-22e9-5105-8194-0b2c9ff68827'::uuid, 'legacy_6', 1.0, null, 20),
  ('laestancia@pedidos.com', 2322, '9b462dd4-2fbe-55a5-9695-119f75a3e99f'::uuid, 'legacy_5', 10.0, null, 21),
  ('laestancia@pedidos.com', 2322, '3bb2df47-0dcc-50a2-91f1-372cce4318fb'::uuid, 'legacy_5', 75.0, null, 22),
  ('laestancia@pedidos.com', 2322, '80578006-d5c4-52df-91ba-3d8cbdcf1d07'::uuid, 'legacy_1', 6.0, null, 23),
  ('laestancia@pedidos.com', 2322, '3ec47df7-27bf-55a7-9dd0-630cf1170d7d'::uuid, 'legacy_6', 1.0, null, 24),
  ('laestancia@pedidos.com', 2322, '4b339b1b-dfc5-5585-9fac-40bcc38c6778'::uuid, 'legacy_5', 15.0, null, 25),
  ('nativos@pedidos.com', 2317, '2271fdc1-fe95-5d7c-a0a2-735792ca623b'::uuid, 'legacy_6', 1.0, null, 1),
  ('nativos@pedidos.com', 2317, 'abeac931-c571-5511-a448-19147c212dcb'::uuid, 'legacy_3', 1.0, null, 2),
  ('nativos@pedidos.com', 2317, '1e3617bc-c3c6-51f0-99b8-72db2fc2be20'::uuid, 'legacy_16', 1.0, null, 3),
  ('nativos@pedidos.com', 2317, '2522b097-8cc7-5617-ada5-d1c06db9c5bd'::uuid, 'legacy_3', 0.5, null, 4),
  ('nativos@pedidos.com', 2317, '873a8050-afbe-5f02-991a-443e39670a72'::uuid, 'legacy_3', 0.5, null, 5),
  ('nativos@pedidos.com', 2317, 'c7f1e812-2575-538e-a9e3-5f65167b83e9'::uuid, 'legacy_14', 2.0, null, 6),
  ('nativos@pedidos.com', 2317, '6adc0cd1-89ff-578c-8334-6399633b01e0'::uuid, 'legacy_6', 1.0, null, 7),
  ('nativos@pedidos.com', 2317, 'd9adaf7e-027d-55de-bbbe-5fdcee8f9002'::uuid, 'legacy_9', 1.0, null, 8),
  ('lailai@pedidos.com', 2319, '7d9552f7-3bfd-5410-b421-81a34d888d0d'::uuid, 'legacy_3', 1.0, null, 1),
  ('lailai@pedidos.com', 2319, '40b99e63-6a1f-5d1d-8e9c-f4fc6eb47603'::uuid, 'legacy_5', 6.0, null, 2),
  ('lailai@pedidos.com', 2319, '4f06cc36-da47-5c3f-a31e-159015520b80'::uuid, 'legacy_6', 0.5, null, 3),
  ('lailai@pedidos.com', 2319, '1e3617bc-c3c6-51f0-99b8-72db2fc2be20'::uuid, 'legacy_16', 1.0, null, 4),
  ('lailai@pedidos.com', 2319, 'a55e5b4a-95fc-5932-8077-8d93ec003ef5'::uuid, 'legacy_5', 36.0, null, 5),
  ('lailai@pedidos.com', 2319, '9b462dd4-2fbe-55a5-9695-119f75a3e99f'::uuid, 'legacy_5', 8.0, null, 6),
  ('lailai@pedidos.com', 2319, '80578006-d5c4-52df-91ba-3d8cbdcf1d07'::uuid, 'legacy_6', 0.5, null, 7),
  ('lailai@pedidos.com', 2319, '3ec47df7-27bf-55a7-9dd0-630cf1170d7d'::uuid, 'legacy_6', 1.5, null, 8),
  ('asin@pedidos.com', 1561, 'cd391667-5977-5972-96e9-bc9fdc30a065'::uuid, 'legacy_16', 4.0, null, 1),
  ('asin@pedidos.com', 1561, '1e3617bc-c3c6-51f0-99b8-72db2fc2be20'::uuid, 'legacy_16', 3.0, null, 2),
  ('asin@pedidos.com', 1561, '8fbd17a4-2856-57c9-8623-a76f45b4633a'::uuid, 'legacy_16', 1.0, null, 3),
  ('friends@pedidos.com', 2243, 'fa14c126-97c3-5cc2-a28d-a30ad7e74afc'::uuid, 'legacy_8', 5.0, null, 1),
  ('friends@pedidos.com', 2243, 'f2dc96fe-f89d-54d7-ae29-28e4189a67ce'::uuid, 'legacy_9', 50.0, null, 2),
  ('friends@pedidos.com', 2243, 'c9a455f6-7600-56bc-a7b5-668b32524f29'::uuid, 'legacy_8', 1.0, null, 3),
  ('friends@pedidos.com', 2243, 'a9f225cf-9056-56a1-a192-7e331bb27e73'::uuid, 'legacy_5', 10.0, null, 4),
  ('eventuald@pedidos.com', 1825, '40b99e63-6a1f-5d1d-8e9c-f4fc6eb47603'::uuid, 'legacy_5', 1.0, null, 1),
  ('eventuald@pedidos.com', 1825, '5189b1b1-36c7-5682-a65d-097c6a0531a2'::uuid, 'legacy_2', 1.0, null, 2),
  ('eventuald@pedidos.com', 1825, 'bb3ef268-bc40-5592-b4e9-a5ff8536b38d'::uuid, 'legacy_15', 0.5, null, 3),
  ('eventuald@pedidos.com', 1825, '2271fdc1-fe95-5d7c-a0a2-735792ca623b'::uuid, 'legacy_15', 0.5, null, 4),
  ('eventuald@pedidos.com', 1825, '175dac20-828b-5dfb-933b-4d87174d2303'::uuid, 'legacy_15', 1.0, null, 5),
  ('eventuald@pedidos.com', 1825, '1e3617bc-c3c6-51f0-99b8-72db2fc2be20'::uuid, 'legacy_15', 1.0, null, 6),
  ('eventuald@pedidos.com', 1825, '67468185-d9b6-5a16-9459-75cac1410f4d'::uuid, 'legacy_5', 1.0, null, 7),
  ('eventuald@pedidos.com', 1825, 'da6cf04b-776a-5466-a8f3-d1ee8e3bf9a7'::uuid, 'legacy_15', 1.0, null, 8),
  ('prevision@pedidos.com', 737, '43b4a34d-dbf0-5720-8f11-6b34b96b4845'::uuid, 'legacy_6', 2.0, null, 1),
  ('prevision@pedidos.com', 737, '0c91260b-bb1c-5364-a0fc-f3a11c03a376'::uuid, 'legacy_6', 3.0, null, 2),
  ('prevision@pedidos.com', 737, 'f675b46a-84de-5fbc-b1a2-eccffa6dd7a5'::uuid, 'legacy_6', 2.0, null, 3),
  ('prevision@pedidos.com', 737, '1e3617bc-c3c6-51f0-99b8-72db2fc2be20'::uuid, 'legacy_16', 2.0, null, 4),
  ('prevision@pedidos.com', 737, '3d87779f-22e9-5105-8194-0b2c9ff68827'::uuid, 'legacy_6', 1.0, null, 5),
  ('prevision@pedidos.com', 737, '3ec47df7-27bf-55a7-9dd0-630cf1170d7d'::uuid, 'legacy_6', 2.0, null, 6),
  ('prevision@pedidos.com', 737, '80578006-d5c4-52df-91ba-3d8cbdcf1d07'::uuid, 'legacy_1', 7.0, null, 7),
  ('prevision@pedidos.com', 737, 'b2de594d-7b31-5e99-9981-e5b7b6e754ba'::uuid, 'legacy_6', 2.0, null, 8),
  ('circus@pedidos.com', 2220, 'c7f1e812-2575-538e-a9e3-5f65167b83e9'::uuid, 'legacy_14', 2.0, null, 1),
  ('circus@pedidos.com', 2220, '63a49f01-2874-5ef8-a86d-02898f8f21f1'::uuid, 'legacy_14', 8.0, null, 2),
  ('burgerlab@pedidos.com', 2287, '43b4a34d-dbf0-5720-8f11-6b34b96b4845'::uuid, 'legacy_6', 1.0, null, 1),
  ('burgerlab@pedidos.com', 2287, '5bd7921f-7cdd-5b91-baf8-921283c05523'::uuid, 'legacy_5', 10.0, null, 2),
  ('tuesdayamerica@pedidos.com', 2326, '9b3142ac-b6ee-5466-be7f-b635cc5c1ba3'::uuid, 'legacy_1', 2.0, null, 1),
  ('tuesdayamerica@pedidos.com', 2326, '40b99e63-6a1f-5d1d-8e9c-f4fc6eb47603'::uuid, 'legacy_5', 12.0, null, 2),
  ('tuesdayamerica@pedidos.com', 2326, 'f675b46a-84de-5fbc-b1a2-eccffa6dd7a5'::uuid, 'legacy_1', 25.0, null, 3),
  ('tuesdayamerica@pedidos.com', 2326, '62bd4665-6758-5944-ab5d-039f0521be49'::uuid, 'legacy_4', 5.0, null, 4),
  ('tuesdayamerica@pedidos.com', 2326, '3eeddd28-737e-5d37-9641-f57a51eca47a'::uuid, 'legacy_3', 2.0, null, 5),
  ('tuesdayamerica@pedidos.com', 2326, 'abeac931-c571-5511-a448-19147c212dcb'::uuid, 'legacy_7', 6.0, null, 6),
  ('tuesdayamerica@pedidos.com', 2326, '1e3617bc-c3c6-51f0-99b8-72db2fc2be20'::uuid, 'legacy_1', 23.0, null, 7),
  ('tuesdayamerica@pedidos.com', 2326, 'aa3bb98d-bbc5-5a27-9760-73d4b8d0f2f3'::uuid, 'legacy_5', 15.0, null, 8),
  ('tuesdayamerica@pedidos.com', 2326, 'a55e5b4a-95fc-5932-8077-8d93ec003ef5'::uuid, 'legacy_5', 20.0, null, 9),
  ('tuesdayamerica@pedidos.com', 2326, '2522b097-8cc7-5617-ada5-d1c06db9c5bd'::uuid, 'legacy_7', 3.0, null, 10),
  ('tuesdayamerica@pedidos.com', 2326, 'bb3ef268-bc40-5592-b4e9-a5ff8536b38d'::uuid, 'legacy_14', 1.0, null, 11),
  ('tuesdayamerica@pedidos.com', 2326, '3ec47df7-27bf-55a7-9dd0-630cf1170d7d'::uuid, 'legacy_1', 10.0, null, 12),
  ('barsaranjuez@pedidos.com', 1384, 'f675b46a-84de-5fbc-b1a2-eccffa6dd7a5'::uuid, 'legacy_15', 0.5, null, 1),
  ('barsaranjuez@pedidos.com', 1384, 'a9f225cf-9056-56a1-a192-7e331bb27e73'::uuid, 'legacy_5', 3.0, null, 2),
  ('barsaranjuez@pedidos.com', 1384, '4f06cc36-da47-5c3f-a31e-159015520b80'::uuid, 'legacy_15', 0.5, null, 3),
  ('barsaranjuez@pedidos.com', 1384, 'bb3ef268-bc40-5592-b4e9-a5ff8536b38d'::uuid, 'legacy_15', 1.0, null, 4),
  ('barsaranjuez@pedidos.com', 1384, '1e9d0b9f-bef7-500d-ba86-d3c3a76d9df8'::uuid, 'legacy_5', 2.0, null, 5),
  ('vinopolis@pedidos.com', 2328, 'a1cb864f-9679-5f0d-9e1f-6c3f711e2e4d'::uuid, 'legacy_15', 1.0, null, 1),
  ('vinopolis@pedidos.com', 2328, '40b99e63-6a1f-5d1d-8e9c-f4fc6eb47603'::uuid, 'legacy_5', 2.0, null, 2),
  ('vinopolis@pedidos.com', 2328, 'f675b46a-84de-5fbc-b1a2-eccffa6dd7a5'::uuid, 'legacy_6', 2.0, null, 3),
  ('vinopolis@pedidos.com', 2328, '67468185-d9b6-5a16-9459-75cac1410f4d'::uuid, 'legacy_5', 2.0, null, 4),
  ('vinopolis@pedidos.com', 2328, '203d43de-4e52-5fa8-bebe-c7f5be107bd1'::uuid, 'legacy_17', 1.0, null, 5),
  ('vinopolis@pedidos.com', 2328, 'bacec98c-1087-584f-b220-68d15e0c0392'::uuid, 'legacy_22', 5.0, null, 6),
  ('vinopolis@pedidos.com', 2328, 'a9f225cf-9056-56a1-a192-7e331bb27e73'::uuid, 'legacy_5', 3.0, null, 7),
  ('vinopolis@pedidos.com', 2328, 'b2de594d-7b31-5e99-9981-e5b7b6e754ba'::uuid, 'legacy_6', 2.0, null, 8),
  ('vinopolis@pedidos.com', 2328, 'c544d136-3b3c-5446-ae09-1badd40f09d8'::uuid, 'legacy_1', 3.0, null, 9),
  ('vinopolis@pedidos.com', 2328, 'e21d29b6-1d5f-5291-8e98-6c4c4e53f55d'::uuid, 'legacy_5', 1.0, null, 10),
  ('vinopolis@pedidos.com', 2328, 'c7cb7144-f708-561b-98a1-50bce547d8f8'::uuid, 'legacy_27', 2.0, null, 11),
  ('vinopolis@pedidos.com', 2328, '80578006-d5c4-52df-91ba-3d8cbdcf1d07'::uuid, 'legacy_6', 0.5, null, 12),
  ('vinopolis@pedidos.com', 2328, '3ec47df7-27bf-55a7-9dd0-630cf1170d7d'::uuid, 'legacy_6', 1.0, null, 13),
  ('vinopolis@pedidos.com', 2328, '4b339b1b-dfc5-5585-9fac-40bcc38c6778'::uuid, 'legacy_5', 6.0, null, 14),
  ('vinopolis@pedidos.com', 2328, '1226a381-cc0c-5e2d-a195-56f0ad376394'::uuid, 'legacy_15', 5.0, null, 15),
  ('farolesensalada@pedidos.com', 2333, '7d9552f7-3bfd-5410-b421-81a34d888d0d'::uuid, 'legacy_2', 3.0, null, 1),
  ('farolesensalada@pedidos.com', 2333, '40b99e63-6a1f-5d1d-8e9c-f4fc6eb47603'::uuid, 'legacy_5', 5.0, null, 2),
  ('farolesensalada@pedidos.com', 2333, '8fbd17a4-2856-57c9-8623-a76f45b4633a'::uuid, 'legacy_15', 3.0, null, 3),
  ('farolesensalada@pedidos.com', 2333, 'f675b46a-84de-5fbc-b1a2-eccffa6dd7a5'::uuid, 'legacy_6', 0.5, null, 4),
  ('farolesensalada@pedidos.com', 2333, '67468185-d9b6-5a16-9459-75cac1410f4d'::uuid, 'legacy_5', 3.0, null, 5),
  ('farolesensalada@pedidos.com', 2333, 'e5add58d-8057-518c-93ea-fbe8f7b85104'::uuid, 'legacy_15', 0.5, null, 6),
  ('farolesensalada@pedidos.com', 2333, '5189b1b1-36c7-5682-a65d-097c6a0531a2'::uuid, 'legacy_2', 4.0, null, 7),
  ('farolesensalada@pedidos.com', 2333, 'a9f225cf-9056-56a1-a192-7e331bb27e73'::uuid, 'legacy_5', 4.0, null, 8),
  ('farolesensalada@pedidos.com', 2333, '1ab8e90f-2b10-5caf-8092-ace65825273c'::uuid, 'legacy_5', 50.0, null, 9),
  ('farolesensalada@pedidos.com', 2333, '4f06cc36-da47-5c3f-a31e-159015520b80'::uuid, 'legacy_15', 2.0, null, 10),
  ('farolesensalada@pedidos.com', 2333, 'cb395e97-2ba3-558c-bf0b-e15b4835376c'::uuid, 'legacy_5', 4.0, null, 11),
  ('farolesensalada@pedidos.com', 2333, '01581cca-5784-5196-8541-05cb7e733bdd'::uuid, 'legacy_5', 6.0, null, 12),
  ('farolesensalada@pedidos.com', 2333, '9f015690-64dd-5f8f-941d-c32c74c9173d'::uuid, 'legacy_15', 1.0, null, 13),
  ('farolesensalada@pedidos.com', 2333, '16ad819b-236d-5788-aa61-0bd596c34f74'::uuid, 'legacy_15', 1.5, null, 14),
  ('farolesensalada@pedidos.com', 2333, '775e29a8-e110-5518-a5db-54a8b85bdc93'::uuid, 'legacy_6', 0.5, null, 15),
  ('farolesensalada@pedidos.com', 2333, '5eaeef01-e394-5e99-876a-eea5c16e361c'::uuid, 'legacy_15', 1.0, null, 16),
  ('farolesensalada@pedidos.com', 2333, '5bd7921f-7cdd-5b91-baf8-921283c05523'::uuid, 'legacy_5', 8.0, null, 17),
  ('farolesensalada@pedidos.com', 2333, '87a4b4b4-1cbe-5dd2-ba53-dd69edfe26aa'::uuid, 'legacy_15', 1.0, null, 18),
  ('farolesensalada@pedidos.com', 2333, '86efc415-2192-54cf-befe-659f0eb6b376'::uuid, 'legacy_5', 3.0, null, 19),
  ('farolesensalada@pedidos.com', 2333, '2522b097-8cc7-5617-ada5-d1c06db9c5bd'::uuid, 'legacy_7', 3.0, null, 20),
  ('farolesensalada@pedidos.com', 2333, '3d87779f-22e9-5105-8194-0b2c9ff68827'::uuid, 'legacy_15', 3.0, null, 21),
  ('farolesensalada@pedidos.com', 2333, '9b462dd4-2fbe-55a5-9695-119f75a3e99f'::uuid, 'legacy_5', 3.0, null, 22),
  ('farolesensalada@pedidos.com', 2333, 'bb3ef268-bc40-5592-b4e9-a5ff8536b38d'::uuid, 'legacy_14', 1.0, null, 23),
  ('farolesensalada@pedidos.com', 2333, '3bb2df47-0dcc-50a2-91f1-372cce4318fb'::uuid, 'legacy_15', 1.0, null, 24),
  ('farolesensalada@pedidos.com', 2333, '80578006-d5c4-52df-91ba-3d8cbdcf1d07'::uuid, 'legacy_15', 1.0, null, 25),
  ('farolesensalada@pedidos.com', 2333, '4b339b1b-dfc5-5585-9fac-40bcc38c6778'::uuid, 'legacy_15', 1.0, null, 26),
  ('farolesensalada@pedidos.com', 2333, '15fb0d96-3cb7-5a67-b898-6c9cbf742d07'::uuid, 'legacy_6', 1.0, null, 27),
  ('farolesensalada@pedidos.com', 2333, '3ec47df7-27bf-55a7-9dd0-630cf1170d7d'::uuid, 'legacy_15', 2.0, null, 28),
  ('farolesensalada@pedidos.com', 2333, 'e956334b-aa83-598c-9a23-7af688f071cd'::uuid, 'legacy_15', 1.0, null, 29),
  ('parrilla@pedidos.com', 2320, '5ab45bbe-e22d-541d-ae07-425e19196156'::uuid, 'legacy_19', 10.0, null, 1),
  ('parrilla@pedidos.com', 2320, '7d9552f7-3bfd-5410-b421-81a34d888d0d'::uuid, 'legacy_7', 10.0, null, 2),
  ('parrilla@pedidos.com', 2320, '40b99e63-6a1f-5d1d-8e9c-f4fc6eb47603'::uuid, 'legacy_5', 7.0, null, 3),
  ('parrilla@pedidos.com', 2320, '6f36a381-3234-5d54-867e-de39ba8d2f01'::uuid, 'legacy_7', 10.0, null, 4),
  ('parrilla@pedidos.com', 2320, '8466dfcb-53c9-5843-b5c6-68cc0f7289d8'::uuid, 'legacy_5', 4.0, null, 5),
  ('parrilla@pedidos.com', 2320, 'e92f6e62-7495-5007-8ba5-08afc7bbf2a1'::uuid, 'legacy_7', 10.0, null, 6),
  ('parrilla@pedidos.com', 2320, '1ab8e90f-2b10-5caf-8092-ace65825273c'::uuid, 'legacy_5', 25.0, null, 7),
  ('parrilla@pedidos.com', 2320, '4f06cc36-da47-5c3f-a31e-159015520b80'::uuid, 'legacy_15', 1.0, null, 8),
  ('parrilla@pedidos.com', 2320, '7a326343-b0ad-52fb-a128-0f72680413ed'::uuid, 'legacy_1', 2.0, null, 9),
  ('parrilla@pedidos.com', 2320, '1e9d0b9f-bef7-500d-ba86-d3c3a76d9df8'::uuid, 'legacy_5', 3.0, null, 10),
  ('parrilla@pedidos.com', 2320, 'b2de594d-7b31-5e99-9981-e5b7b6e754ba'::uuid, 'legacy_6', 3.0, null, 11),
  ('parrilla@pedidos.com', 2320, '775e29a8-e110-5518-a5db-54a8b85bdc93'::uuid, 'legacy_6', 1.0, null, 12),
  ('parrilla@pedidos.com', 2320, 'aa3bb98d-bbc5-5a27-9760-73d4b8d0f2f3'::uuid, 'legacy_5', 4.0, null, 13),
  ('parrilla@pedidos.com', 2320, 'a55e5b4a-95fc-5932-8077-8d93ec003ef5'::uuid, 'legacy_5', 3.0, null, 14),
  ('parrilla@pedidos.com', 2320, '5bd7921f-7cdd-5b91-baf8-921283c05523'::uuid, 'legacy_5', 8.0, null, 15),
  ('parrilla@pedidos.com', 2320, '0ce5f3c1-2ca1-59ef-b3c1-9c2f549471d9'::uuid, 'legacy_11', 1.0, null, 16),
  ('parrilla@pedidos.com', 2320, 'c544d136-3b3c-5446-ae09-1badd40f09d8'::uuid, 'legacy_1', 2.0, null, 17),
  ('parrilla@pedidos.com', 2320, '2522b097-8cc7-5617-ada5-d1c06db9c5bd'::uuid, 'legacy_7', 6.0, null, 18),
  ('parrilla@pedidos.com', 2320, '570608c5-b07d-59d6-bf2b-e0bffec8edb8'::uuid, 'legacy_6', 4.0, null, 19),
  ('parrilla@pedidos.com', 2320, '3ec47df7-27bf-55a7-9dd0-630cf1170d7d'::uuid, 'legacy_15', 1.0, null, 20),
  ('parrilla@pedidos.com', 2320, '8ade32be-6009-5fb2-a612-2fad5361378e'::uuid, 'legacy_6', 2.0, null, 21),
  ('parrilla@pedidos.com', 2320, 'ede9265e-54d0-529c-a117-7286ddf3d383'::uuid, 'legacy_15', 1.0, null, 22),
  ('parrilla@pedidos.com', 2320, 'a9acca92-3de8-5a7e-a33e-540428dd2985'::uuid, 'legacy_15', 1.0, null, 23),
  ('parrilla@pedidos.com', 2320, 'd0a9b512-43f3-5e19-b76a-da3741afca61'::uuid, 'legacy_9', 1.0, null, 24),
  ('parrilla@pedidos.com', 2320, '9a31410a-8b49-5e26-ab8e-cf59c39d550e'::uuid, 'legacy_9', 1.0, null, 25),
  ('parrilla@pedidos.com', 2320, 'a497bf9f-d27a-5d10-a46e-72996b6a0214'::uuid, 'legacy_1', 1.0, null, 26),
  ('parrilla@pedidos.com', 2320, 'ce2d0674-8379-5e4f-bb30-32c23b4a4d25'::uuid, 'legacy_2', 10.0, null, 27),
  ('parrilla@pedidos.com', 2320, 'd5fc53a4-1a91-57b6-af75-2367ee5ba9ed'::uuid, 'legacy_5', 1.0, null, 28),
  ('parrilla@pedidos.com', 2320, 'b1389b59-bd7b-5a19-b142-b17706e3d924'::uuid, 'legacy_17', 1.0, null, 29),
  ('parrilla@pedidos.com', 2320, '0ecf4651-6303-5c22-a855-efd60b23e201'::uuid, 'legacy_17', 1.0, null, 30),
  ('parrilla@pedidos.com', 2320, 'dc51350e-4bfb-5245-97eb-1c24d01854d4'::uuid, 'legacy_5', 50.0, null, 31),
  ('pizzaluna@pedidos.com', 2313, '5bd7921f-7cdd-5b91-baf8-921283c05523'::uuid, 'legacy_5', 2.0, null, 1),
  ('pizzaluna@pedidos.com', 2313, 'bb3ef268-bc40-5592-b4e9-a5ff8536b38d'::uuid, 'legacy_14', 1.0, null, 2),
  ('eventualb@pedidos.com', 2334, 'a1cb864f-9679-5f0d-9e1f-6c3f711e2e4d'::uuid, 'legacy_15', 1.0, null, 1),
  ('eventualb@pedidos.com', 2334, 'abeac931-c571-5511-a448-19147c212dcb'::uuid, 'legacy_7', 10.0, null, 2),
  ('eventualb@pedidos.com', 2334, 'e92f6e62-7495-5007-8ba5-08afc7bbf2a1'::uuid, 'legacy_7', 10.0, null, 3),
  ('eventualb@pedidos.com', 2334, '1ab8e90f-2b10-5caf-8092-ace65825273c'::uuid, 'legacy_5', 250.0, null, 4),
  ('eventualb@pedidos.com', 2334, '4f06cc36-da47-5c3f-a31e-159015520b80'::uuid, 'legacy_6', 1.0, null, 5),
  ('eventualb@pedidos.com', 2334, '2522b097-8cc7-5617-ada5-d1c06db9c5bd'::uuid, 'legacy_7', 10.0, null, 6),
  ('eventualb@pedidos.com', 2334, '873a8050-afbe-5f02-991a-443e39670a72'::uuid, 'legacy_7', 10.0, null, 7),
  ('emblema@pedidos.com', 2299, '7d9552f7-3bfd-5410-b421-81a34d888d0d'::uuid, 'legacy_7', 5.0, null, 1),
  ('emblema@pedidos.com', 2299, 'a0c7ac03-f28d-5b3a-9873-f4e69658c9b8'::uuid, 'legacy_1', 0.5, null, 2),
  ('emblema@pedidos.com', 2299, 'e72e525f-9294-52bc-b118-13e4c827c683'::uuid, 'legacy_4', 2.0, null, 3),
  ('emblema@pedidos.com', 2299, 'fb11de4a-7882-5d54-a5fe-ebde13535489'::uuid, 'legacy_5', 80.0, null, 4),
  ('emblema@pedidos.com', 2299, 'da6cf04b-776a-5466-a8f3-d1ee8e3bf9a7'::uuid, 'legacy_6', 5.0, null, 5),
  ('emblema@pedidos.com', 2299, '1ab8e90f-2b10-5caf-8092-ace65825273c'::uuid, 'legacy_5', 100.0, null, 6),
  ('emblema@pedidos.com', 2299, '4f06cc36-da47-5c3f-a31e-159015520b80'::uuid, 'legacy_15', 2.0, null, 7),
  ('emblema@pedidos.com', 2299, 'b2de594d-7b31-5e99-9981-e5b7b6e754ba'::uuid, 'legacy_6', 4.0, null, 8),
  ('emblema@pedidos.com', 2299, '775e29a8-e110-5518-a5db-54a8b85bdc93'::uuid, 'legacy_15', 1.0, null, 9),
  ('emblema@pedidos.com', 2299, '84ecc5d2-2b2a-55bb-bd06-319b6faaabd0'::uuid, 'legacy_7', 5.0, null, 10),
  ('emblema@pedidos.com', 2299, 'bb3ef268-bc40-5592-b4e9-a5ff8536b38d'::uuid, 'legacy_6', 2.0, null, 11),
  ('emblema@pedidos.com', 2299, '80578006-d5c4-52df-91ba-3d8cbdcf1d07'::uuid, 'legacy_1', 1.0, null, 12),
  ('emblema@pedidos.com', 2299, '3ec47df7-27bf-55a7-9dd0-630cf1170d7d'::uuid, 'legacy_1', 2.0, null, 13),
  ('capresso@pedidos.com', 2325, '8f3dcf72-1086-552a-a12a-b1819d4aaf68'::uuid, 'legacy_5', 100.0, null, 1),
  ('capresso@pedidos.com', 2325, 'a8e72aad-7819-5d7a-aa70-9755babbe1cf'::uuid, 'legacy_5', 3.0, null, 2),
  ('capresso@pedidos.com', 2325, 'bb3ef268-bc40-5592-b4e9-a5ff8536b38d'::uuid, 'legacy_14', 1.0, null, 3),
  ('capresso@pedidos.com', 2325, 'c7f1e812-2575-538e-a9e3-5f65167b83e9'::uuid, 'legacy_14', 1.0, null, 4),
  ('lemura@pedidos.com', 1423, 'a1cb864f-9679-5f0d-9e1f-6c3f711e2e4d'::uuid, 'legacy_7', 10.0, null, 1),
  ('lemura@pedidos.com', 1423, '84ecc5d2-2b2a-55bb-bd06-319b6faaabd0'::uuid, 'legacy_7', 5.0, null, 2),
  ('lemura@pedidos.com', 1423, 'b55bb5c9-6e1b-5f6b-9475-7eaff0b42775'::uuid, 'legacy_9', 20.0, null, 3),
  ('lemura@pedidos.com', 1423, 'c544d136-3b3c-5446-ae09-1badd40f09d8'::uuid, 'legacy_1', 0.5, null, 4),
  ('lemura@pedidos.com', 1423, '9e8cfa06-0709-5841-b13c-33fa4e1edabe'::uuid, 'legacy_15', 1.0, null, 5),
  ('lemura@pedidos.com', 1423, 'f2e2a7bf-1fac-5515-ae21-2da1dba5044f'::uuid, 'legacy_15', 1.0, null, 6),
  ('lemura@pedidos.com', 1423, '1226a381-cc0c-5e2d-a195-56f0ad376394'::uuid, 'legacy_15', 1.0, null, 7),
  ('criadero@pedidos.com', 2341, 'da0b657d-762a-57d8-8257-f1b1f75481ad'::uuid, 'legacy_8', 20.0, null, 1),
  ('burgerhousemelchor@pedidos.com', 2238, '1ab8e90f-2b10-5caf-8092-ace65825273c'::uuid, 'legacy_5', 600.0, null, 1),
  ('burgerhousemelchor@pedidos.com', 2238, '9b3142ac-b6ee-5466-be7f-b635cc5c1ba3'::uuid, 'legacy_1', 2.0, null, 2),
  ('portavenezia@pedidos.com', 2294, '422062e4-684f-5d4a-ab2c-16d252d87423'::uuid, 'legacy_1', 1.5, null, 1),
  ('portavenezia@pedidos.com', 2294, '6e6120b2-33fb-5070-84ac-335f7cde2d1b'::uuid, 'legacy_3', 1.0, null, 2),
  ('portavenezia@pedidos.com', 2294, 'da0b657d-762a-57d8-8257-f1b1f75481ad'::uuid, 'legacy_8', 1.0, null, 3),
  ('portavenezia@pedidos.com', 2294, 'f675b46a-84de-5fbc-b1a2-eccffa6dd7a5'::uuid, 'legacy_5', 10.0, null, 4),
  ('portavenezia@pedidos.com', 2294, '62bd4665-6758-5944-ab5d-039f0521be49'::uuid, 'legacy_1', 4.0, null, 5),
  ('portavenezia@pedidos.com', 2294, '1ab8e90f-2b10-5caf-8092-ace65825273c'::uuid, 'legacy_5', 25.0, null, 6),
  ('portavenezia@pedidos.com', 2294, '84ecc5d2-2b2a-55bb-bd06-319b6faaabd0'::uuid, 'legacy_7', 2.0, null, 7),
  ('portavenezia@pedidos.com', 2294, '2d8b9297-d3cf-5b33-8e42-5acd8ddc614a'::uuid, 'legacy_5', 5.0, null, 8),
  ('portavenezia@pedidos.com', 2294, 'e7062ad0-605f-532c-8cb4-d8418cfaeeab'::uuid, 'legacy_14', 2.0, null, 9),
  ('portavenezia@pedidos.com', 2294, 'c7f1e812-2575-538e-a9e3-5f65167b83e9'::uuid, 'legacy_14', 1.0, null, 10),
  ('devega@pedidos.com', 149, '4b339b1b-dfc5-5585-9fac-40bcc38c6778'::uuid, 'legacy_7', 30.0, null, 1),
  ('devega@pedidos.com', 149, '6b451b1d-80ee-5139-be4e-40da6cabbe14'::uuid, 'legacy_6', 0.5, null, 2),
  ('devega@pedidos.com', 149, 'a1cb864f-9679-5f0d-9e1f-6c3f711e2e4d'::uuid, 'legacy_6', 0.5, null, 3),
  ('devega@pedidos.com', 149, 'bb3ef268-bc40-5592-b4e9-a5ff8536b38d'::uuid, 'legacy_14', 1.0, null, 4),
  ('devega@pedidos.com', 149, '3d87779f-22e9-5105-8194-0b2c9ff68827'::uuid, 'legacy_6', 0.5, null, 5),
  ('devega@pedidos.com', 149, '43b4a34d-dbf0-5720-8f11-6b34b96b4845'::uuid, 'legacy_16', 1.0, null, 6),
  ('devega@pedidos.com', 149, 'da6cf04b-776a-5466-a8f3-d1ee8e3bf9a7'::uuid, 'legacy_15', 1.5, null, 7),
  ('devega@pedidos.com', 149, 'd8bcf458-124e-504b-928d-a3f3a0b5f02f'::uuid, 'legacy_15', 1.5, null, 8),
  ('devega@pedidos.com', 149, '80578006-d5c4-52df-91ba-3d8cbdcf1d07'::uuid, 'legacy_15', 1.5, null, 9),
  ('micos@pedidos.com', 1994, 'dfbcd0d3-29ae-56a3-910f-bd566b045d3a'::uuid, 'legacy_1', 12.0, null, 1),
  ('sbarro@pedidos.com', 2338, '7a9d2cc5-2dbe-5b46-af2c-0e5f9b58e5b8'::uuid, 'legacy_26', 1.0, null, 1),
  ('sbarro@pedidos.com', 2338, '5189b1b1-36c7-5682-a65d-097c6a0531a2'::uuid, 'legacy_2', 2.0, null, 2),
  ('sbarro@pedidos.com', 2338, '1ab8e90f-2b10-5caf-8092-ace65825273c'::uuid, 'legacy_5', 50.0, null, 3),
  ('sbarro@pedidos.com', 2338, 'c3184d8f-d4dc-56fa-83dd-92cd2faaacbd'::uuid, 'legacy_1', 1.0, null, 4),
  ('sbarro@pedidos.com', 2338, '1e3617bc-c3c6-51f0-99b8-72db2fc2be20'::uuid, 'legacy_15', 0.5, null, 5),
  ('sbarro@pedidos.com', 2338, '9b462dd4-2fbe-55a5-9695-119f75a3e99f'::uuid, 'legacy_5', 1.0, null, 6),
  ('sbarro@pedidos.com', 2338, 'bb3ef268-bc40-5592-b4e9-a5ff8536b38d'::uuid, 'legacy_15', 0.5, null, 7),
  ('sbarro@pedidos.com', 2338, '63a49f01-2874-5ef8-a86d-02898f8f21f1'::uuid, 'legacy_14', 3.0, null, 8),
  ('sbarro@pedidos.com', 2338, '3ec47df7-27bf-55a7-9dd0-630cf1170d7d'::uuid, 'legacy_15', 0.5, null, 9),
  ('sbarro@pedidos.com', 2338, '3d87779f-22e9-5105-8194-0b2c9ff68827'::uuid, 'legacy_1', 2.0, null, 10),
  ('sbarro@pedidos.com', 2338, 'd8bcf458-124e-504b-928d-a3f3a0b5f02f'::uuid, 'legacy_1', 1.0, null, 11),
  ('sbarro@pedidos.com', 2338, '078a0617-9ba3-56ce-a832-afaea280d8bf'::uuid, 'legacy_1', 11.0, null, 12),
  ('sbarro@pedidos.com', 2338, 'b018f4fd-99d4-5788-9fad-c73753927ac9'::uuid, 'legacy_5', 30.0, null, 13),
  ('sosprado@pedidos.com', 2297, 'd9adaf7e-027d-55de-bbbe-5fdcee8f9002'::uuid, 'legacy_12', 3.0, null, 1),
  ('sosprado@pedidos.com', 2297, 'f675b46a-84de-5fbc-b1a2-eccffa6dd7a5'::uuid, 'legacy_5', 6.0, null, 2),
  ('sosprado@pedidos.com', 2297, '43b4a34d-dbf0-5720-8f11-6b34b96b4845'::uuid, 'legacy_5', 5.0, null, 3),
  ('sosprado@pedidos.com', 2297, '3eeddd28-737e-5d37-9641-f57a51eca47a'::uuid, 'legacy_3', 2.0, null, 4),
  ('sosprado@pedidos.com', 2297, '77bcbfdf-b7ae-5363-8549-ca1ec0754aa4'::uuid, 'legacy_9', 1.0, null, 5),
  ('sosprado@pedidos.com', 2297, '5768cc66-be5c-58ee-9ef6-e474a08e9901'::uuid, 'legacy_7', 5.0, null, 6),
  ('sosprado@pedidos.com', 2297, '1ab8e90f-2b10-5caf-8092-ace65825273c'::uuid, 'legacy_5', 150.0, null, 7),
  ('sosprado@pedidos.com', 2297, '4f06cc36-da47-5c3f-a31e-159015520b80'::uuid, 'legacy_15', 1.5, null, 8),
  ('sosprado@pedidos.com', 2297, '8f3dcf72-1086-552a-a12a-b1819d4aaf68'::uuid, 'legacy_5', 5.0, null, 9),
  ('sosprado@pedidos.com', 2297, '84ecc5d2-2b2a-55bb-bd06-319b6faaabd0'::uuid, 'legacy_3', 1.0, null, 10),
  ('sosprado@pedidos.com', 2297, 'a55e5b4a-95fc-5932-8077-8d93ec003ef5'::uuid, 'legacy_5', 30.0, null, 11),
  ('sosprado@pedidos.com', 2297, '2522b097-8cc7-5617-ada5-d1c06db9c5bd'::uuid, 'legacy_3', 1.0, null, 12),
  ('sosprado@pedidos.com', 2297, 'bb3ef268-bc40-5592-b4e9-a5ff8536b38d'::uuid, 'legacy_6', 1.0, null, 13),
  ('chifabao@pedidos.com', 2310, '40b99e63-6a1f-5d1d-8e9c-f4fc6eb47603'::uuid, 'legacy_5', 8.0, null, 1),
  ('chifabao@pedidos.com', 2310, '43b4a34d-dbf0-5720-8f11-6b34b96b4845'::uuid, 'legacy_6', 2.0, null, 2),
  ('chifabao@pedidos.com', 2310, '6f36a381-3234-5d54-867e-de39ba8d2f01'::uuid, 'legacy_3', 1.0, null, 3),
  ('chifabao@pedidos.com', 2310, '4f06cc36-da47-5c3f-a31e-159015520b80'::uuid, 'legacy_15', 1.0, null, 4),
  ('chifabao@pedidos.com', 2310, 'a55e5b4a-95fc-5932-8077-8d93ec003ef5'::uuid, 'legacy_6', 0.5, null, 5),
  ('chifabao@pedidos.com', 2310, '9b462dd4-2fbe-55a5-9695-119f75a3e99f'::uuid, 'legacy_5', 10.0, null, 6),
  ('chifabao@pedidos.com', 2310, '4b339b1b-dfc5-5585-9fac-40bcc38c6778'::uuid, 'legacy_5', 2.0, null, 7),
  ('chifabao@pedidos.com', 2310, '5bd7921f-7cdd-5b91-baf8-921283c05523'::uuid, 'legacy_5', 10.0, null, 8),
  ('chifabao@pedidos.com', 2310, '1ab8e90f-2b10-5caf-8092-ace65825273c'::uuid, 'legacy_5', 25.0, null, 9),
  ('criaderonoche@pedidos.com', 2308, '40b99e63-6a1f-5d1d-8e9c-f4fc6eb47603'::uuid, 'legacy_5', 30.0, null, 1),
  ('criaderonoche@pedidos.com', 2308, '62bd4665-6758-5944-ab5d-039f0521be49'::uuid, 'legacy_4', 3.0, null, 2),
  ('criaderonoche@pedidos.com', 2308, '3eeddd28-737e-5d37-9641-f57a51eca47a'::uuid, 'legacy_3', 2.0, null, 3),
  ('criaderonoche@pedidos.com', 2308, '529bd434-8da9-5db3-8441-e41d2ad148ae'::uuid, 'legacy_2', 10.0, null, 4),
  ('criaderonoche@pedidos.com', 2308, 'fd977084-7c02-5b08-9b43-6cd276158e8b'::uuid, 'legacy_2', 1.0, null, 5),
  ('criaderonoche@pedidos.com', 2308, '02fede48-9aec-5348-8b3d-582e87fc9a94'::uuid, 'legacy_17', 1.0, null, 6),
  ('criaderonoche@pedidos.com', 2308, 'ce2d0674-8379-5e4f-bb30-32c23b4a4d25'::uuid, 'legacy_2', 10.0, null, 7),
  ('criaderonoche@pedidos.com', 2308, '98240fd3-07b2-5862-8e30-470a503446f6'::uuid, 'legacy_5', 250.0, null, 8),
  ('criaderonoche@pedidos.com', 2308, 'c389763b-f7a3-57fa-89e7-1da3e765a0e1'::uuid, 'legacy_17', 5.0, null, 9),
  ('criaderonoche@pedidos.com', 2308, '25f5accc-7bd0-5af1-ab87-b27e36f976b9'::uuid, 'legacy_5', 10.0, null, 10),
  ('criaderonoche@pedidos.com', 2308, '8f3dcf72-1086-552a-a12a-b1819d4aaf68'::uuid, 'legacy_5', 25.0, null, 11),
  ('criaderonoche@pedidos.com', 2308, '5eaeef01-e394-5e99-876a-eea5c16e361c'::uuid, 'legacy_6', 1.0, null, 12),
  ('criaderonoche@pedidos.com', 2308, 'aa3bb98d-bbc5-5a27-9760-73d4b8d0f2f3'::uuid, 'legacy_5', 6.0, null, 13),
  ('criaderonoche@pedidos.com', 2308, '4c06de5d-8676-559d-ab38-b6c3b01dbc41'::uuid, 'legacy_5', 10.0, null, 14),
  ('criaderonoche@pedidos.com', 2308, '8fc0fd7c-95b7-5fa8-a82c-c7c01e6ff34a'::uuid, 'legacy_3', 1.0, null, 15),
  ('criaderonoche@pedidos.com', 2308, 'f01e09ff-dd04-5272-9c92-a516f8e61441'::uuid, 'legacy_31', 1.0, null, 16),
  ('criaderonoche@pedidos.com', 2308, '3bad354d-5c7d-58af-a1bd-044f795cec0f'::uuid, 'legacy_17', 1.0, null, 17),
  ('criaderonoche@pedidos.com', 2308, '3f838ffe-0860-5271-b5f4-debd33d5d945'::uuid, 'legacy_1', 2.0, null, 18),
  ('criaderonoche@pedidos.com', 2308, '1ab8e90f-2b10-5caf-8092-ace65825273c'::uuid, 'legacy_5', 80.0, null, 19),
  ('criaderonoche@pedidos.com', 2308, 'a9f225cf-9056-56a1-a192-7e331bb27e73'::uuid, 'legacy_5', 30.0, null, 20),
  ('criaderonoche@pedidos.com', 2308, '0ce5f3c1-2ca1-59ef-b3c1-9c2f549471d9'::uuid, 'legacy_11', 5.0, null, 21),
  ('criaderonoche@pedidos.com', 2308, 'f296a72c-84c3-510d-8be2-44aad94b9ae6'::uuid, 'legacy_5', 6.0, null, 22),
  ('criaderonoche@pedidos.com', 2308, 'bf099ffa-5355-51e0-9df4-8adddbba7168'::uuid, 'legacy_6', 2.0, null, 23),
  ('criaderonoche@pedidos.com', 2308, '77bcbfdf-b7ae-5363-8549-ca1ec0754aa4'::uuid, 'legacy_9', 1.0, null, 24),
  ('view@pedidos.com', 677, '3ec47df7-27bf-55a7-9dd0-630cf1170d7d'::uuid, 'legacy_9', 2.0, null, 1),
  ('view@pedidos.com', 677, '4f06cc36-da47-5c3f-a31e-159015520b80'::uuid, 'legacy_9', 1.0, null, 2),
  ('barsvillarroel@pedidos.com', 1586, 'f675b46a-84de-5fbc-b1a2-eccffa6dd7a5'::uuid, 'legacy_15', 1.0, null, 1),
  ('barsvillarroel@pedidos.com', 1586, 'a9f225cf-9056-56a1-a192-7e331bb27e73'::uuid, 'legacy_5', 3.0, null, 2),
  ('barsvillarroel@pedidos.com', 1586, '4f06cc36-da47-5c3f-a31e-159015520b80'::uuid, 'legacy_15', 0.5, null, 3),
  ('barsvillarroel@pedidos.com', 1586, '5bd7921f-7cdd-5b91-baf8-921283c05523'::uuid, 'legacy_5', 2.0, null, 4),
  ('barsvillarroel@pedidos.com', 1586, 'bb3ef268-bc40-5592-b4e9-a5ff8536b38d'::uuid, 'legacy_15', 1.0, null, 5),
  ('sbarrohuper@pedidos.com', 2339, '6e6120b2-33fb-5070-84ac-335f7cde2d1b'::uuid, 'legacy_3', 0.5, null, 1),
  ('sbarrohuper@pedidos.com', 2339, 'd8bcf458-124e-504b-928d-a3f3a0b5f02f'::uuid, 'legacy_1', 1.0, null, 2),
  ('sbarrohuper@pedidos.com', 2339, 'f675b46a-84de-5fbc-b1a2-eccffa6dd7a5'::uuid, 'legacy_1', 1.0, null, 3),
  ('sbarrohuper@pedidos.com', 2339, '43b4a34d-dbf0-5720-8f11-6b34b96b4845'::uuid, 'legacy_1', 1.0, null, 4),
  ('sbarrohuper@pedidos.com', 2339, '5189b1b1-36c7-5682-a65d-097c6a0531a2'::uuid, 'legacy_2', 3.0, null, 5),
  ('sbarrohuper@pedidos.com', 2339, '1ab8e90f-2b10-5caf-8092-ace65825273c'::uuid, 'legacy_5', 100.0, null, 6),
  ('sbarrohuper@pedidos.com', 2339, 'd0a9b512-43f3-5e19-b76a-da3741afca61'::uuid, 'legacy_1', 1.0, null, 7),
  ('sbarrohuper@pedidos.com', 2339, '1e3617bc-c3c6-51f0-99b8-72db2fc2be20'::uuid, 'legacy_1', 4.0, null, 8),
  ('sbarrohuper@pedidos.com', 2339, 'bb3ef268-bc40-5592-b4e9-a5ff8536b38d'::uuid, 'legacy_1', 2.0, null, 9),
  ('sbarrohuper@pedidos.com', 2339, '7a9d2cc5-2dbe-5b46-af2c-0e5f9b58e5b8'::uuid, 'legacy_26', 1.0, null, 10),
  ('eventuala@pedidos.com', 2331, 'e92f6e62-7495-5007-8ba5-08afc7bbf2a1'::uuid, 'legacy_3', 0.5, null, 1),
  ('eventuala@pedidos.com', 2331, '1ab8e90f-2b10-5caf-8092-ace65825273c'::uuid, 'legacy_5', 150.0, null, 2),
  ('eventuala@pedidos.com', 2331, '5eaeef01-e394-5e99-876a-eea5c16e361c'::uuid, 'legacy_7', 5.0, null, 3),
  ('eventuala@pedidos.com', 2331, '59ce9727-0ae1-5086-ab18-49416525c283'::uuid, 'legacy_5', 50.0, null, 4),
  ('eventuala@pedidos.com', 2331, 'e77a55e8-9b3d-5973-8c6b-66948fcfa2e4'::uuid, 'legacy_14', 24.0, null, 5),
  ('farolescocina@pedidos.com', 2335, 'ede9265e-54d0-529c-a117-7286ddf3d383'::uuid, 'legacy_15', 1.0, null, 1),
  ('farolescocina@pedidos.com', 2335, 'e8bb53ff-cefb-509f-94eb-3943489538a3'::uuid, 'legacy_6', 0.5, null, 2),
  ('farolescocina@pedidos.com', 2335, 'd8bcf458-124e-504b-928d-a3f3a0b5f02f'::uuid, 'legacy_15', 0.5, null, 3),
  ('farolescocina@pedidos.com', 2335, 'cd391667-5977-5972-96e9-bc9fdc30a065'::uuid, 'legacy_6', 2.0, null, 4),
  ('farolescocina@pedidos.com', 2335, 'a55e5b4a-95fc-5932-8077-8d93ec003ef5'::uuid, 'legacy_15', 1.0, null, 5),
  ('farolescocina@pedidos.com', 2335, 'c544d136-3b3c-5446-ae09-1badd40f09d8'::uuid, 'legacy_1', 2.0, null, 6),
  ('farolescocina@pedidos.com', 2335, 'f2742ff9-ccc1-5468-b634-e920506abbf8'::uuid, 'legacy_15', 1.0, null, 7),
  ('eventualc@pedidos.com', 2290, '7a5bb57d-b449-544c-ba54-e2ef45ade2fa'::uuid, 'legacy_15', 1.0, null, 1),
  ('eventualc@pedidos.com', 2290, '775e29a8-e110-5518-a5db-54a8b85bdc93'::uuid, 'legacy_15', 1.0, null, 2),
  ('zomay@pedidos.com', 2145, 'b9be93b5-0827-5b52-b853-ccd489f0b41c'::uuid, 'legacy_15', 1.0, null, 1),
  ('zomay@pedidos.com', 2145, '6adeb837-7a46-5d1a-851e-98cc97cff45e'::uuid, 'legacy_15', 1.0, null, 2),
  ('zomay@pedidos.com', 2145, '4128c971-910a-5ace-94eb-3055f8deb433'::uuid, 'legacy_15', 1.0, null, 3),
  ('zomay@pedidos.com', 2145, 'f675b46a-84de-5fbc-b1a2-eccffa6dd7a5'::uuid, 'legacy_6', 1.0, null, 4),
  ('zomay@pedidos.com', 2145, '2522b097-8cc7-5617-ada5-d1c06db9c5bd'::uuid, 'legacy_7', 2.5, null, 5),
  ('zomay@pedidos.com', 2145, '84ecc5d2-2b2a-55bb-bd06-319b6faaabd0'::uuid, 'legacy_7', 2.5, null, 6),
  ('zomay@pedidos.com', 2145, 'abeac931-c571-5511-a448-19147c212dcb'::uuid, 'legacy_7', 2.5, null, 7),
  ('zomay@pedidos.com', 2145, '7d9552f7-3bfd-5410-b421-81a34d888d0d'::uuid, 'legacy_7', 2.5, null, 8),
  ('zomay@pedidos.com', 2145, '078a0617-9ba3-56ce-a832-afaea280d8bf'::uuid, 'legacy_1', 5.0, null, 9),
  ('zomay@pedidos.com', 2145, '98a271a6-8a86-5518-8516-b8a845392237'::uuid, 'legacy_1', 5.0, null, 10),
  ('zomay@pedidos.com', 2145, 'c7f1e812-2575-538e-a9e3-5f65167b83e9'::uuid, 'legacy_14', 0.5, null, 11),
  ('zomay@pedidos.com', 2145, 'b55bb5c9-6e1b-5f6b-9475-7eaff0b42775'::uuid, 'legacy_1', 4.0, null, 12),
  ('eventuale@pedidos.com', 839, 'bb3ef268-bc40-5592-b4e9-a5ff8536b38d'::uuid, 'legacy_15', 1.0, null, 1),
  ('eventuale@pedidos.com', 839, '43b4a34d-dbf0-5720-8f11-6b34b96b4845'::uuid, 'legacy_15', 1.0, null, 2),
  ('eventuale@pedidos.com', 839, '6f36a381-3234-5d54-867e-de39ba8d2f01'::uuid, 'legacy_3', 1.0, null, 3),
  ('eventuale@pedidos.com', 839, '5189b1b1-36c7-5682-a65d-097c6a0531a2'::uuid, 'legacy_2', 1.0, null, 4),
  ('eventuale@pedidos.com', 839, '6adc0cd1-89ff-578c-8334-6399633b01e0'::uuid, 'legacy_15', 0.5, null, 5),
  ('burgerhousecala@pedidos.com', 2336, 'f675b46a-84de-5fbc-b1a2-eccffa6dd7a5'::uuid, 'legacy_6', 1.0, null, 1),
  ('burgerhousecala@pedidos.com', 2336, 'bb3ef268-bc40-5592-b4e9-a5ff8536b38d'::uuid, 'legacy_14', 1.0, null, 2),
  ('burgerhousecala@pedidos.com', 2336, 'c7f1e812-2575-538e-a9e3-5f65167b83e9'::uuid, 'legacy_14', 1.0, null, 3);

insert into public.qb_legacy_order_template_lines (
  template_id,
  product_id,
  allowed_unit_id,
  quantity,
  notes,
  sort_order
)
select
  template.id,
  source.product_id,
  allowed.id,
  source.quantity,
  source.notes,
  source.sort_order
from qb_legacy_repeat_lines source
join public.qb_legacy_order_templates template
  on template.source_order_id = source.source_order_id
 and template.source_email = source.email
join public.products product
  on product.id = source.product_id
 and product.is_active = true
join public.qb_product_allowed_units allowed
  on allowed.product_id = source.product_id
 and allowed.usage_context = 'pedido'
 and allowed.is_active = true
join public.qb_units unit
  on unit.id = allowed.unit_id
 and unit.code = source.unit_code
 and unit.is_active = true
join public.qb_unit_dimensions dimension
  on dimension.id = unit.dimension_id
 and dimension.code = 'legacy_dump'
on conflict (template_id, product_id) do update
set allowed_unit_id = excluded.allowed_unit_id,
    quantity = excluded.quantity,
    notes = excluded.notes,
    sort_order = excluded.sort_order;

do $validate$
declare
  template_count integer;
  line_count integer;
begin
  select count(*) into template_count
  from public.qb_legacy_order_templates;
  select count(*) into line_count
  from public.qb_legacy_order_template_lines;

  if template_count <> 38 or line_count <> 330 then
    raise exception
      'QB_LEGACY_REPEAT_IMPORT_INCOMPLETE templates %, lines %',
      template_count,
      line_count;
  end if;
end;
$validate$;

insert into public.audit_logs (action, entity_type, metadata)
values (
  'import_legacy_repeatable_order_templates',
  'system',
  '{"source":"dump-railway-202607241212.sql","activeCustomers":38,"customersWithConfirmedOrder":38,"usableTemplates":38,"positiveSourceLines":332,"zeroQuantityLinesOmitted":510,"inactiveOrInvalidLinesOmitted":1,"normalizedQuantities":1,"positiveBsLines":24,"consolidatedLines":330,"templatesOver30Lines":1,"largestTemplate":31}'::jsonb
);

commit;
