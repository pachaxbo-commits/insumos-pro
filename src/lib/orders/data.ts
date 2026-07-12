import { unstable_noStore as noStore } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { calculateMarginPercentage, getStockStatus } from "@/lib/products/utils";
import type { Profile } from "@/types/auth";
import type { OrderFilters, OrdersSummary, OrderWithRelations } from "@/types/orders";
import type { ProductCategory, ProductWithRelations, UnitOfMeasure } from "@/types/products";
import type { Customer } from "@/types/sales";
import type {
  FulfillmentPayment,
  FulfillmentSaleSummary,
  OrderFulfillmentWithSale,
} from "@/types/fulfillment";

type ProductQueryRow = Omit<ProductWithRelations, "margin_percentage" | "stock_status" | "category" | "unit"> & {
  category: ProductCategory | ProductCategory[] | null;
  unit: UnitOfMeasure | UnitOfMeasure[] | null;
};

type OrderItemQueryRow = Omit<OrderWithRelations["items"][number], "product"> & {
  product: ProductQueryRow | ProductQueryRow[] | null;
};

type OrderQueryRow = Omit<
  OrderWithRelations,
  "customer" | "items" | "created_by_profile" | "public_events" | "fulfillment"
> & {
  customer: Customer | Customer[] | null;
  items: OrderItemQueryRow[] | null;
  created_by_profile:
    | Pick<Profile, "id" | "full_name" | "role">
    | Pick<Profile, "id" | "full_name" | "role">[]
    | null;
  public_events: OrderWithRelations["public_events"] | null;
  fulfillment:
    | (Omit<OrderFulfillmentWithSale, "sale"> & {
        sale:
          | (Omit<FulfillmentSaleSummary, "payments"> & {
              payments: FulfillmentPayment[] | null;
            })
          | Array<
              Omit<FulfillmentSaleSummary, "payments"> & {
                payments: FulfillmentPayment[] | null;
              }
            >
          | null;
      })
    | Array<
        Omit<OrderFulfillmentWithSale, "sale"> & {
          sale:
            | (Omit<FulfillmentSaleSummary, "payments"> & {
                payments: FulfillmentPayment[] | null;
              })
            | Array<
                Omit<FulfillmentSaleSummary, "payments"> & {
                  payments: FulfillmentPayment[] | null;
                }
              >
            | null;
        }
      >
    | null;
};

export type OrdersData = {
  orders: OrderWithRelations[];
  customers: Customer[];
  products: ProductWithRelations[];
  summary: OrdersSummary;
  error?: string;
};

const customerSelect =
  "id, name, business_name, nit, phone, email, address, customer_type, credit_limit, current_balance, is_active, created_at, updated_at";

const productSelect =
  "id, name, sku, category_id, unit_id, stock_current, stock_min, purchase_price, sale_price, supplier_name, image_url, is_active, created_at, updated_at, category:product_categories(id, name, description, is_active, created_at, updated_at), unit:units_of_measure(id, name, abbreviation, is_active, created_at, updated_at)";

const emptySummary: OrdersSummary = {
  totalOrders: 0,
  pendingReviewOrders: 0,
  receivedOrders: 0,
  inPreparationOrders: 0,
  readyOrders: 0,
  incompleteOrders: 0,
  confirmedOrders: 0,
};

function normalizeProduct(product: ProductQueryRow): ProductWithRelations {
  const category = Array.isArray(product.category) ? product.category[0] ?? null : product.category;
  const unit = Array.isArray(product.unit) ? product.unit[0] ?? null : product.unit;

  return {
    ...product,
    category,
    unit,
    margin_percentage: calculateMarginPercentage(
      Number(product.purchase_price),
      Number(product.sale_price),
    ),
    stock_status: getStockStatus(product),
  };
}

