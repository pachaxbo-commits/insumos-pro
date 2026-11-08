-- QB measurement snapshot migration preflight.
-- READ ONLY: catalog and migration-ledger metadata only; no business rows.
-- Run only after confirming the Dashboard project reference is tekfwbhvqtojpfqusosg.
begin read only;

-- 1. Connection identity and read-only transaction confirmation.
select current_database() as database_name,
       current_user as executing_role,
       current_setting('server_version') as server_version,
       current_setting('transaction_read_only') as transaction_read_only;

-- 2. Migration history required by the view/RPC chain. Only version/name metadata.
select to_regclass('supabase_migrations.schema_migrations') is not null as migration_ledger_exists;

select version::text as version,
       coalesce(nullif(to_jsonb(m)->>'name',''), '(name column unavailable)') as migration_name
from supabase_migrations.schema_migrations m
where version::text = any(array[
  '20260712090500',
  '20260712090800',
  '20260712090900',
  '20260712091000',
  '20260723130000',
  '20260723130100',
  '20260723210100',
  '20260724110000',
  '20260725010000',
  '20260725010500',
  '20260804010000',
  '20260812010000',
  '20260918010000',
  '20260926010000',
  '20260928010000',
  '20260929010000',
  '20261002160000',
  '20261007120000',
  '20261007130000',
  '20261027100000',
  '20261027120000',
  '20261104100000',
  '20261107100000'
])
order by version::text;

-- 3. Exact current view definitions (schema only; no view rows are selected).
select view_name, pg_get_viewdef(to_regclass('public.' || view_name), true) as current_definition,
       (select reloptions from pg_class where oid=to_regclass('public.' || view_name)) as reloptions
from (values ('qb_operational_preparation_items'),('qb_supervisor_receipt_lines')) v(view_name);

-- 4. Exact current definitions and security metadata for every existing RPC
--    in the delegated write chain. Missing signatures appear with exists=false.
with expected(signature) as (values
 ('public.save_qb_matrix_preparation_origin_with_unit(uuid,integer,numeric,boolean,numeric,text,text,numeric,numeric,numeric,boolean,text)'),
 ('public.save_qb_matrix_delivery_origin_with_unit(uuid,integer,numeric,numeric,boolean,numeric,text,text,numeric,numeric,numeric,numeric,boolean,text)'),
 ('public.save_qb_matrix_preparation_item_with_unit(uuid,integer,numeric,boolean,numeric,text,text,text)'),
 ('public.save_qb_matrix_delivery_item_with_unit(uuid,integer,numeric,numeric,boolean,numeric,text,text,text)'),
 ('public.save_qb_matrix_preparation_item_with_weight(uuid,integer,numeric,boolean,numeric,text,text)'),
 ('public.save_qb_matrix_delivery_item_with_weight(uuid,integer,numeric,numeric,boolean,numeric,text,text)'),
 ('public.save_qb_matrix_delivery_item_with_weight_v1(uuid,integer,numeric,numeric,boolean,numeric,text,text)'),
 ('public.save_qb_matrix_delivery_item_with_weight_v2(uuid,integer,numeric,numeric,boolean,numeric,text,text)'),
 ('public.save_qb_matrix_preparation_item(uuid,integer,numeric,boolean,text,text)'),
 ('public.save_qb_matrix_delivery_item(uuid,integer,numeric,numeric,boolean,text,text)'),
 ('public.save_qb_matrix_preparation_origin_with_weight_snapshot(uuid,integer,numeric,boolean,numeric,uuid,numeric,boolean,text,text,numeric,numeric,numeric,boolean,text)'),
 ('public.save_qb_matrix_delivery_origin_with_weight_snapshot(uuid,integer,numeric,numeric,boolean,numeric,uuid,numeric,boolean,text,text,numeric,numeric,numeric,numeric,boolean,text)'),
 ('public.snapshot_qb_receipt_line_actual_weight()'),
 ('public.guard_qb_order_item_presentation_dimension()'),
 ('public.guard_qb_order_item_presentation_snapshot()')
)
select e.signature,
       p.oid is not null as exists,
       case when p.oid is null then null else pg_get_function_identity_arguments(p.oid) end as identity_arguments,
       case when p.oid is null then null else pg_get_function_result(p.oid) end as return_type,
       case when p.oid is null then null else l.lanname end as language,
       p.prosecdef as security_definer,
       p.provolatile as volatility,
       p.proconfig as function_settings,
       case when p.oid is null then null else pg_get_functiondef(p.oid) end as current_definition
from expected e
left join pg_proc p on p.oid=to_regprocedure(e.signature)
left join pg_language l on l.oid=p.prolang
order by e.signature;

