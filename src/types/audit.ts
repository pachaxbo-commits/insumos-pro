import type { UserRole } from "@/types/auth";

export const AUDIT_ACTIONS = [
  "create_product",
  "update_product",
  "deactivate_product",
  "create_inventory_movement",
  "create_purchase",
  "confirm_purchase",
  "cancel_purchase",
  "cancel_confirmed_purchase",
  "create_purchase_batch",
  "update_purchase_batch",
  "create_purchase_batch_line",
  "update_purchase_batch_line",
  "delete_purchase_batch_line",
  "confirm_purchase_batch",
  "save_purchase_batch_line_classification",
  "create_sale",
  "confirm_sale",
  "cancel_sale",
  "cancel_confirmed_sale",
  "create_order",
  "confirm_order",
  "cancel_order",
  "register_customer_payment",
  "register_supplier_payment",
  "register_manual_cash_movement",
  "deactivate_customer",
  "deactivate_supplier",
  "create_user",
  "update_user",
  "change_user_role",
  "activate_user",
  "deactivate_user",
  "reset_user_access",
  "update_configuration",
  "create_qb_merchandise_receipt",
  "save_qb_merchandise_classification",
  "confirm_qb_merchandise_receipt",
  "annul_qb_merchandise_receipt",
] as const;

export const AUDIT_ENTITY_TYPES = [
  "product",
  "inventory_movement",
  "purchase",
  "purchase_batch",
  "purchase_classification",
  "sale",
  "order",
  "payment",
  "cash_movement",
  "customer",
  "supplier",
  "user",
  "configuration",
  "qb_merchandise_receipt",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export type AuditLog = {
  id: string;
  user_id: string | null;
  action: AuditAction | string;
  entity_type: AuditEntityType | string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  user: {
    id: string;
    full_name: string | null;
    role: UserRole;
  } | null;
};

export type AuditFilters = {
  user?: string;
  action?: AuditAction | "all";
  entity?: AuditEntityType | "all";
  date?: string;
};
