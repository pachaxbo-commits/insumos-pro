\set ON_ERROR_STOP on
create role authenticated;
create role anon;
create schema auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.user_id', true), '')::uuid
$$;

create table public.profiles(id uuid primary key, role text not null, is_active boolean not null, full_name text);
create table public.qb_unit_dimensions(id uuid primary key, code text unique, is_active boolean not null default true);
create table public.qb_units(
  id uuid primary key, dimension_id uuid references public.qb_unit_dimensions(id),
  code text, name text, symbol text, conversion_factor_to_base numeric(18,9),
  is_active boolean not null default true, is_base boolean not null default false,
  sort_order integer not null default 0
);
create table public.qb_orders(id uuid primary key, customer_account_id uuid, public_reference text, updated_at timestamptz default now());
create table public.qb_order_items(
  id uuid primary key, order_id uuid not null references public.qb_orders(id), product_id uuid not null,
  source_kind text, product_presentation_id uuid, base_unit_id uuid not null references public.qb_units(id),
  requested_quantity numeric not null default 1, base_quantity numeric not null default 1,
  conversion_factor_to_base numeric(18,9) not null, source_label text not null,
  order_input_mode text default 'quantity'
);
create table public.qb_product_presentations(
  id uuid primary key, product_id uuid not null, symbol text not null default 'UNIT',
  base_unit_id uuid not null references public.qb_units(id),
  conversion_factor_to_base numeric(18,9) not null, is_active boolean not null default true,
  allow_order boolean not null default true
);
create table public.qb_order_preparation_items(
  id uuid primary key default gen_random_uuid(), preparation_id uuid, order_item_id uuid unique,
  product_id uuid, requested_source_label text, requested_quantity numeric default 0,
  requested_base_unit_id uuid, requested_base_unit_symbol text, requested_base_quantity numeric default 0,
  actual_allowed_unit_id uuid, actual_source_kind text, actual_source_unit_id uuid,
  actual_product_presentation_id uuid, actual_source_label text, actual_quantity numeric default 0,
  actual_base_unit_id uuid, actual_base_unit_symbol text, actual_base_quantity numeric default 0,
  conversion_factor_to_base numeric default 1, conversion_snapshot_id uuid, status text default 'parcial',
  notes text, created_at timestamptz default now(), updated_at timestamptz default now(),
  preparation_check boolean default false, prepared_by_line uuid, prepared_at_line timestamptz,
  row_version integer default 0, last_idempotency_key text, actual_weight_kg numeric,
  display_unit_id text default 'original', origin_plan_confirmed boolean default false,
  planned_pending_base_quantity numeric default 0, planned_external_base_quantity numeric default 0,
  planned_review_base_quantity numeric default 0
);
create table public.qb_order_delivery_items(
  id uuid primary key default gen_random_uuid(), order_id uuid, order_item_id uuid unique,
  preparation_item_id uuid, product_id uuid, source_label text default 'kg',
  base_unit_id uuid, base_unit_symbol text default 'kg', conversion_factor_to_base numeric default 1,
  prepared_quantity_snapshot numeric default 0, prepared_base_quantity_snapshot numeric default 0,
  externally_sourced_quantity numeric default 0, externally_sourced_base_quantity numeric default 0,
  delivered_quantity numeric default 0, delivered_base_quantity numeric default 0,
  delivery_check boolean default false, delivery_note text, delivered_by uuid, delivered_at timestamptz,
  row_version integer default 0, last_idempotency_key text, created_at timestamptz default now(), updated_at timestamptz default now(),
  display_unit_id text default 'original', actual_weight_kg numeric,
  warehouse_used_base_quantity numeric default 0, pending_incoming_base_quantity numeric default 0,
  external_definitive_base_quantity numeric default 0, origin_review_base_quantity numeric default 0,
  source_origin_confirmed boolean default false
);
create table public.qb_order_line_change_events(
  id uuid primary key default gen_random_uuid(), order_id uuid, order_item_id uuid, customer_account_id uuid,
  stage text, field_name text, old_value jsonb, new_value jsonb, unit_label text, actor_id uuid,
  actor_role text, correlation_key text, idempotency_key text unique
);
create table public.qb_receipt_lines(
  id uuid primary key default gen_random_uuid(), receipt_id uuid, receipt_order_id uuid,
  order_id uuid references public.qb_orders(id), preparation_item_id uuid references public.qb_order_preparation_items(id),
  product_id uuid, product_name_snapshot text, product_code_snapshot text, category_name_snapshot text,
  delivered_base_quantity numeric, base_unit_id uuid, base_unit_symbol text, visible_unit_label text,
  conversion_snapshot_id uuid, original_base_price numeric, base_price_used numeric, base_price_edited boolean default false,
  save_as_new_base_price boolean default false, distance_factor_percent numeric default 0,
  exigency_factor_percent numeric default 0, weather_factor_percent numeric default 0,
  extraordinary_factor_percent numeric default 0, final_unit_price numeric, line_total numeric, notes text,
  created_at timestamptz default now(), order_input_mode text default 'quantity', requested_amount_bs numeric,
  currency_snapshot text, pricing_unit_id uuid, estimated_base_quantity numeric, fixed_line_amount numeric,
  cost_base_unit_snapshot numeric, actual_weight_kg numeric, actual_weight_value numeric,
  actual_weight_unit_id uuid, actual_weight_factor_to_kg numeric
);

create or replace function public.current_user_role() returns text language sql stable as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