function getDateRange(date: string) {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function buildSummary(orders: OrderWithRelations[]): OrdersSummary {
  return {
    totalOrders: orders.length,
    pendingReviewOrders: orders.filter((order) => order.status === "pendiente_revision").length,
    receivedOrders: orders.filter((order) => order.status === "recibido").length,
    inPreparationOrders: orders.filter((order) => order.status === "en_preparacion").length,
    readyOrders: orders.filter(
      (order) =>
        order.status === "preparado_completo" || order.status === "listo_para_confirmar",
    ).length,
    incompleteOrders: orders.filter((order) => order.status === "preparado_incompleto").length,
    confirmedOrders: orders.filter(
      (order) =>
        order.status === "confirmado" ||
        order.status === "confirmado_cliente" ||
        order.status === "despachado" ||
        order.status === "entregado",
    ).length,
  };
}

export async function getOrdersData(filters: OrderFilters = {}): Promise<OrdersData> {
  noStore();

  const supabase = await createSupabaseServerClient();
  const empty: OrdersData = {
    orders: [],
    customers: [],
    products: [],
    summary: emptySummary,
  };

  if (!supabase) return { ...empty, error: "Supabase no esta configurado." };

  const [customersResult, productsResult] = await Promise.all([
    supabase.from("customers").select(customerSelect).eq("is_active", true).order("name"),
    supabase
      .from("products")
      .select(productSelect)
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);

  let ordersQuery = supabase
    .from("orders")
    .select(
      `id, customer_id, order_date, requested_delivery_date, status, payment_type, estimated_total, final_total, notes, sale_id, prepared_by, confirmed_by, created_by, created_at, updated_at, prepared_at, confirmed_at, origin, public_reference, contact_snapshot, delivery_type, delivery_address, delivery_time_window, expected_payment_method, version, submitted_at, quote_version, quote_issued_at, customer_confirmed_at,
       customer:customers(${customerSelect}),
       items:order_items(id, order_id, product_id, product_name, unit_name, unit_abbreviation, requested_quantity, actual_quantity, unit_price, estimated_subtotal, final_subtotal, status, notes, catalog_availability_snapshot, final_unit_price, price_adjustment_reason, price_adjusted_by, price_adjusted_at, created_at, updated_at, product:products(${productSelect})),
       public_events:order_public_events(id, order_id, event_type, quote_version, metadata, created_at),
       fulfillment:order_fulfillments(id, order_id, sale_id, fulfillment_type, status, responsible_user_id, dispatched_at, delivered_at, outstanding_authorized_by, outstanding_authorized_at, outstanding_authorization_reason, outstanding_due_date, return_reason, returned_at, idempotency_key, created_by, updated_by, created_at, updated_at, sale:sales(id, total, status, paid_amount, balance_due, payment_status, payments(id, amount, payment_method, external_reference, payment_date, status))),
       created_by_profile:profiles!orders_created_by_fkey(id, full_name, role)`,
    )
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(120);

  if (filters.customer && filters.customer !== "all") {
    ordersQuery = ordersQuery.eq("customer_id", filters.customer);
  }

  if (filters.status && filters.status !== "all") {
    ordersQuery = ordersQuery.eq("status", filters.status);
  }

  if (filters.date) {
    const range = getDateRange(filters.date);
    ordersQuery = ordersQuery.gte("order_date", range.start).lt("order_date", range.end);
  }

  const ordersResult = await ordersQuery;

  if (customersResult.error || productsResult.error || ordersResult.error) {
    return {
      ...empty,
      error:
        customersResult.error?.message ??
        productsResult.error?.message ??
        ordersResult.error?.message ??
        "No se pudieron cargar los pedidos.",
    };
  }

  const customers = (customersResult.data ?? []) as Customer[];
  const products = ((productsResult.data ?? []) as unknown as ProductQueryRow[]).map(normalizeProduct);
  const rows = (ordersResult.data ?? []) as unknown as OrderQueryRow[];
  const orders = rows.map((order) => {
    const customer = Array.isArray(order.customer) ? order.customer[0] ?? null : order.customer;
    const createdByProfile = Array.isArray(order.created_by_profile)
      ? order.created_by_profile[0] ?? null
      : order.created_by_profile;
    const fulfillmentRow = Array.isArray(order.fulfillment)
      ? order.fulfillment[0] ?? null
      : order.fulfillment;
    const saleRow = fulfillmentRow
      ? Array.isArray(fulfillmentRow.sale)
        ? fulfillmentRow.sale[0] ?? null
        : fulfillmentRow.sale
      : null;
    const fulfillment = fulfillmentRow
      ? {
          ...fulfillmentRow,
          sale: saleRow
            ? {
                ...saleRow,
                payments: saleRow.payments ?? [],
              }
            : null,
        }
      : null;

    return {
      ...order,
      customer,
      created_by_profile: createdByProfile,
      public_events: order.public_events ?? [],
      fulfillment,
      items: (order.items ?? []).map((item) => {
        const product = Array.isArray(item.product) ? item.product[0] ?? null : item.product;

        return {
          ...item,
          product: product ? normalizeProduct(product) : null,
        };
      }),
    };
  });

  return {
    orders,
    customers,
    products,
    summary: buildSummary(orders),
  };
}
