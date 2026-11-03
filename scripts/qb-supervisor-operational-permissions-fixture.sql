-- Minimal PostgreSQL contract schema for 20261104100000. Runs only in the
-- disposable postgres service declared by the matching GitHub Actions workflow.
create schema auth;
create role authenticated nologin;
create role anon nologin;
create table public.profiles(id uuid primary key, role text not null, is_active boolean not null default true);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create or replace function public.current_user_role() returns text
language sql stable security definer set search_path = pg_catalog as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;
grant usage on schema public, auth to authenticated, anon;

create table public.customer_accounts(
  id uuid primary key, full_name text, email text, phone text,
  is_active boolean not null default true
);
create table public.qb_units(id uuid primary key, symbol text);
create table public.qb_orders(
  id uuid primary key, public_reference text, customer_account_id uuid,
  status text, submitted_at timestamptz default now(), delivered_at timestamptz
);
create table public.qb_receipts(
  id uuid primary key default gen_random_uuid(), receipt_number text, status text default 'borrador', pricing_mode text,
  customer_account_id uuid, period_start date, period_end date, created_by uuid,
  subtotal_amount numeric, total_amount numeric, visible_note text, internal_notes text,
  issued_at timestamptz, receipt_sent_at timestamptz, receipt_sent_by uuid,
  payment_status text, paid_at timestamptz, paid_by uuid, voided_at timestamptz,
  void_reason text, created_at timestamptz default now(),
  distance_factor_percent numeric default 0, exigency_factor_percent numeric default 0,
  weather_factor_percent numeric default 0, extraordinary_factor_percent numeric default 0,
  cost_total_precise numeric, sale_total_precise numeric, profit_total_precise numeric,
  surcharge_amount numeric, calculated_by uuid, calculated_at timestamptz, summary_snapshot jsonb
);
create table public.qb_receipt_lines(
  id uuid primary key default gen_random_uuid(), receipt_id uuid, receipt_order_id uuid, order_id uuid,
  preparation_item_id uuid, product_id uuid,
  product_name_snapshot text, product_code_snapshot text, category_name_snapshot text,
  delivered_base_quantity numeric, base_unit_id uuid, base_unit_symbol text, visible_unit_label text,
  conversion_snapshot_id uuid, original_base_price numeric,
  order_input_mode text, requested_amount_bs numeric, currency_snapshot text,
  pricing_unit_id uuid, estimated_base_quantity numeric, fixed_line_amount numeric,
  base_price_used numeric, final_unit_price numeric, line_total numeric,
  cost_base_unit_snapshot numeric, notes text, created_at timestamptz default now(),
  distance_factor_percent numeric default 0, exigency_factor_percent numeric default 0,
  weather_factor_percent numeric default 0, extraordinary_factor_percent numeric default 0,
  cost_total_input_precise numeric, cost_source text
);
create table public.qb_receipt_orders(
  id uuid primary key default gen_random_uuid(), receipt_id uuid, order_id uuid,
  customer_account_id uuid, inclusion_status text default 'borrador'
);
create table public.qb_receipt_events(
  id bigint generated always as identity primary key, receipt_id uuid,
  event_type text, metadata jsonb, created_by uuid, created_at timestamptz default now()
);
create table public.qb_order_preparations(id uuid primary key, order_id uuid);
create table public.qb_order_preparation_items(
  id uuid primary key, preparation_id uuid, product_id uuid, status text,
  actual_base_unit_id uuid, actual_base_unit_symbol text, actual_source_label text,
  requested_base_unit_symbol text, conversion_snapshot_id uuid,
  created_at timestamptz default now()
);
create table public.qb_order_delivery_movements(
  id uuid primary key default gen_random_uuid(), order_id uuid,
  preparation_item_id uuid, delivered_base_quantity numeric
);
create table public.product_categories(id uuid primary key, name text);
create table public.products(
  id uuid primary key, name text, sku text, category_id uuid,
  is_qb_loss_product boolean not null default false
);
create table public.qb_product_unit_settings(product_id uuid primary key, base_sale_price numeric);
create table public.qb_merchandise_receipts(id uuid primary key);
create table public.qb_merchandise_receipt_lines(id uuid primary key, receipt_id uuid, is_warehouse_purchase boolean);
insert into public.qb_merchandise_receipt_lines values
  ('40000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001',true);

-- These stubs model the already-installed RPC signatures and role guards. The
-- test applies the exact migration under review, not a copy of its logic.
create or replace function public.create_qb_warehouse_purchase_draft(date,uuid,uuid,text,uuid,uuid,text,numeric,uuid,text,numeric,numeric,numeric,numeric,uuid,numeric,text,text,text,jsonb)
returns uuid language plpgsql security definer as $$ declare v_role text := public.current_user_role(); begin
  if v_role is null or v_role not in ('admin','administrador','inventario') then raise exception 'denied'; end if; return gen_random_uuid(); end $$;