-- 5. Required base-table columns and exact types used by the migration/views.
with expected(table_name,column_name,expected_type) as (values
 ('qb_order_preparation_items','actual_weight_kg','numeric(18,6)'),
 ('qb_order_preparation_items','display_unit_id','text'),
 ('qb_order_preparation_items','prepared_by_line','uuid'),
 ('qb_order_preparation_items','origin_plan_confirmed','boolean'),
 ('qb_order_preparation_items','planned_pending_base_quantity','numeric(18,6)'),
 ('qb_order_preparation_items','planned_external_base_quantity','numeric(18,6)'),
 ('qb_order_preparation_items','planned_review_base_quantity','numeric(18,6)'),
 ('qb_order_preparation_items','order_item_id','uuid'),
 ('qb_order_delivery_items','actual_weight_kg','numeric(18,6)'),
 ('qb_order_delivery_items','order_item_id','uuid'),
 ('qb_order_delivery_items','display_unit_id','text'),
 ('qb_order_delivery_items','delivered_base_quantity','numeric(18,6)'),
 ('qb_order_delivery_items','source_origin_confirmed','boolean'),
 ('qb_order_delivery_items','warehouse_used_base_quantity','numeric(18,6)'),
 ('qb_order_delivery_items','pending_incoming_base_quantity','numeric(18,6)'),
 ('qb_order_delivery_items','external_definitive_base_quantity','numeric(18,6)'),
 ('qb_order_delivery_items','origin_review_base_quantity','numeric(18,6)'),
 ('qb_receipt_lines','preparation_item_id','uuid'),
 ('qb_receipt_lines','order_id','uuid'),
 ('qb_orders','public_reference','text'),
 ('profiles','full_name','text'),
 ('profiles','role','text'),
 ('profiles','is_active','boolean'),
 ('qb_units','symbol','text'),
 ('qb_units','dimension_id','uuid'),
 ('qb_units','conversion_factor_to_base','numeric(18,9)'),
 ('qb_unit_dimensions','code','text'),
 ('qb_unit_dimensions','is_active','boolean'),
 ('qb_order_line_change_events','stage','text'),
 ('qb_order_line_change_events','field_name','text'),
 ('qb_order_line_change_events','old_value','jsonb'),
 ('qb_order_line_change_events','new_value','jsonb'),
 ('qb_order_line_change_events','actor_id','uuid'),
 ('qb_order_line_change_events','actor_role','text'),
 ('qb_order_line_change_events','correlation_key','text'),
 ('qb_order_line_change_events','idempotency_key','text')
)
select e.table_name,e.column_name,e.expected_type,
       case when c.oid is null then null when a.attnum is null then null
            else format_type(a.atttypid,a.atttypmod) end as actual_type,
       c.oid is not null as table_exists,
       a.attnum is not null as column_exists
from expected e
left join pg_class c on c.oid=to_regclass('public.' || e.table_name)
left join pg_attribute a on a.attrelid=c.oid and a.attname=e.column_name
  and a.attnum>0 and not a.attisdropped
order by e.table_name,e.column_name;

-- 6. New migration columns: absent is the expected pre-migration state.
--    Existing-but-exact columns indicate drift/partial application and are not
--    declared safe without a separate data validation.
with expected(table_name,column_name,expected_type) as (values
 ('qb_order_preparation_items','actual_weight_value','numeric(18,6)'),
 ('qb_order_preparation_items','actual_weight_unit_id','uuid'),
 ('qb_order_preparation_items','actual_weight_factor_to_kg','numeric(18,9)'),
 ('qb_order_delivery_items','actual_weight_value','numeric(18,6)'),
 ('qb_order_delivery_items','actual_weight_unit_id','uuid'),
 ('qb_order_delivery_items','actual_weight_factor_to_kg','numeric(18,9)'),
 ('qb_receipt_lines','actual_weight_value','numeric(18,6)'),
 ('qb_receipt_lines','actual_weight_unit_id','uuid'),
 ('qb_receipt_lines','actual_weight_factor_to_kg','numeric(18,9)'),
 ('qb_receipt_lines','actual_weight_kg','numeric(18,6)'),
 ('qb_receipt_lines','commercial_quantity_snapshot','numeric(18,6)'),
 ('qb_receipt_lines','commercial_unit_label_snapshot','text'),
 ('qb_receipt_lines','commercial_conversion_factor_snapshot','numeric(18,9)')
)
select e.table_name,e.column_name,e.expected_type,
       format_type(a.atttypid,a.atttypmod) as actual_type,
       a.attnum is not null as already_exists,
       case when a.attnum is null then 'COMPATIBLE: absent; migration can add it'
            when format_type(a.atttypid,a.atttypmod)=e.expected_type
              then 'NO VERIFICABLE: pre-existing column; investigate drift and data before applying'
            else 'INCOMPATIBLE: type differs from migration contract' end as assessment
from expected e
left join pg_class c on c.oid=to_regclass('public.' || e.table_name)
left join pg_attribute a on a.attrelid=c.oid and a.attname=e.column_name
  and a.attnum>0 and not a.attisdropped
order by e.table_name,e.column_name;

