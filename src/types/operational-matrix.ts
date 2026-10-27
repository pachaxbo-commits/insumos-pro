import type { UserRole } from "@/types/auth";

export type MatrixStage = "pedido" | "preparacion" | "entrega" | "resumen";

export type MatrixWeightUnit = {
  id: string;
  code: string;
  name: string;
  symbol: string;
  kilograms: number;
};

export type MatrixQuantityUnit = {
  id: string;
  label: string;
  /** One selected unit expressed in the order's original unit. */
  sourceQuantity: number;
};

export type MatrixOrder = {
  id: string;
  customerKey: string;
  reference: string;
  customerName: string;
  locationLabel: string | null;
  customerNotes: string;
  status: string;
  updatedAt: string;
  position: number;
  positionVersion: number;
  preparationStatus: string | null;
  deliveryStatus: string | null;
};

export type MatrixLine = {
  orderItemId: string;
  orderId: string;
  productId: string;
  productName: string;
  stockCurrent: number;
  productColor: string | null;
  controlsActualWeight: boolean;
  categoryName: string;
  sourceLabel: string;
  quantityUnits: MatrixQuantityUnit[];
  baseUnitSymbol: string;
  priceUnitSymbol: string | null;
  baseSalePrice: number | null;
  basePriceUnitId: string | null;
  hasWeightBasedPrice: boolean;
  provisionCostUnit: number | null;
  requestedQuantity: number;
  requestedBaseQuantity: number;
  /** Canonical base quantity for one unit in the order's source unit. */
  basePerSourceQuantity: number;
  requestedNote: string;
  requestedVersion: number;
  preparedQuantity: number;
  preparedBaseQuantity: number;
  preparationDisplayUnitId: string;
  preparationCheck: boolean;
  preparationActualWeightKg: number | null;
  preparationNote: string;
  originPlanConfirmed: boolean;
  plannedPendingBaseQuantity: number;
  plannedExternalBaseQuantity: number;
  plannedReviewBaseQuantity: number;
  preparationVersion: number;
  preparedBy: string | null;
  preparedAt: string | null;
  externalQuantity: number;
  externalBaseQuantity: number;
  deliveredQuantity: number;
  deliveredBaseQuantity: number;
  deliveryDisplayUnitId: string;
  deliveryCheck: boolean;
  deliveryActualWeightKg: number | null;
  deliveryNote: string;
  deliveryWarehouseBaseQuantity: number;
  deliveryPendingBaseQuantity: number;
  deliveryExternalBaseQuantity: number;
  deliveryReviewBaseQuantity: number;
  deliverySourceConfirmed: boolean;
  deliveryVersion: number;
  deliveredBy: string | null;
  deliveredAt: string | null;
  deliveryMovementId: string | null;
  reconciliation: {
    id: string;
    classification: "pending" | "external_definitive" | "review";
    status: "pending" | "partial" | "reconciled" | "external_definitive" | "review";
    pendingQuantity: number;
    reconciledQuantity: number;
  } | null;
};

export type OperationalMatrixData = {
  operationalDate: string;
  role: UserRole;
  weightUnits: MatrixWeightUnit[];
  orders: MatrixOrder[];
  lines: MatrixLine[];
};