create or replace function public.update_qb_warehouse_purchase_draft(uuid,timestamptz,numeric,numeric,uuid,text,uuid,numeric,text,text,numeric,uuid)
returns uuid language plpgsql security definer as $$ declare v_role text := public.current_user_role(); begin
  if v_role is null or v_role not in ('admin', 'administrador', 'inventario') then raise exception 'denied'; end if; return $1; end $$;
create or replace function public.confirm_qb_warehouse_purchase_draft(uuid)
returns uuid language plpgsql security definer as $$ declare v_role text := public.current_user_role(); begin
  if v_role is null or v_role not in ('admin','administrador','inventario') then raise exception 'denied'; end if; return $1; end $$;
create or replace function public.annul_qb_warehouse_purchase_draft(uuid,text)
returns uuid language plpgsql security definer as $$ declare v_role text := public.current_user_role(); begin
  if v_role is null or v_role not in ('admin','administrador','inventario') then raise exception 'denied'; end if; return $1; end $$;
create or replace function public.set_warehouse_purchase_actual_quantity(uuid,numeric)
returns uuid language plpgsql security definer as $$ declare v_role text := public.current_user_role(); begin
  if v_role not in ('admin', 'administrador', 'inventario') then raise exception 'denied'; end if; return $1; end $$;
create or replace function public.confirm_qb_merchandise_receipt(uuid)
returns uuid language plpgsql security definer as $$ declare v_user_role text := public.current_user_role(); begin
  if v_user_role is null or v_user_role not in ('admin','administrador','inventario','supervisor') then raise exception 'denied'; end if;
  if v_user_role = 'supervisor' and not exists(select 1 from public.qb_merchandise_receipt_lines l where l.receipt_id=$1 and l.is_warehouse_purchase) then raise exception 'wrong scope'; end if; return $1; end $$;

create or replace function public.create_qb_receipt_draft(uuid,uuid[]) returns uuid
language plpgsql security definer as $$ declare v_user_role text := public.current_user_role(); begin
  if v_user_role is null or v_user_role not in ('admin', 'administrador') then raise exception 'denied'; end if; return gen_random_uuid(); end $$;
create or replace function public.update_qb_receipt_draft_legacy(uuid,numeric,numeric,numeric,numeric,text,text,jsonb) returns uuid
language plpgsql security definer as $$ declare v_user_role text := public.current_user_role(); begin
  if v_user_role is null or v_user_role not in ('admin', 'administrador') then raise exception 'denied'; end if; return $1; end $$;
create or replace function public.set_qb_receipt_line_pricing(p_receipt_id uuid,p_lines jsonb) returns uuid
language plpgsql security definer as $$
declare v_user_role text := public.current_user_role(); v_line jsonb; v_id uuid; v_total numeric;
  v_dist numeric; v_exig numeric; v_weather numeric; v_extra numeric; v_note text;
begin
  if auth.uid() is null or public.current_user_role() not in ('admin', 'administrador') then raise exception 'denied'; end if;
  for v_line in select value from jsonb_array_elements($2) loop
    v_id := (v_line ->> 'line_id')::uuid;
    v_total := nullif(v_line ->> 'cost_total', '')::numeric;
    v_dist := (v_line ->> 'distance_factor_percent')::numeric;
    v_exig := (v_line ->> 'exigency_factor_percent')::numeric;
    v_weather := (v_line ->> 'weather_factor_percent')::numeric;
    v_extra := (v_line ->> 'extraordinary_factor_percent')::numeric;
    v_note := nullif(trim(coalesce(v_line ->> 'notes', '')), '');
  end loop;
  return $1;
end $$;
create or replace function public.emit_qb_receipt(uuid) returns uuid
language plpgsql security definer as $$ declare v_user_role text := public.current_user_role(); begin
  if v_user_role is null or v_user_role not in ('admin', 'administrador') then raise exception 'denied'; end if;
  update public.qb_receipts set status='emitido', issued_at=now() where id=$1 and status='borrador';
  if not found then raise exception 'draft receipt required'; end if; return $1; end $$;
create or replace function public.void_qb_receipt(uuid,text) returns uuid
language plpgsql security definer as $$ declare v_user_role text := public.current_user_role(); begin
  if v_user_role is null or v_user_role not in ('admin', 'administrador') then raise exception 'denied'; end if;
  update public.qb_receipts set status='anulado', voided_at=now(), void_reason=$2 where id=$1; return $1; end $$;
