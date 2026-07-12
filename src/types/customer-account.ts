import type {
  PublicDeliveryType,
  PublicExpectedPaymentMethod,
} from "@/types/catalog";

export type CustomerAccount = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  defaultDeliveryType: PublicDeliveryType;
  defaultAddress: string | null;
  defaultDeliveryTimeWindow: string | null;
  defaultPaymentMethod: PublicExpectedPaymentMethod;
  isActive: boolean;
};

export type CustomerOrderItem = {
  productId: string;
  productName: string;
  unitName: string | null;
  unitAbbreviation: string | null;
  requestedQuantity: number;
  actualQuantity: number;
  estimatedSubtotal: number;
  finalSubtotal: number;
  status: string;
};

export type CustomerOrder = {
  id: string;
  reference: string;
  createdAt: string;
  status: string;
  estimatedTotal: number;
  finalTotal: number;
  expectedPaymentMethod: string | null;
  deliveryType: string | null;
  deliveryTimeWindow: string | null;
  items: CustomerOrderItem[];
};

export type CustomerAuthActionState = {
  success: boolean;
  message?: string;
};
