import type { QbOrderStatus } from "@/types/qb-catalog";

export type QbPreparationStatus = "en_preparacion" | "preparado" | "cancelado";

export type QbPreparationLineStatus = "completo" | "parcial" | "no_disponible";

export type QbPreparationAllowedUnit = {
  id: string;
  label: string;
  usageContext: "pedido" | "inventario";
  minQuantity: number;
  quantityStep: number;
  isDefault: boolean;
  sortOrder: number;
};

export type QbPreparationItem = {
  id: string;
  status: QbPreparationLineStatus;
  actualAllowedUnitId: string | null;
  actualSourceLabel: string | null;
  actualQuantity: number;
  actualBaseQuantity: number;
  notes: string | null;
};

export type QbInternalOrderItem = {
  id: string;
  productId: string;
  productName: string;
  sourceLabel: string;
  requestedQuantity: number;
  requestedBaseQuantity: number;
  baseUnitSymbol: string;
  stockCurrent: number;
  notes: string | null;
  allowedUnits: QbPreparationAllowedUnit[];
  preparationItem: QbPreparationItem | null;
};

export type QbInternalOrderPreparation = {
  id: string;
  status: QbPreparationStatus;
  internalNotes: string | null;
  startedAt: string;
  preparedAt: string | null;
};

export type QbInternalOrder = {
  id: string;
  reference: string;
  status: QbOrderStatus;
  submittedAt: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  locationLabel: string | null;
  locationAddress: string | null;
  locationReference: string | null;
  customerNotes: string | null;
  preparation: QbInternalOrderPreparation | null;
  deliveredAt: string | null;
  items: QbInternalOrderItem[];
};

export type QbInternalOrdersData = {
  orders: QbInternalOrder[];
  error?: string;
};

export type QbOrderActionState = {
  success: boolean;
  message?: string;
};
