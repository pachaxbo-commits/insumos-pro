-- Conteo READ ONLY para Supabase SQL Editor. Solo retorna conteos.
-- Ejecutar exclusivamente en qb-insumos-staging-v2 (tekfwbhvqtojpfqusosg).
with targets(section, schema_name, table_name) as (
 values
 ('maestros','public','products'),('maestros','public','product_categories'),('maestros','public','units_of_measure'),('maestros','public','qb_units'),('maestros','public','qb_unit_dimensions'),('maestros','public','qb_product_unit_settings'),('maestros','public','qb_product_allowed_units'),('maestros','public','qb_product_presentations'),('maestros','public','qb_product_classification_outputs'),('maestros','public','qb_product_unit_regularization_audit'),('maestros','public','product_deletion_audit'),('maestros','public','customer_accounts'),('maestros','public','customers'),('maestros','public','qb_customer_locations'),('maestros','public','profiles'),('maestros','auth','users'),('maestros','public','qb_operational_settings'),('maestros','public','qb_ui_settings'),
 ('pedidos','public','qb_orders'),('pedidos','public','qb_order_items'),('pedidos','public','qb_order_line_change_events'),('pedidos','public','qb_operational_day_orders'),
 ('operacion','public','qb_order_preparations'),('operacion','public','qb_order_preparation_items'),('operacion','public','qb_order_delivery_confirmations'),('operacion','public','qb_order_delivery_items'),('operacion','public','qb_order_delivery_movements'),
 ('compras','public','qb_merchandise_receipts'),('compras','public','qb_merchandise_receipt_lines'),('compras','public','qb_merchandise_receipt_classification_results'),('compras','public','qb_merchandise_receipt_movements'),
 ('recibos','public','qb_receipts'),('recibos','public','qb_receipt_orders'),('recibos','public','qb_receipt_lines'),('recibos','public','qb_receipt_events'),
 ('conciliacion','public','qb_same_day_reconciliation_requests'),('conciliacion','public','qb_same_day_reconciliation_allocations'),('conciliacion','public','qb_same_day_reconciliation_events'),
 ('stock_fifo','public','inventory_movements'),('stock_fifo','public','inventory_lots'),('stock_fifo','public','inventory_lot_consumptions'),('stock_fifo','public','inventory_lot_writeoffs'),('stock_fifo','public','inventory_fifo_consumption_runs'),
 ('compras_finanzas','public','qb_warehouse_operating_expenses'),('compras_finanzas','public','orders'),('compras_finanzas','public','order_items'),('compras_finanzas','public','purchases'),('compras_finanzas','public','purchase_items'),('compras_finanzas','public','sales'),('compras_finanzas','public','sale_items'),('compras_finanzas','public','payments'),('compras_finanzas','public','cash_movements'),('compras_finanzas','public','accounts_receivable'),('compras_finanzas','public','accounts_payable'),
 ('soporte','public','qb_conversion_snapshots'),('soporte','private','qb_guest_order_idempotency'),('soporte','private','qb_guest_order_rate_limits'),('soporte','private','qb_order_amount_snapshots'),('soporte','private','qb_operational_import_batches'),('auditoria','public','audit_logs')
), counts as (
 select section,schema_name,table_name,
   case when to_regclass(format('%I.%I',schema_name,table_name)) is null then null
   else (xpath('/table/row/n/text()',query_to_xml(format('select count(*) as n from %I.%I',schema_name,table_name),true,false,'')))[1]::text::bigint end n,
   to_regclass(format('%I.%I',schema_name,table_name)) is not null installed
 from targets
)
-- Una sola fila para que SQL Editor y Supabase CLI entreguen el mismo informe.
select jsonb_build_object(
 'table_counts', (select jsonb_object_agg(schema_name||'.'||table_name,
   case when installed then to_jsonb(n) else to_jsonb('NO_INSTALADA'::text) end)
   from counts),
 'stock_by_unit', (select coalesce(jsonb_agg(to_jsonb(s) order by s.unidad),'[]'::jsonb)
   from (select coalesce(u.name,'UNIDAD_SIN_NOMBRE') unidad,count(*) productos,
     count(*) filter(where coalesce(p.stock_current,0)<>0) productos_con_saldo,
     coalesce(sum(p.stock_current),0) saldo_total_en_esa_unidad,
     count(*) filter(where p.stock_current<0) productos_con_saldo_negativo
   from public.products p left join public.units_of_measure u on u.id=p.unit_id
   group by coalesce(u.name,'UNIDAD_SIN_NOMBRE')) s),
 'audit_counts', (select jsonb_build_object(
   'total',count(*),
   'administrative_candidates',count(*) filter(where lower(coalesce(entity_type,'')) in ('auth','security','profile','user','configuration','system','product')
     or lower(coalesce(action,'')) like '%login%' or lower(coalesce(action,'')) like '%regularize%'
     or lower(coalesce(action,'')) like '%price%' or lower(coalesce(action,'')) like '%user%'
     or lower(coalesce(action,'')) like '%role%' or lower(coalesce(action,'')) like '%reset%'),
   'operational_candidates_by_entity_type',count(*) filter(where lower(coalesce(entity_type,'')) in ('order','qb_order','order_item','preparation','delivery','receipt','qb_receipt','sale','purchase','inventory_movement','inventory_lot','merchandise_receipt','qb_merchandise_receipt','stock_adjustment','qb_order_delivery_movement','qb_order_preparation_items','qb_warehouse_operating_expense')))
   from public.audit_logs)
) as preliminary_counts;
