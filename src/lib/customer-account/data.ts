import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CustomerAccount, CustomerOrder } from "@/types/customer-account";

type AccountRow = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  default_delivery_type: CustomerAccount["defaultDeliveryType"];
  default_address: string | null;
  default_delivery_time_window: string | null;
  default_payment_method: CustomerAccount["defaultPaymentMethod"];
  is_active: boolean;
};

type OrderRow = {
  id: string;
  public_reference: string;
  created_at: string;
  status: string;
  estimated_total: number | string;
  final_total: number | string;
  expected_payment_method: string | null;
  delivery_type: string | null;
  delivery_time_window: string | null;
  items?: Array<{
    product_id: string;
    product_name: string;
    unit_name: string | null;
    unit_abbreviation: string | null;
    requested_quantity: number | string;
    actual_quantity: number | string;
    estimated_subtotal: number | string;
    final_subtotal: number | string;
    status: string;
  }>;
};

export async function getOptionalCustomerAccount() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data: claims } = await supabase.auth.getClaims();
  const id = claims?.claims?.sub;
  if (typeof id !== "string") return null;

  const { data, error } = await supabase
    .from("customer_accounts")
    .select(
      "id, email, full_name, phone, default_delivery_type, default_address, default_delivery_time_window, default_payment_method, is_active",
    )
    .eq("id", id)
    .maybeSingle<AccountRow>();

  if (error || !data || !data.is_active) return null;

  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name,
    phone: data.phone,
    defaultDeliveryType: data.default_delivery_type,
    defaultAddress: data.default_address,
    defaultDeliveryTimeWindow: data.default_delivery_time_window,
    defaultPaymentMethod: data.default_payment_method,
    isActive: data.is_active,
  } satisfies CustomerAccount;
}

export async function getCustomerOrders(): Promise<{
  orders: CustomerOrder[];
  error?: string;
}> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { orders: [], error: "Falta configurar Supabase." };

  const { data, error } = await supabase.rpc("get_my_customer_orders");
  if (error) return { orders: [], error: "No pudimos cargar tus pedidos." };

  const rows = (Array.isArray(data) ? data : []) as OrderRow[];
  return {
    orders: rows.map((order) => ({
      id: order.id,
      reference: order.public_reference,
      createdAt: order.created_at,
      status: order.status,
      estimatedTotal: Number(order.estimated_total) || 0,
      finalTotal: Number(order.final_total) || 0,
      expectedPaymentMethod: order.expected_payment_method,
      deliveryType: order.delivery_type,
      deliveryTimeWindow: order.delivery_time_window,
      items: (order.items ?? []).map((item) => ({
        productId: item.product_id,
        productName: item.product_name,
        unitName: item.unit_name,
        unitAbbreviation: item.unit_abbreviation,
        requestedQuantity: Number(item.requested_quantity) || 0,
        actualQuantity: Number(item.actual_quantity) || 0,
        estimatedSubtotal: Number(item.estimated_subtotal) || 0,
        finalSubtotal: Number(item.final_subtotal) || 0,
        status: item.status,
      })),
    })),
  };
}
