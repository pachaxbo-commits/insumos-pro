import type { UserRole } from "@/types/auth";

export type MatrixStage = "pedido" | "preparacion" | "entrega" | "resumen";

export type MatrixOrder = {
  id: string;
  reference: string;
  customerName: string;
  locationLabel: string | null;
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
  categoryName: string;
  sourceLabel: string;
  baseUnitSymbol: string;
  requestedQuantity: number;
  requestedVersion: number;
  preparedQuantity: number;
  preparationCheck: boolean;
  preparationNote: string;
  preparationVersion: number;
  preparedBy: string | null;
  preparedAt: string | null;
  externalQuantity: number;
  deliveredQuantity: number;
  deliveryCheck: boolean;
  deliveryNote: string;
  deliveryVersion: number;
  deliveredBy: string | null;
  deliveredAt: string | null;
};

export type OperationalMatrixData = {
  operationalDate: string;
  role: UserRole;
  orders: MatrixOrder[];
  lines: MatrixLine[];
};