-- 7. Current view column order/types. Predecessor prefixes must match exactly;
--    output types must equal the current source columns used by each projection.
with expected(view_name,expected_columns) as (values
 ('qb_operational_preparation_items',array[
  'id','preparation_id','order_item_id','product_id','requested_source_label','requested_quantity',
  'requested_base_unit_id','requested_base_unit_symbol','requested_base_quantity','actual_allowed_unit_id',
  'actual_source_kind','actual_source_unit_id','actual_product_presentation_id','actual_source_label',
  'actual_quantity','actual_base_unit_id','actual_base_unit_symbol','actual_base_quantity',
  'conversion_factor_to_base','conversion_snapshot_id','status','notes','created_at','updated_at',
  'preparation_check','prepared_by_line','prepared_at_line','row_version','last_idempotency_key',
  'actual_weight_kg','display_unit_id','prepared_by_name','origin_plan_confirmed',
  'planned_pending_base_quantity','planned_external_base_quantity','planned_review_base_quantity']::text[]),
 ('qb_supervisor_receipt_lines',array[
  'id','receipt_id','order_id','order_reference','product_id','product_name_snapshot',
  'product_code_snapshot','category_name_snapshot','delivered_base_quantity','base_unit_symbol',
  'visible_unit_label','order_input_mode','requested_amount_bs','currency_snapshot','pricing_unit_symbol',
  'estimated_base_quantity','fixed_line_amount','base_price_used','final_unit_price','line_total',
  'cost_base_unit_snapshot','notes','created_at']::text[])
), actual as (
 select e.view_name,e.expected_columns,
        c.oid as view_oid,
        array(select a.attname::text from pg_attribute a where a.attrelid=c.oid
          and a.attnum>0 and not a.attisdropped order by a.attnum) as actual_columns
 from expected e left join pg_class c on c.oid=to_regclass('public.' || e.view_name)
)
select view_name,expected_columns,actual_columns,
       case when view_oid is null then 'INCOMPATIBLE: required view missing'
            when actual_columns=expected_columns then 'COMPATIBLE: exact predecessor prefix/order'
            else 'INCOMPATIBLE: column list/order differs' end as assessment
from actual order by view_name;

-- 8. View type compatibility, security barrier and access grants.
select v.view_name,
       c.reloptions,
       has_table_privilege('authenticated',c.oid,'select') as authenticated_select,
       has_table_privilege('anon',c.oid,'select') as anon_select,
       exists(select 1 from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x where x.grantee=0 and x.privilege_type='SELECT') as public_select,
       pg_get_viewdef(c.oid,true) as current_definition
from (values ('qb_operational_preparation_items'),('qb_supervisor_receipt_lines')) v(view_name)
left join pg_class c on c.oid=to_regclass('public.' || v.view_name)
order by v.view_name;

-- 9. Existing relevant constraints and triggers, including exact definitions.
select conrelid::regclass::text as table_name,conname,contype,convalidated,
       pg_get_constraintdef(oid,true) as definition
from pg_constraint
where conrelid=any(array[
  to_regclass('public.qb_order_preparation_items'),
  to_regclass('public.qb_order_delivery_items'),
  to_regclass('public.qb_receipt_lines'),
  to_regclass('public.qb_order_items')
])
and (conname ilike '%weight%' or conname ilike '%origin%' or conname ilike '%presentation%' or conname ilike '%quantity%')
order by table_name,conname;

select t.tgrelid::regclass::text as table_name,t.tgname,t.tgenabled,
       p.oid::regprocedure::text as trigger_function,
       pg_get_triggerdef(t.oid,true) as trigger_definition,
       pg_get_functiondef(p.oid) as function_definition
from pg_trigger t
join pg_proc p on p.oid=t.tgfoid
where not t.tgisinternal
  and t.tgrelid=any(array[
    to_regclass('public.qb_order_preparation_items'),
    to_regclass('public.qb_order_delivery_items'),
    to_regclass('public.qb_receipt_lines'),
    to_regclass('public.qb_order_items')
  ])
order by table_name,t.tgname;

-- 10. Table/view/function ACLs and RLS policies (metadata only).
select c.oid::regclass::text as object_name,
       case c.relkind when 'v' then 'view' when 'm' then 'materialized view' else 'table' end as object_kind,
       c.relrowsecurity as rls_enabled,c.relforcerowsecurity as force_rls,
       case x.grantee when 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end as grantee,
       x.privilege_type,x.is_grantable
from pg_class c
cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x
where c.oid=any(array[
  to_regclass('public.qb_order_preparation_items'),to_regclass('public.qb_order_delivery_items'),
  to_regclass('public.qb_receipt_lines'),to_regclass('public.qb_operational_preparation_items'),
  to_regclass('public.qb_supervisor_receipt_lines'),to_regclass('public.qb_order_items')
])
order by object_name,grantee,privilege_type;

select c.oid::regclass::text as object_name,a.attname as column_name,
       case x.grantee when 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end as grantee,
       x.privilege_type,x.is_grantable
from pg_class c
join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
cross join lateral aclexplode(a.attacl) x
where c.oid=any(array[
  to_regclass('public.qb_order_preparation_items'),to_regclass('public.qb_order_delivery_items'),
  to_regclass('public.qb_receipt_lines'),to_regclass('public.qb_operational_preparation_items'),
  to_regclass('public.qb_supervisor_receipt_lines'),to_regclass('public.qb_order_items')
])
order by object_name,column_name,grantee,privilege_type;

select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies
where schemaname='public' and tablename=any(array[
  'qb_order_preparation_items','qb_order_delivery_items','qb_receipt_lines','qb_order_items'
])
order by tablename,policyname;

