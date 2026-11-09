-- Preflight de solo lectura para el SQL Editor de Supabase.
-- Usar únicamente en el proyecto/entorno que el propietario haya seleccionado.
-- El resultado contiene agregados y estado de acceso, nunca filas personales.
BEGIN TRANSACTION READ ONLY;

WITH targets(section, schema_name, table_name) AS (
  VALUES
  ('maestros','public','products'),('maestros','public','product_categories'),('maestros','public','units_of_measure'),('maestros','public','qb_units'),('maestros','public','qb_unit_dimensions'),('maestros','public','qb_product_unit_settings'),('maestros','public','qb_product_allowed_units'),('maestros','public','qb_product_presentations'),('maestros','public','qb_product_classification_outputs'),('maestros','public','qb_product_unit_regularization_audit'),('maestros','public','product_deletion_audit'),('maestros','public','customer_accounts'),('maestros','public','customers'),('maestros','public','qb_customer_locations'),('maestros','public','profiles'),('maestros','auth','users'),('maestros','public','qb_operational_settings'),('maestros','public','qb_ui_settings'),
  ('pedidos','public','qb_orders'),('pedidos','public','qb_order_items'),('pedidos','public','qb_order_line_change_events'),('pedidos','public','qb_operational_day_orders'),
  ('operacion','public','qb_order_preparations'),('operacion','public','qb_order_preparation_items'),('operacion','public','qb_order_delivery_confirmations'),('operacion','public','qb_order_delivery_items'),('operacion','public','qb_order_delivery_movements'),
  ('compras','public','qb_merchandise_receipts'),('compras','public','qb_merchandise_receipt_lines'),('compras','public','qb_merchandise_receipt_classification_results'),('compras','public','qb_merchandise_receipt_movements'),
  ('recibos','public','qb_receipts'),('recibos','public','qb_receipt_orders'),('recibos','public','qb_receipt_lines'),('recibos','public','qb_receipt_events'),
  ('conciliacion','public','qb_same_day_reconciliation_requests'),('conciliacion','public','qb_same_day_reconciliation_allocations'),('conciliacion','public','qb_same_day_reconciliation_events'),
  ('stock_fifo','public','inventory_movements'),('stock_fifo','public','inventory_lots'),('stock_fifo','public','inventory_lot_consumptions'),('stock_fifo','public','inventory_lot_writeoffs'),('stock_fifo','public','inventory_fifo_consumption_runs'),
  ('compras_finanzas','public','qb_warehouse_operating_expenses'),('compras_finanzas','public','orders'),('compras_finanzas','public','order_items'),('compras_finanzas','public','purchases'),('compras_finanzas','public','purchase_items'),('compras_finanzas','public','sales'),('compras_finanzas','public','sale_items'),('compras_finanzas','public','payments'),('compras_finanzas','public','cash_movements'),('compras_finanzas','public','accounts_receivable'),('compras_finanzas','public','accounts_payable'),
  ('soporte','public','qb_conversion_snapshots'),('soporte','private','qb_guest_order_idempotency'),('soporte','private','qb_guest_order_rate_limits'),('soporte','private','qb_order_amount_snapshots'),('soporte','private','qb_operational_import_batches'),('auditoria','public','audit_logs')
), resolved AS (
  SELECT t.section,t.schema_name,t.table_name,n.oid AS schema_oid,c.oid AS relation_oid,
         n.oid IS NOT NULL AND c.oid IS NOT NULL AS installed,
         n.oid IS NOT NULL AND c.oid IS NOT NULL
           AND has_schema_privilege(current_user,n.oid,'USAGE')
           AND has_table_privilege(current_user,c.oid,'SELECT') AS readable
  FROM targets t
  LEFT JOIN pg_namespace n ON n.nspname=t.schema_name
  LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=t.table_name
    AND c.relkind IN ('r','p','v','m','f')
), counts AS (
  SELECT section,schema_name,table_name,installed,readable,
    CASE WHEN readable THEN
      (xpath('/table/row/n/text()',query_to_xml(
        format('select count(*) as n from %I.%I',schema_name,table_name),true,false,'')))[1]::text::bigint
    ELSE NULL END AS row_count
  FROM resolved
)
SELECT jsonb_build_object(
  'transaction_read_only', current_setting('transaction_read_only') = 'on',
  'executed_as', current_user,
  'table_counts', (
    SELECT jsonb_object_agg(schema_name||'.'||table_name,
      jsonb_build_object(
        'status', CASE WHEN NOT installed THEN 'NO_INSTALADA' WHEN NOT readable THEN 'NO_ACCESIBLE' ELSE 'OK' END,
        'count', row_count
      ) ORDER BY schema_name,table_name)
    FROM counts
  ),
  'unavailable_tables', (
    SELECT coalesce(jsonb_agg(jsonb_build_object('schema',schema_name,'table',table_name,
      'status',CASE WHEN NOT installed THEN 'NO_INSTALADA' ELSE 'NO_ACCESIBLE' END)
      ORDER BY schema_name,table_name),'[]'::jsonb)
    FROM counts WHERE NOT installed OR NOT readable
  ),
  'stock_by_unit', CASE
    WHEN NOT coalesce((SELECT readable FROM counts WHERE schema_name='public' AND table_name='products'),false)
      THEN jsonb_build_object('status',CASE WHEN coalesce((SELECT installed FROM counts WHERE schema_name='public' AND table_name='products'),false) THEN 'NO_ACCESIBLE' ELSE 'NO_INSTALADA' END)
    WHEN NOT coalesce((SELECT readable FROM counts WHERE schema_name='public' AND table_name='units_of_measure'),false)
      THEN jsonb_build_object('status',CASE WHEN coalesce((SELECT installed FROM counts WHERE schema_name='public' AND table_name='units_of_measure'),false) THEN 'NO_ACCESIBLE' ELSE 'NO_INSTALADA' END)
    ELSE (
      SELECT jsonb_build_object('status','OK','rows',coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.unidad),'[]'::jsonb))
      FROM (
        SELECT coalesce(u.name,'UNIDAD_SIN_NOMBRE') unidad,count(*) productos,
          count(*) FILTER(WHERE coalesce(p.stock_current,0)<>0) productos_con_saldo,
          coalesce(sum(p.stock_current),0) saldo_total_en_esa_unidad,
          count(*) FILTER(WHERE p.stock_current<0) productos_con_saldo_negativo
        FROM public.products p LEFT JOIN public.units_of_measure u ON u.id=p.unit_id
        GROUP BY coalesce(u.name,'UNIDAD_SIN_NOMBRE')
      ) s
    ) END,
  'audit_counts', CASE
    WHEN NOT coalesce((SELECT readable FROM counts WHERE schema_name='public' AND table_name='audit_logs'),false)
      THEN jsonb_build_object('status',CASE WHEN coalesce((SELECT installed FROM counts WHERE schema_name='public' AND table_name='audit_logs'),false) THEN 'NO_ACCESIBLE' ELSE 'NO_INSTALADA' END)
    ELSE (
      SELECT jsonb_build_object('status','OK','total',count(*),
        'administrative_candidates',count(*) FILTER(WHERE lower(coalesce(entity_type,'')) IN ('auth','security','profile','user','configuration','system','product')
          OR lower(coalesce(action,'')) LIKE '%login%' OR lower(coalesce(action,'')) LIKE '%regularize%'
          OR lower(coalesce(action,'')) LIKE '%price%' OR lower(coalesce(action,'')) LIKE '%user%'
          OR lower(coalesce(action,'')) LIKE '%role%' OR lower(coalesce(action,'')) LIKE '%reset%'),
        'operational_candidates_by_entity_type',count(*) FILTER(WHERE lower(coalesce(entity_type,'')) IN ('order','qb_order','order_item','preparation','delivery','receipt','qb_receipt','sale','purchase','inventory_movement','inventory_lot','merchandise_receipt','qb_merchandise_receipt','stock_adjustment','qb_order_delivery_movement','qb_order_preparation_items','qb_warehouse_operating_expense')))
      FROM public.audit_logs
    ) END
) AS preliminary_counts;

COMMIT;