-- Reproduce the old behavior so the incremental migration proves that it no
-- longer rewrites commercial quantity from measured weight.
create or replace function public.align_qb_receipt_weight_pricing_unit()
returns trigger language plpgsql as $$
begin
  new.delivered_base_quantity := coalesce(new.actual_weight_kg, new.delivered_base_quantity);
  new.visible_unit_label := 'KG';
  return new;
end $$;
create trigger align_qb_receipt_weight_pricing_unit
before insert on public.qb_receipt_lines
for each row execute function public.align_qb_receipt_weight_pricing_unit();

create view public.qb_operational_preparation_items with (security_barrier=true) as
select p.id,p.preparation_id,p.order_item_id,p.product_id,p.requested_source_label,p.requested_quantity,
 p.requested_base_unit_id,p.requested_base_unit_symbol,p.requested_base_quantity,p.actual_allowed_unit_id,
 p.actual_source_kind,p.actual_source_unit_id,p.actual_product_presentation_id,p.actual_source_label,
 p.actual_quantity,p.actual_base_unit_id,p.actual_base_unit_symbol,p.actual_base_quantity,p.conversion_factor_to_base,
 p.conversion_snapshot_id,p.status,p.notes,p.created_at,p.updated_at,p.preparation_check,p.prepared_by_line,
 p.prepared_at_line,p.row_version,p.last_idempotency_key,p.actual_weight_kg,p.display_unit_id,
 (select f.full_name from public.profiles f where f.id=p.prepared_by_line) prepared_by_name
from public.qb_order_preparation_items p where public.current_user_role() in ('admin','administrador','inventario','entregador','supervisor');
create view public.qb_supervisor_receipt_lines with (security_barrier=true) as
select line.id,line.receipt_id,line.order_id,orders.public_reference as order_reference,
 line.product_id,line.product_name_snapshot,line.product_code_snapshot,line.category_name_snapshot,
 line.delivered_base_quantity,line.base_unit_symbol,line.visible_unit_label,line.order_input_mode,
 line.requested_amount_bs,line.currency_snapshot,pricing_unit.symbol as pricing_unit_symbol,
 line.estimated_base_quantity,line.fixed_line_amount,line.base_price_used,line.final_unit_price,
 line.line_total,line.cost_base_unit_snapshot,line.notes,line.created_at
from public.qb_receipt_lines line join public.qb_orders orders on orders.id=line.order_id
left join public.qb_units pricing_unit on pricing_unit.id=line.pricing_unit_id
where public.current_user_role() in ('admin','administrador','supervisor');

create or replace function public.save_qb_matrix_preparation_origin_with_unit(
  uuid,integer,numeric,boolean,numeric,text,text,numeric,numeric,numeric,boolean,text
) returns jsonb language plpgsql as $$
declare v_order_item uuid := $1; v_weight numeric := $5; v_row public.qb_order_preparation_items%rowtype;
begin
  insert into public.qb_order_preparation_items(order_item_id,actual_weight_kg,display_unit_id,actual_quantity,preparation_check,notes,row_version)
  values(v_order_item,v_weight,$6,$3,$4,$7,1)
  on conflict(order_item_id) do update set actual_weight_kg=excluded.actual_weight_kg,
    display_unit_id=excluded.display_unit_id,actual_quantity=excluded.actual_quantity,
    preparation_check=excluded.preparation_check,notes=excluded.notes,row_version=public.qb_order_preparation_items.row_version+1
  returning * into v_row;
  return jsonb_build_object('replayed',false,'row_version',v_row.row_version);
end $$;
create or replace function public.save_qb_matrix_delivery_origin_with_unit(
  uuid,integer,numeric,numeric,boolean,numeric,text,text,numeric,numeric,numeric,numeric,boolean,text
) returns jsonb language plpgsql as $$
declare v_item uuid := $1; v_row public.qb_order_delivery_items%rowtype;
begin
  insert into public.qb_order_delivery_items(order_item_id,preparation_item_id,actual_weight_kg,display_unit_id,externally_sourced_quantity,delivered_quantity,delivered_base_quantity,delivery_check,delivery_note,row_version)
  values(v_item,(select id from public.qb_order_preparation_items where order_item_id=v_item),$6,$7,$3,$4,$4,$5,$8,1)
  on conflict(order_item_id) do update set actual_weight_kg=excluded.actual_weight_kg,
    display_unit_id=excluded.display_unit_id,delivered_quantity=excluded.delivered_quantity,
    delivered_base_quantity=excluded.delivered_base_quantity,
    delivery_check=excluded.delivery_check,delivery_note=excluded.delivery_note,row_version=public.qb_order_delivery_items.row_version+1
  returning * into v_row;
  return jsonb_build_object('replayed',false,'row_version',v_row.row_version);
end $$;

insert into public.qb_unit_dimensions(id,code) values
 ('10000000-0000-0000-0000-000000000001','peso'),
 ('10000000-0000-0000-0000-000000000002','unidad'),
 ('10000000-0000-0000-0000-000000000003','legacy_dump');

-- A historical row has a normalized weight but no known original unit. The
-- migration must leave its original-unit snapshot null instead of guessing.
insert into public.qb_order_preparation_items(id,actual_weight_kg)
values('90000000-0000-0000-0000-000000000009',4.25);
insert into public.qb_units(id,dimension_id,code,name,symbol,conversion_factor_to_base) values
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','kg','Kilogramo','KG',1),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','lb','Libra','LB',0.45359237),
 ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002','unit','Unidad','UNIDAD',1),
 ('20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000003','legacy_6','Legacy six','ARROBA',1);