with expected(signature) as (values
 ('public.save_qb_matrix_preparation_origin_with_unit(uuid,integer,numeric,boolean,numeric,text,text,numeric,numeric,numeric,boolean,text)'),
 ('public.save_qb_matrix_delivery_origin_with_unit(uuid,integer,numeric,numeric,boolean,numeric,text,text,numeric,numeric,numeric,numeric,boolean,text)'),
 ('public.save_qb_matrix_preparation_item_with_unit(uuid,integer,numeric,boolean,numeric,text,text,text)'),
 ('public.save_qb_matrix_delivery_item_with_unit(uuid,integer,numeric,numeric,boolean,numeric,text,text,text)'),
 ('public.save_qb_matrix_preparation_item_with_weight(uuid,integer,numeric,boolean,numeric,text,text)'),
 ('public.save_qb_matrix_delivery_item_with_weight(uuid,integer,numeric,numeric,boolean,numeric,text,text)'),
 ('public.save_qb_matrix_delivery_item_with_weight_v1(uuid,integer,numeric,numeric,boolean,numeric,text,text)'),
 ('public.save_qb_matrix_delivery_item_with_weight_v2(uuid,integer,numeric,numeric,boolean,numeric,text,text)'),
 ('public.save_qb_matrix_preparation_item(uuid,integer,numeric,boolean,text,text)'),
 ('public.save_qb_matrix_delivery_item(uuid,integer,numeric,numeric,boolean,text,text)'),
 ('public.guard_qb_order_item_presentation_dimension()'),
 ('public.guard_qb_order_item_presentation_snapshot()')
)
select e.signature,p.oid is not null as exists,
       case when p.oid is null then null else has_function_privilege('authenticated',p.oid,'execute') end as authenticated_execute,
       case when p.oid is null then null else has_function_privilege('anon',p.oid,'execute') end as anon_execute,
       case when p.oid is null then null else exists(
         select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x
         where x.grantee=0 and x.privilege_type='EXECUTE'
       ) end as public_execute
from expected e left join pg_proc p on p.oid=to_regprocedure(e.signature)
order by e.signature;

-- 11. Dependencies that can affect CREATE OR REPLACE VIEW/FUNCTION.
select 'view' as referenced_kind,
       v.oid::regclass::text as referenced_object,
       pg_describe_object(d.classid,d.objid,d.objsubid) as dependent_object,
       d.deptype
from pg_class v
join pg_depend d on d.refclassid='pg_class'::regclass and d.refobjid=v.oid
where v.oid=any(array[to_regclass('public.qb_operational_preparation_items'),to_regclass('public.qb_supervisor_receipt_lines')])
  and d.classid='pg_rewrite'::regclass
order by referenced_object,dependent_object;

with expected(signature) as (values
 ('public.save_qb_matrix_preparation_origin_with_unit(uuid,integer,numeric,boolean,numeric,text,text,numeric,numeric,numeric,boolean,text)'),
 ('public.save_qb_matrix_delivery_origin_with_unit(uuid,integer,numeric,numeric,boolean,numeric,text,text,numeric,numeric,numeric,numeric,boolean,text)'),
 ('public.save_qb_matrix_preparation_item_with_unit(uuid,integer,numeric,boolean,numeric,text,text,text)'),
 ('public.save_qb_matrix_delivery_item_with_unit(uuid,integer,numeric,numeric,boolean,numeric,text,text,text)'),
 ('public.save_qb_matrix_preparation_item_with_weight(uuid,integer,numeric,boolean,numeric,text,text)'),
 ('public.save_qb_matrix_delivery_item_with_weight(uuid,integer,numeric,numeric,boolean,numeric,text,text)'),
 ('public.save_qb_matrix_delivery_item_with_weight_v1(uuid,integer,numeric,numeric,boolean,numeric,text,text)'),
 ('public.save_qb_matrix_delivery_item_with_weight_v2(uuid,integer,numeric,numeric,boolean,numeric,text,text)'),
 ('public.save_qb_matrix_preparation_item(uuid,integer,numeric,boolean,text,text)'),
 ('public.save_qb_matrix_delivery_item(uuid,integer,numeric,numeric,boolean,text,text)')
)
select e.signature,pg_describe_object(d.classid,d.objid,d.objsubid) as dependent_object,d.deptype
from expected e join pg_proc p on p.oid=to_regprocedure(e.signature)
join pg_depend d on d.refclassid='pg_proc'::regclass and d.refobjid=p.oid
order by e.signature,dependent_object;

