import type { UserRole } from "@/types/auth";

export const AUDIT_ACTIONS = [
  "create_product",
  "update_product",
  "deactivate_product",
  "create_inventory_movement",
  "create_purchase",
  "confirm_purchase",
  "cancel_purchase",
  "create_sale",
  "confirm_sale",
  "cancel_sale",
  "register_customer_payment",
  "register_supplier_payment",
  "register_manual_cash_movement",
  "deactivate_customer",
  "deactivate_supplier",
] as const;

export const AUDIT_ENTITY_TYPES = [
  "product",
  "inventory_movement",
  "purchase",
  "sale",
  "payment",
  "cash_movement",
  "customer",
  "supplier",
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
