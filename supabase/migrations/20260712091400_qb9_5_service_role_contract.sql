-- QB-9.5: explicit server-only service_role contract.
-- The role bypasses RLS, but still requires object privileges. Only operations
-- used by active server code are allowed here.

begin;

-- Remove synthetic baseline privileges and privileges inherited by objects that
-- are not part of the active administrative contract.
revoke all on table
  public.profiles,
  public.audit_logs,
  public.customer_accounts,
  public.products,
  public.product_categories,
  public.units_of_measure,
  public.inventory_movements,
  public.customers,
  public.orders,
  public.order_items,
  public.purchases,
  public.purchase_items,
  public.sales,
  public.sale_items,
  public.accounts_receivable,
  public.accounts_payable,
  public.payments,
  public.cash_movements,
  public.qb_unit_dimensions,
  public.qb_units,
  public.qb_product_unit_settings,
  public.qb_product_presentations,
  public.qb_product_allowed_units,
  public.qb_product_classification_outputs,
  public.qb_conversion_snapshots,
  public.qb_merchandise_receipts,
  public.qb_merchandise_receipt_lines,
  public.qb_merchandise_receipt_classification_results,
  public.qb_merchandise_receipt_movements,
  public.qb_customer_locations,
  public.qb_orders,
  public.qb_order_items,
  public.qb_order_preparations,
  public.qb_order_preparation_items,
  public.qb_order_delivery_movements,
  public.qb_receipts,
  public.qb_receipt_orders,
  public.qb_receipt_lines,
  public.qb_receipt_events
from service_role;

-- Active internal-user administration reads existing profiles and creates the
-- profile paired with a user created through the Supabase Admin Auth API.
grant select, insert on table public.profiles to service_role;

-- Audit events are append-only for server code. Reading remains an
-- authenticated-administrator operation protected by RLS.
grant insert on table public.audit_logs to service_role;

-- Customer signup creates Auth through the normal Auth API and then creates the
-- corresponding customer account server-side. No direct read/update/delete is
-- required by the active QB flow.
grant insert on table public.customer_accounts to service_role;

-- This RPC belongs to the suspended legacy guest checkout. The active QB
-- catalog creates and relates orders through create_qb_catalog_order().
revoke execute on function public.link_public_order_customer_account(uuid, text, uuid)
from service_role;

commit;

