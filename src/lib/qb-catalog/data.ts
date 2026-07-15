import "server-only";

import { unstable_noStore as noStore } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  QbCatalogAllowedUnit,
  QbCatalogCategory,
  QbCatalogData,
  QbCatalogProduct,
  QbCustomerAccount,
  QbCustomerLocation,
  QbCustomerOrder,
  QbCustomerPortalData,
  QbFrequentProduct,
} from "@/types/qb-catalog";

type SupabaseServerClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

type CatalogRow = {
  product_id: string;
  product_name: string;
  public_description: string | null;
  image_url: string | null;
  category_id: string | null;
  category_name: string | null;
  category_slug: string | null;
  product_sort_order: number | string | null;
  category_sort_order: number | string | null;
  allowed_unit_id: string;
  source_kind: "universal_unit" | "product_presentation";
  source_label: string;
  min_quantity: number | string | null;
  quantity_step: number | string | null;
  is_default: boolean | null;
  allowed_sort_order: number | string | null;
};

type AccountRow = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
};

type LocationRow = {
  id: string;
  customer_account_id: string;
  label: string;
  address: string;
  reference: string | null;
  phone: string | null;
  is_primary: boolean;
  is_active: boolean;
  sort_order: number;
};

type OrderRow = {
  id: string;
  public_reference: string;
  status: QbCustomerOrder["status"];
  submitted_at: string;
  customer_notes: string | null;
  location_snapshot: Record<string, unknown> | null;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string;
  allowed_unit_id: string;
  source_label: string;
  requested_quantity: number | string;
  customer_notes: string | null;
};