-- 12. Automatic compatibility matrix. A no-verifiable result is intentional
--     when catalog metadata cannot establish a safe conclusion without rows.
with required_migrations(version) as (values
 ('20260712090500'),('20260712090800'),('20260712090900'),('20260712091000'),
 ('20260723130000'),('20260723130100'),('20260723210100'),('20260724110000'),('20260725010000'),('20260725010500'),
 ('20260804010000'),('20260812010000'),('20260918010000'),('20260926010000'),('20260928010000'),
 ('20260929010000'),('20261002160000'),('20261007120000'),('20261007130000'),('20261027100000'),
 ('20261027120000'),('20261104100000')
), applied as (
 select version::text as version from supabase_migrations.schema_migrations
), missing_migrations as (
 select array_agg(r.version order by r.version) as versions
 from required_migrations r left join applied a using(version) where a.version is null
), view_expected(view_name,expected_columns) as (values
 ('qb_operational_preparation_items',array[
  'id','preparation_id','order_item_id','product_id','requested_source_label','requested_quantity',
  'requested_base_unit_id','requested_base_unit_symbol','requested_base_quantity','actual_allowed_unit_id',
  'actual_source_kind','actual_source_unit_id','actual_product_presentation_id','actual_source_label',
  'actual_quantity','actual_base_unit_id','actual_base_unit_symbol','actual_base_quantity',
  'conversion_factor_to_base','conversion_snapshot_id','status','notes','created_at','updated_at',
  'preparation_check','prepared_by_line','prepared_at_line','row_version','last_idempotency_key',
  'actual_weight_kg','display_unit_id','prepared_by_name','origin_plan_confirmed',
  'planned_pending_base_quantity','planned_external_base_quantity','planned_review_base_quantity']::text[]),
 ('qb_supervisor_receipt_lines',array[
  'id','receipt_id','order_id','order_reference','product_id','product_name_snapshot',
  'product_code_snapshot','category_name_snapshot','delivered_base_quantity','base_unit_symbol',
  'visible_unit_label','order_input_mode','requested_amount_bs','currency_snapshot','pricing_unit_symbol',
  'estimated_base_quantity','fixed_line_amount','base_price_used','final_unit_price','line_total',
  'cost_base_unit_snapshot','notes','created_at']::text[])
), view_check as (
 select e.view_name,e.expected_columns,c.oid as view_oid,
        array(select a.attname::text from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped order by a.attnum) as actual_columns,
        c.reloptions
 from view_expected e left join pg_class c on c.oid=to_regclass('public.'||e.view_name)
), view_source_types as (
 select v.view_name,va.attname,
        format_type(va.atttypid,va.atttypmod) as view_type,
        format_type(sa.atttypid,sa.atttypmod) as source_type,
        sa.attnum is not null as source_column_exists
 from view_check v
 join pg_attribute va on va.attrelid=v.view_oid and va.attnum>0 and not va.attisdropped
 left join pg_class source_table on source_table.oid=to_regclass('public.'||
   case when v.view_name='qb_operational_preparation_items' and va.attname='prepared_by_name' then 'profiles'
        when v.view_name='qb_operational_preparation_items' then 'qb_order_preparation_items'
        when va.attname='order_reference' then 'qb_orders'
        when va.attname='pricing_unit_symbol' then 'qb_units'
        else 'qb_receipt_lines' end)
 left join pg_attribute sa on sa.attrelid=source_table.oid and sa.attnum>0 and not sa.attisdropped
   and sa.attname=case when v.view_name='qb_operational_preparation_items' and va.attname='prepared_by_name' then 'full_name'
        when va.attname='order_reference' then 'public_reference'
        when va.attname='pricing_unit_symbol' then 'symbol'
        else va.attname end
), new_columns(table_name,column_name,expected_type) as (values
 ('qb_order_preparation_items','actual_weight_value','numeric(18,6)'),
 ('qb_order_preparation_items','actual_weight_unit_id','uuid'),
 ('qb_order_preparation_items','actual_weight_factor_to_kg','numeric(18,9)'),
 ('qb_order_delivery_items','actual_weight_value','numeric(18,6)'),
 ('qb_order_delivery_items','actual_weight_unit_id','uuid'),
 ('qb_order_delivery_items','actual_weight_factor_to_kg','numeric(18,9)'),
 ('qb_receipt_lines','actual_weight_value','numeric(18,6)'),
 ('qb_receipt_lines','actual_weight_unit_id','uuid'),
 ('qb_receipt_lines','actual_weight_factor_to_kg','numeric(18,9)'),
 ('qb_receipt_lines','actual_weight_kg','numeric(18,6)'),
 ('qb_receipt_lines','commercial_quantity_snapshot','numeric(18,6)'),
 ('qb_receipt_lines','commercial_unit_label_snapshot','text'),
 ('qb_receipt_lines','commercial_conversion_factor_snapshot','numeric(18,9)')
), column_state as (
 select e.*,a.attnum is not null as present,
        case when a.attnum is null then null else format_type(a.atttypid,a.atttypmod) end as actual_type
 from new_columns e left join pg_class c on c.oid=to_regclass('public.'||e.table_name)
 left join pg_attribute a on a.attrelid=c.oid and a.attname=e.column_name and a.attnum>0 and not a.attisdropped
), base_columns(table_name,column_name,expected_type) as (values
 ('qb_order_preparation_items','actual_weight_kg','numeric(18,6)'),
 ('qb_order_preparation_items','display_unit_id','text'),
 ('qb_order_preparation_items','prepared_by_line','uuid'),
 ('qb_order_preparation_items','origin_plan_confirmed','boolean'),
 ('qb_order_preparation_items','planned_pending_base_quantity','numeric(18,6)'),
 ('qb_order_preparation_items','planned_external_base_quantity','numeric(18,6)'),
 ('qb_order_preparation_items','planned_review_base_quantity','numeric(18,6)'),
 ('qb_order_preparation_items','order_item_id','uuid'),
 ('qb_order_delivery_items','actual_weight_kg','numeric(18,6)'),
 ('qb_order_delivery_items','order_item_id','uuid'),
 ('qb_order_delivery_items','display_unit_id','text'),
 ('qb_order_delivery_items','delivered_base_quantity','numeric(18,6)'),
 ('qb_order_delivery_items','source_origin_confirmed','boolean'),
 ('qb_order_delivery_items','warehouse_used_base_quantity','numeric(18,6)'),
 ('qb_order_delivery_items','pending_incoming_base_quantity','numeric(18,6)'),
 ('qb_order_delivery_items','external_definitive_base_quantity','numeric(18,6)'),
 ('qb_order_delivery_items','origin_review_base_quantity','numeric(18,6)'),
 ('qb_receipt_lines','preparation_item_id','uuid'),
 ('qb_receipt_lines','order_id','uuid'),
 ('qb_orders','public_reference','text'),
 ('profiles','full_name','text'),('profiles','role','text'),('profiles','is_active','boolean'),
 ('qb_units','symbol','text'),('qb_units','dimension_id','uuid'),('qb_units','conversion_factor_to_base','numeric(18,9)'),
 ('qb_unit_dimensions','code','text'),('qb_unit_dimensions','is_active','boolean'),
 ('qb_order_items','source_kind','text'),('qb_order_items','product_presentation_id','uuid'),
 ('qb_order_items','product_id','uuid'),('qb_order_items','base_unit_id','uuid'),('qb_order_items','source_label','text'),
 ('qb_order_items','requested_quantity','numeric(18,6)'),('qb_order_items','conversion_factor_to_base','numeric(18,9)'),
 ('qb_order_items','base_quantity','numeric(18,6)'),
 ('qb_product_presentations','id','uuid'),('qb_product_presentations','product_id','uuid'),
 ('qb_product_presentations','base_unit_id','uuid'),('qb_product_presentations','symbol','text'),
 ('qb_product_presentations','conversion_factor_to_base','numeric(18,9)'),
 ('qb_product_presentations','is_active','boolean'),('qb_product_presentations','allow_order','boolean'),
 ('qb_order_line_change_events','stage','text'),('qb_order_line_change_events','field_name','text'),
 ('qb_order_line_change_events','old_value','jsonb'),('qb_order_line_change_events','new_value','jsonb'),
 ('qb_order_line_change_events','actor_id','uuid'),('qb_order_line_change_events','actor_role','text'),
 ('qb_order_line_change_events','correlation_key','text'),('qb_order_line_change_events','idempotency_key','text')
), base_column_state as (
 select e.*,format_type(a.atttypid,a.atttypmod) as actual_type,a.attnum is not null as present
 from base_columns e left join pg_class c on c.oid=to_regclass('public.'||e.table_name)
 left join pg_attribute a on a.attrelid=c.oid and a.attname=e.column_name and a.attnum>0 and not a.attisdropped
), new_view_columns(view_name,column_name,expected_type,source_table,source_column,source_added_by_migration) as (values
 ('qb_operational_preparation_items','actual_weight_value','numeric(18,6)','qb_order_preparation_items','actual_weight_value',true),
 ('qb_operational_preparation_items','actual_weight_unit_id','uuid','qb_order_preparation_items','actual_weight_unit_id',true),
 ('qb_operational_preparation_items','actual_weight_factor_to_kg','numeric(18,9)','qb_order_preparation_items','actual_weight_factor_to_kg',true),
 ('qb_supervisor_receipt_lines','actual_weight_value','numeric(18,6)','qb_receipt_lines','actual_weight_value',true),
 ('qb_supervisor_receipt_lines','actual_weight_unit_id','uuid','qb_receipt_lines','actual_weight_unit_id',true),
 ('qb_supervisor_receipt_lines','actual_weight_factor_to_kg','numeric(18,9)','qb_receipt_lines','actual_weight_factor_to_kg',true),
 ('qb_supervisor_receipt_lines','actual_weight_kg','numeric(18,6)','qb_receipt_lines','actual_weight_kg',true),
 ('qb_supervisor_receipt_lines','actual_weight_unit_symbol','text','qb_units','symbol',false),
 ('qb_supervisor_receipt_lines','commercial_quantity_snapshot','numeric(18,6)','qb_receipt_lines','commercial_quantity_snapshot',true),
 ('qb_supervisor_receipt_lines','commercial_unit_label_snapshot','text','qb_receipt_lines','commercial_unit_label_snapshot',true),
 ('qb_supervisor_receipt_lines','commercial_conversion_factor_snapshot','numeric(18,9)','qb_receipt_lines','commercial_conversion_factor_snapshot',true)
), function_expected(signature,delegate_name) as (values
 ('public.save_qb_matrix_preparation_origin_with_unit(uuid,integer,numeric,boolean,numeric,text,text,numeric,numeric,numeric,boolean,text)','save_qb_matrix_preparation_item_with_unit'),
 ('public.save_qb_matrix_delivery_origin_with_unit(uuid,integer,numeric,numeric,boolean,numeric,text,text,numeric,numeric,numeric,numeric,boolean,text)','save_qb_matrix_delivery_item_with_unit'),
 ('public.save_qb_matrix_preparation_item_with_unit(uuid,integer,numeric,boolean,numeric,text,text,text)','save_qb_matrix_preparation_item_with_weight'),
 ('public.save_qb_matrix_delivery_item_with_unit(uuid,integer,numeric,numeric,boolean,numeric,text,text,text)','save_qb_matrix_delivery_item_with_weight'),
 ('public.save_qb_matrix_preparation_item_with_weight(uuid,integer,numeric,boolean,numeric,text,text)','save_qb_matrix_preparation_item'),
 ('public.save_qb_matrix_delivery_item_with_weight(uuid,integer,numeric,numeric,boolean,numeric,text,text)','save_qb_matrix_delivery_item_with_weight_v2'),
 ('public.save_qb_matrix_delivery_item_with_weight_v1(uuid,integer,numeric,numeric,boolean,numeric,text,text)','save_qb_matrix_delivery_item'),
 ('public.save_qb_matrix_delivery_item_with_weight_v2(uuid,integer,numeric,numeric,boolean,numeric,text,text)','save_qb_matrix_delivery_item_with_weight_v1')
), function_state as (
 select e.signature,e.delegate_name,p.oid,p.prorettype,p.prosecdef,p.proconfig,l.lanname,p.prosrc,
        has_function_privilege('authenticated',p.oid,'execute') as auth_execute,
        has_function_privilege('anon',p.oid,'execute') as anon_execute,
        exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x where x.grantee=0 and x.privilege_type='EXECUTE') as public_execute
 from function_expected e left join pg_proc p on p.oid=to_regprocedure(e.signature)
 left join pg_language l on l.oid=p.prolang
), checks as (
 select 'migration-ledger'::text as check_name,
   case when to_regclass('supabase_migrations.schema_migrations') is null then 'NO VERIFICABLE'
        when (select versions from missing_migrations) is not null then 'INCOMPATIBLE'
        when exists(select 1 from applied where version='20261107100000') then 'NO VERIFICABLE'
        else 'COMPATIBLE' end as result,
   'Required predecessor versions; target 20261107100000 must not be applied yet'::text as expected,
   coalesce((select array_to_string(versions,', ') from missing_migrations),'none missing') ||
     case when exists(select 1 from applied where version='20261107100000') then '; target already recorded' else '; target not recorded' end as observed
 union all
 select 'predecessor-view:'||view_name,
   case when view_oid is null then 'INCOMPATIBLE' when actual_columns<>expected_columns then 'INCOMPATIBLE' else 'COMPATIBLE' end,
   array_to_string(expected_columns,', '),coalesce(array_to_string(actual_columns,', '),'view missing')
 from view_check
 union all
 select 'view-source-types:'||view_name,
   case when bool_and(source_column_exists and view_type=source_type) then 'COMPATIBLE' else 'INCOMPATIBLE' end,
   'Every view prefix column must retain the exact PostgreSQL type/modifier of its source projection',
   coalesce(string_agg(attname||'='||coalesce(view_type,'missing')||' vs source '||coalesce(source_type,'missing'),'; '
     order by attname) filter(where not source_column_exists or view_type<>source_type),'all projected source types match')
 from view_source_types group by view_name
 union all
 select 'new-column-contract:'||table_name||'.'||column_name,
   case when present and actual_type<>expected_type then 'INCOMPATIBLE'
        when present then 'NO VERIFICABLE' else 'COMPATIBLE' end,
   expected_type||' (column absent before migration)',coalesce(actual_type,'absent')
 from column_state
 union all
 select 'base-column:'||table_name||'.'||column_name,
   case when not present then 'INCOMPATIBLE' when actual_type<>expected_type then 'INCOMPATIBLE' else 'COMPATIBLE' end,
   expected_type,coalesce(actual_type,'missing')
 from base_column_state
 union all
 select 'target-view-column:'||e.view_name||'.'||e.column_name,
   case when v.view_oid is null then 'INCOMPATIBLE'
        when existing.attnum is not null then 'NO VERIFICABLE'
        when source.attnum is null and e.source_added_by_migration then 'COMPATIBLE'
        when source.attnum is null then 'INCOMPATIBLE'
        when format_type(source.atttypid,source.atttypmod)<>e.expected_type then 'INCOMPATIBLE'
        else 'COMPATIBLE' end,
   'migration appends column with type '||e.expected_type,
   case when v.view_oid is null then 'view missing'
        when existing.attnum is not null then 'column already exists in current view; possible partial application/drift'
        when source.attnum is null and e.source_added_by_migration then 'source column absent; target migration adds it with declared type'
        when source.attnum is null then 'source column missing: '||e.source_table||'.'||e.source_column
        else 'source type='||format_type(source.atttypid,source.atttypmod) end
 from new_view_columns e
 join view_check v on v.view_name=e.view_name
 left join pg_attribute existing on existing.attrelid=v.view_oid and existing.attname=e.column_name
   and existing.attnum>0 and not existing.attisdropped
 left join pg_class source_table on source_table.oid=to_regclass('public.'||e.source_table)
 left join pg_attribute source on source.attrelid=source_table.oid and source.attname=e.source_column
   and source.attnum>0 and not source.attisdropped
 union all
 select 'target-function:'||signature,
   case when p.oid is null then 'COMPATIBLE'
        when pg_get_function_result(p.oid)<>expected_return then 'INCOMPATIBLE'
        else 'NO VERIFICABLE' end,
   'new function absent before migration; if present, compare exact arguments/body/security metadata above',
   case when p.oid is null then 'absent'
        else 'already exists with return type '||pg_get_function_result(p.oid)||'; inspect definition and consider partial application/drift' end
 from (values
   ('public.save_qb_matrix_preparation_origin_with_weight_snapshot(uuid,integer,numeric,boolean,numeric,uuid,numeric,boolean,text,text,numeric,numeric,numeric,boolean,text)','jsonb'),
   ('public.save_qb_matrix_delivery_origin_with_weight_snapshot(uuid,integer,numeric,numeric,boolean,numeric,uuid,numeric,boolean,text,text,numeric,numeric,numeric,numeric,boolean,text)','jsonb'),
   ('public.snapshot_qb_receipt_line_actual_weight()','trigger'),
   ('public.guard_qb_order_item_presentation_snapshot()','trigger')
 ) target(signature,expected_return)
 left join pg_proc p on p.oid=to_regprocedure(signature)
 union all
 select 'delegate:'||signature,
   case when oid is null then 'INCOMPATIBLE'
        when prorettype<>'jsonb'::regtype or not prosecdef or lanname<>'plpgsql'
          or not (coalesce(proconfig,'{}') @> array['search_path=pg_catalog'])
          or position(lower('public.'||delegate_name||'(') in lower(prosrc))=0
          or not auth_execute or anon_execute or public_execute then 'INCOMPATIBLE'
        else 'COMPATIBLE' end,
   'jsonb; PL/pgSQL SECURITY DEFINER; search_path=pg_catalog; delegates to public.'||delegate_name||'(); EXECUTE authenticated only',
   case when oid is null then 'function signature missing' else
     'return='||pg_get_function_result(oid)||'; security_definer='||prosecdef||'; language='||lanname||
     '; settings='||coalesce(array_to_string(proconfig,','),'(none)')||'; authenticated='||auth_execute||
     '; anon='||anon_execute||'; public='||public_execute||'; delegate='||
     (position(lower('public.'||delegate_name||'(') in lower(prosrc))>0)::text end
 from function_state
 union all
 select 'view-security:'||view_name,
   case when view_oid is null then 'INCOMPATIBLE'
        when not (coalesce(reloptions,'{}') @> array['security_barrier=true']) then 'INCOMPATIBLE'
        when not has_table_privilege('authenticated',view_oid,'select') then 'INCOMPATIBLE'
        when has_table_privilege('anon',view_oid,'select') then 'INCOMPATIBLE'
        when exists(select 1 from aclexplode(coalesce((select relacl from pg_class where oid=view_oid),acldefault('r',(select relowner from pg_class where oid=view_oid)))) x where x.grantee=0 and x.privilege_type='SELECT') then 'INCOMPATIBLE'
        else 'COMPATIBLE' end,
   'security_barrier=true; SELECT authenticated; no SELECT anon/PUBLIC',
   'options='||coalesce(array_to_string(reloptions,','),'(none)')||'; authenticated='||has_table_privilege('authenticated',view_oid,'select')||
     '; anon='||has_table_privilege('anon',view_oid,'select')
 from view_check
 union all
 select 'target-constraint:'||name,
   case when exists(select 1 from pg_constraint c where c.conname=name and c.conrelid=to_regclass('public.'||table_name))
     then 'NO VERIFICABLE' else 'COMPATIBLE' end,
   'absent before target migration',
   coalesce((select pg_get_constraintdef(c.oid,true) from pg_constraint c where c.conname=name and c.conrelid=to_regclass('public.'||table_name) limit 1),'absent')
 from (values
   ('qb_order_preparation_items','qb_preparation_weight_snapshot_check'),
   ('qb_order_delivery_items','qb_delivery_weight_snapshot_check'),
   ('qb_receipt_lines','qb_receipt_weight_snapshot_check'),
   ('qb_receipt_lines','qb_receipt_commercial_quantity_snapshot_check')
 ) target(table_name,name)
 union all
 select 'drop-old-presentation-guard',
   case when to_regprocedure('public.guard_qb_order_item_presentation_dimension()') is null then 'COMPATIBLE'
        when exists(
          select 1 from pg_depend d
          where d.refclassid='pg_proc'::regclass
            and d.refobjid=to_regprocedure('public.guard_qb_order_item_presentation_dimension()')
            and not (d.classid='pg_trigger'::regclass and exists(
              select 1 from pg_trigger t where t.oid=d.objid and t.tgrelid=to_regclass('public.qb_order_items')
                and t.tgname='guard_qb_order_item_presentation_dimension'
            ))
        ) then 'INCOMPATIBLE' else 'COMPATIBLE' end,
   'old function absent or has no dependents except trigger dropped by migration',
   case when to_regprocedure('public.guard_qb_order_item_presentation_dimension()') is null then 'function absent'
        else coalesce((select string_agg(pg_describe_object(d.classid,d.objid,d.objsubid),'; ')
          from pg_depend d where d.refclassid='pg_proc'::regclass
            and d.refobjid=to_regprocedure('public.guard_qb_order_item_presentation_dimension()')
            and not (d.classid='pg_trigger'::regclass and exists(
              select 1 from pg_trigger t where t.oid=d.objid and t.tgrelid=to_regclass('public.qb_order_items')
                and t.tgname='guard_qb_order_item_presentation_dimension'
            ))),'only expected trigger dependency or none') end
)
select result,check_name,expected,observed
from checks
order by case result when 'INCOMPATIBLE' then 1 when 'NO VERIFICABLE' then 2 else 3 end,check_name;

commit;
