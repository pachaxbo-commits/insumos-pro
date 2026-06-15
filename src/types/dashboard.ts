import type { LucideIcon } from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  description: string;
};

export type KpiTrend = "up" | "down" | "neutral";

export type KpiItem = {
  title: string;
  value: string;
  change: string;
  trend: KpiTrend;
  icon: LucideIcon;
  caption: string;
};

export type SaleStatus = "pagada" | "pendiente" | "vencida" | "confirmada" | "borrador" | "anulada";
export type AlertTone = "critical" | "warning" | "info" | "success";
export type InventoryMovementType = "entrada" | "salida" | "ajuste" | "merma" | "devolucion";

export type SaleItem = {
  id: string;
  customer: string;
  date: string;
  amount: number;
  status: SaleStatus;
  channel: string;
};

export type InventoryMovement = {
  id: string;
  product: string;
  type: InventoryMovementType;
  quantity: number;
  unit: string;
  warehouse: string;
  date: string;
};

export type AlertItem = {
  id: string;
  title: string;
  description: string;
  tone: AlertTone;
  time: string;
};

export type TopProduct = {
  id: string;
  name: string;
  category: string;
  units: number;
  revenue: number;
};

export type QuickAction = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
};

export type StockAlert = {
  id: string;
  product: string;
  stock: number;
  minimum: number;
  supplier: string;
};

export type FinanceHighlight = {
  id: string;
  label: string;
  value: string;
  detail: string;
};