function numberOr(value: number | string | null | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sanitizeImageUrl(value: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function locationSnapshotText(snapshot: Record<string, unknown> | null, key: string) {
  const value = snapshot?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function buildCatalog(rows: CatalogRow[], frequentProducts: QbFrequentProduct[] = []) {
  const products = new Map<string, QbCatalogProduct>();
  const categories = new Map<string, QbCatalogCategory>();
  const frequentIds = new Set(frequentProducts.map((item) => item.productId));

  for (const row of rows) {
    if (!row.product_id || !row.product_name || !row.allowed_unit_id) continue;

    const unit: QbCatalogAllowedUnit = {
      id: row.allowed_unit_id,
      label: row.source_label,
      kind: row.source_kind,
      minQuantity: numberOr(row.min_quantity, 1),
      quantityStep: numberOr(row.quantity_step, 1),
      isDefault: Boolean(row.is_default),
      sortOrder: Number(row.allowed_sort_order) || 0,
    };

    const existing = products.get(row.product_id);
    if (existing) {
      existing.allowedUnits.push(unit);
      continue;
    }

    products.set(row.product_id, {
      id: row.product_id,
      name: row.product_name,
      description: row.public_description,
      imageUrl: sanitizeImageUrl(row.image_url),
      categoryId: row.category_id,
      categoryName: row.category_name,
      categorySlug: row.category_slug,
      sortOrder: Number(row.product_sort_order) || 0,
      allowedUnits: [unit],
      isFrequent: frequentIds.has(row.product_id),
    });

    if (row.category_id && row.category_name && row.category_slug && !categories.has(row.category_id)) {
      categories.set(row.category_id, {
        id: row.category_id,
        name: row.category_name,
        slug: row.category_slug,
        sortOrder: Number(row.category_sort_order) || 0,
      });
    }
  }

  const catalogProducts = [...products.values()]
    .map((product) => ({
      ...product,
      allowedUnits: product.allowedUnits.sort(
        (left, right) =>
          Number(right.isDefault) - Number(left.isDefault) ||
          left.sortOrder - right.sortOrder ||
          left.label.localeCompare(right.label, "es"),
      ),
    }))
    .filter((product) => product.allowedUnits.length > 0)
    .sort(
      (left, right) =>
        Number(right.isFrequent) - Number(left.isFrequent) ||
        left.sortOrder - right.sortOrder ||
        left.name.localeCompare(right.name, "es"),
    );

  return {
    products: catalogProducts,
    categories: [...categories.values()].sort(
      (left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "es"),
    ),
  };
}

async function getCurrentCustomerId(supabase: SupabaseServerClient) {
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  return typeof id === "string" ? id : null;
}

async function getCatalogRows(supabase: SupabaseServerClient) {
  const { data, error } = await supabase.rpc("get_qb_public_catalog");
  if (error) throw error;
  return (data ?? []) as CatalogRow[];
}

export async function getOptionalQbCustomerAccount(): Promise<QbCustomerAccount | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const customerId = await getCurrentCustomerId(supabase);
  if (!customerId) return null;

  const { data, error } = await supabase
    .from("customer_accounts")
    .select("id, email, full_name, phone, is_active")
    .eq("id", customerId)
    .maybeSingle<AccountRow>();

  if (error || !data?.is_active) return null;

  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name,
    phone: data.phone,
    isActive: data.is_active,
  };
}

async function getQbCustomerLocations(
  supabase: SupabaseServerClient,
  customerId: string,
): Promise<QbCustomerLocation[]> {
  const { data, error } = await supabase
    .from("qb_customer_locations")
    .select("id, customer_account_id, label, address, reference, phone, is_primary, is_active, sort_order")
    .eq("customer_account_id", customerId)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return [];

  return ((data ?? []) as LocationRow[]).map((location) => ({
    id: location.id,
    customerAccountId: location.customer_account_id,
    label: location.label,
    address: location.address,
    reference: location.reference,
    phone: location.phone,
    isPrimary: location.is_primary,
    isActive: location.is_active,
    sortOrder: location.sort_order,
  }));
}

async function getQbCustomerOrders(
  supabase: SupabaseServerClient,
  customerId: string,
): Promise<QbCustomerOrder[]> {
  const { data: ordersData, error } = await supabase
    .from("qb_orders")
    .select("id, public_reference, status, submitted_at, customer_notes, location_snapshot")
    .eq("customer_account_id", customerId)
    .order("submitted_at", { ascending: false })
    .limit(30);

  if (error) return [];

  const orders = (ordersData ?? []) as OrderRow[];
  const orderIds = orders.map((order) => order.id);
  if (!orderIds.length) return [];

  const { data: catalogData } = await supabase.rpc("get_qb_public_catalog");
  const catalogNames = new Map(
    ((catalogData ?? []) as CatalogRow[]).map((row) => [row.product_id, row.product_name]),
  );

  const { data: itemsData, error: itemsError } = await supabase
    .from("qb_order_items")
    .select("id, order_id, product_id, allowed_unit_id, source_label, requested_quantity, customer_notes")
    .in("order_id", orderIds)
    .order("sort_order", { ascending: true });

  if (itemsError) return [];

  const itemsByOrder = new Map<string, OrderItemRow[]>();
  for (const item of (itemsData ?? []) as OrderItemRow[]) {
    const items = itemsByOrder.get(item.order_id) ?? [];
    items.push(item);
    itemsByOrder.set(item.order_id, items);
  }

  return orders.map((order) => ({
    id: order.id,
    reference: order.public_reference,
    status: order.status,
    submittedAt: order.submitted_at,
    customerNotes: order.customer_notes,
    locationLabel: locationSnapshotText(order.location_snapshot, "label"),
    locationAddress: locationSnapshotText(order.location_snapshot, "address"),
    items: (itemsByOrder.get(order.id) ?? []).map((item) => ({
      id: item.id,
      productId: item.product_id,
      productName: catalogNames.get(item.product_id) ?? "Producto",
      allowedUnitId: item.allowed_unit_id,
      sourceLabel: item.source_label,
      requestedQuantity: Number(item.requested_quantity) || 0,
      notes: item.customer_notes,
    })),
  }));
}

function getFrequentProductsFromOrders(orders: QbCustomerOrder[]): QbFrequentProduct[] {
  const counts = new Map<string, QbFrequentProduct>();

  for (const order of orders) {
    if (order.status === "cancelado") continue;

    for (const item of order.items) {
      const current = counts.get(item.productId);
      counts.set(item.productId, {
        productId: item.productId,
        count: (current?.count ?? 0) + 1,
        lastOrderedAt: current?.lastOrderedAt && current.lastOrderedAt > order.submittedAt
          ? current.lastOrderedAt
          : order.submittedAt,
      });
    }
  }

  return [...counts.values()]
    .sort(
      (left, right) =>
        right.count - left.count || right.lastOrderedAt.localeCompare(left.lastOrderedAt),
    )
    .slice(0, 8);
}

export async function getQbCatalogData(): Promise<QbCatalogData> {
  noStore();

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      products: [],
      categories: [],
      frequentProducts: [],
      error: "El Catálogo no está disponible en este momento. Inténtalo nuevamente más tarde.",
    };
  }

  try {
    const account = await getOptionalQbCustomerAccount();
    const orders = account ? await getQbCustomerOrders(supabase, account.id) : [];
    const frequentProducts = getFrequentProductsFromOrders(orders);
    const catalog = buildCatalog(await getCatalogRows(supabase), frequentProducts);
    return { ...catalog, frequentProducts };
  } catch {
    return {
      products: [],
      categories: [],
      frequentProducts: [],
      error:
        "No pudimos cargar el Catálogo en este momento. Inténtalo nuevamente más tarde.",
    };
  }
}

export async function getQbCustomerPortalData(): Promise<QbCustomerPortalData> {
  noStore();

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      account: null,
      locations: [],
      orders: [],
      frequentProducts: [],
      error: "No pudimos cargar tu cuenta en este momento. Inténtalo nuevamente más tarde.",
    };
  }

  const account = await getOptionalQbCustomerAccount();
  if (!account) {
    return { account: null, locations: [], orders: [], frequentProducts: [] };
  }

  const [locations, orders] = await Promise.all([
    getQbCustomerLocations(supabase, account.id),
    getQbCustomerOrders(supabase, account.id),
  ]);

  return {
    account,
    locations,
    orders,
    frequentProducts: getFrequentProductsFromOrders(orders),
  };
}

export async function getQbCheckoutData() {
  noStore();

  const supabase = await createSupabaseServerClient();
  const [catalog, portal, authenticatedUserId] = await Promise.all([
    getQbCatalogData(),
    getQbCustomerPortalData(),
    supabase ? getCurrentCustomerId(supabase) : Promise.resolve(null),
  ]);

  return {
    ...catalog,
    account: portal.account,
    locations: portal.locations,
    hasAuthenticatedSession: Boolean(authenticatedUserId),
  };
}
