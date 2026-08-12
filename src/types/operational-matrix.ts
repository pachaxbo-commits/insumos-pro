import type { UserRole } from "@/types/auth";

export type MatrixStage = "pedido" | "preparacion" | "entrega" | "resumen";

export type MatrixWeightUnit = {
  id: string;
  code: string;
  name: string;
  symbol: string;
  kilograms: number;
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
  productColor: string | null;
  controlsActualWeight: boolean;
  categoryName: string;
  sourceLabel: string;
  baseUnitSymbol: string;
  priceUnitSymbol: string | null;
  hasWeightBasedPrice: boolean;
  requestedQuantity: number;
  requestedBaseQuantity: number;
  requestedNote: string;
  requestedVersion: number;
  preparedQuantity: number;
  preparedBaseQuantity: number;
  preparationCheck: boolean;
  preparationActualWeightKg: number | null;
  preparationNote: string;
  preparationVersion: number;
  preparedBy: string | null;
  preparedAt: string | null;
  externalQuantity: number;
  deliveredQuantity: number;
  deliveredBaseQuantity: number;
  deliveryCheck: boolean;
  deliveryActualWeightKg: number | null;
  deliveryNote: string;
  deliveryVersion: number;
  deliveredBy: string | null;
  deliveredAt: string | null;
};

export type OperationalMatrixData = {
  operationalDate: string;
  role: UserRole;
  weightUnits: MatrixWeightUnit[];
  orders: MatrixOrder[];
  lines: MatrixLine[];
};
