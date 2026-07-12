select 'profiles' as table_name, count(*) as row_count from public.profiles
union all select 'products', count(*) from public.products
union all select 'product_categories', count(*) from public.product_categories
union all select 'inventory_movements', count(*) from public.inventory_movements
union all select 'customer_accounts', count(*) from public.customer_accounts
union all select 'audit_logs', count(*) from public.audit_logs
union all select 'qb_unit_dimensions', count(*) from public.qb_unit_dimensions
union all select 'qb_units', count(*) from public.qb_units
union all select 'qb_product_unit_settings', count(*) from public.qb_product_unit_settings
union all select 'qb_product_presentations', count(*) from public.qb_product_presentations
union all select 'qb_product_allowed_units', count(*) from public.qb_product_allowed_units
union all select 'qb_product_classification_outputs', count(*) from public.qb_product_classification_outputs
union all select 'qb_conversion_snapshots', count(*) from public.qb_conversion_snapshots
union all select 'qb_merchandise_receipts', count(*) from public.qb_merchandise_receipts
union all select 'qb_merchandise_receipt_lines', count(*) from public.qb_merchandise_receipt_lines
union all select 'qb_merchandise_receipt_classification_results', count(*) from public.qb_merchandise_receipt_classification_results
union all select 'qb_merchandise_receipt_movements', count(*) from public.qb_merchandise_receipt_movements
union all select 'qb_customer_locations', count(*) from public.qb_customer_locations
union all select 'qb_orders', count(*) from public.qb_orders
union all select 'qb_order_items', count(*) from public.qb_order_items
union all select 'qb_order_preparations', count(*) from public.qb_order_preparations
union all select 'qb_order_preparation_items', count(*) from public.qb_order_preparation_items
union all select 'qb_order_delivery_movements', count(*) from public.qb_order_delivery_movements
union all select 'qb_receipts', count(*) from public.qb_receipts
union all select 'qb_receipt_orders', count(*) from public.qb_receipt_orders
union all select 'qb_receipt_lines', count(*) from public.qb_receipt_lines
union all select 'qb_receipt_events', count(*) from public.qb_receipt_events
order by table_name;