create or replace function public.set_qb_receipt_manual_tracking(uuid,boolean,text) returns uuid
language plpgsql security definer as $$ begin
  if public.current_user_role() not in ('admin','administrador') then raise exception 'denied'; end if;
  update public.qb_receipts set receipt_sent_at=case when $2 then now() else null end,
    payment_status=$3, paid_at=case when $3 in ('pagado','cobrado') then now() else null end where id=$1;
  return $1; end $$;
create or replace function public.recalculate_qb_receipt_totals(uuid) returns void
language plpgsql security definer as $$ begin
  if auth.uid() is null or public.current_user_role() not in ('admin', 'administrador') then raise exception 'denied'; end if;
end $$;
revoke all on function public.recalculate_qb_receipt_totals(uuid) from public, anon, authenticated;
grant execute on all functions in schema public to authenticated;
revoke all on function public.update_qb_receipt_draft_legacy(uuid,numeric,numeric,numeric,numeric,text,text,jsonb)
  from public, anon, authenticated;

insert into public.profiles(id, role) values
  ('00000000-0000-0000-0000-000000000001','supervisor'),
  ('00000000-0000-0000-0000-000000000002','administrador'),
  ('00000000-0000-0000-0000-000000000003','inventario'),
  ('00000000-0000-0000-0000-000000000004','entregador');
insert into public.customer_accounts(id,full_name,email,phone,is_active)
values ('10000000-0000-0000-0000-000000000001','Fixture Cliente','fixture@example.invalid','00000000',true);
insert into public.qb_orders(id, public_reference, customer_account_id, status, submitted_at, delivered_at) values
  ('20000000-0000-0000-0000-000000000001','FIXTURE-ORDER-SUPERVISOR','10000000-0000-0000-0000-000000000001','entregado_pendiente_recibo',now() - interval '2 hours',now() - interval '1 hour'),
  ('20000000-0000-0000-0000-000000000002','FIXTURE-ORDER-ADMIN','10000000-0000-0000-0000-000000000001','entregado_pendiente_recibo',now() - interval '2 hours',now() - interval '1 hour');
insert into public.product_categories values ('61000000-0000-0000-0000-000000000001','Fixture category');
insert into public.products(id, name, sku, category_id, is_qb_loss_product)
values ('60000000-0000-0000-0000-000000000001','Fixture Producto','FIXTURE-PRODUCT','61000000-0000-0000-0000-000000000001',false);
insert into public.qb_product_unit_settings(product_id, base_sale_price)
values ('60000000-0000-0000-0000-000000000001',5);
insert into public.qb_order_preparations(id, order_id) values
  ('21000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001'),
  ('21000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002');
insert into public.qb_order_preparation_items(
  id, preparation_id, product_id, status, actual_base_unit_id,
  actual_base_unit_symbol, actual_source_label, requested_base_unit_symbol,
  created_at
) values
  ('22000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','completo','62000000-0000-0000-0000-000000000001','KG','1 KG','KG',now() - interval '2 hours'),
  ('22000000-0000-0000-0000-000000000002','21000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000001','parcial','62000000-0000-0000-0000-000000000001','KG','1 KG','KG',now() - interval '2 hours');
insert into public.qb_order_delivery_movements(order_id, preparation_item_id, delivered_base_quantity) values
  ('20000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001',2),
  ('20000000-0000-0000-0000-000000000002','22000000-0000-0000-0000-000000000002',3);
insert into public.qb_receipts(id, receipt_number, status, pricing_mode, customer_account_id,
  period_start, period_end, subtotal_amount, total_amount, visible_note, internal_notes,
  created_at)
values ('30000000-0000-0000-0000-000000000001','FIXTURE-REC','borrador','line_cost_markup',
  '10000000-0000-0000-0000-000000000001',current_date,current_date,10,15,'Nota visible','Nota privada',now());
insert into public.qb_receipts(id, receipt_number, status, pricing_mode, customer_account_id,
  period_start, period_end, subtotal_amount, total_amount, visible_note, internal_notes, created_at)
values ('30000000-0000-0000-0000-000000000002','FIXTURE-LEG','borrador','legacy',
  '10000000-0000-0000-0000-000000000001',current_date,current_date,10,15,'Nota visible','Nota privada',now());
insert into public.qb_receipt_lines(id, receipt_id, order_id, product_id,
  product_name_snapshot, delivered_base_quantity, base_unit_symbol, order_input_mode,
  base_price_used, final_unit_price, line_total, cost_base_unit_snapshot,
  distance_factor_percent, exigency_factor_percent,
  weather_factor_percent, extraordinary_factor_percent)
values ('50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001',
  'Fixture Producto',1,'KG','quantity',5,5,15,3,0,0,0,0);
