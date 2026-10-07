import "server-only";

import { unstable_noStore as noStore } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { todayInBolivia } from "@/lib/date-time";
import { getOperationalMatrixData } from "@/lib/operational-matrix/data";
import { buildMarketSheetModel } from "@/lib/market-sheet/model";

export type PendingOrderItem = {
  id: string;
  publicReference: string;
  customerName: string;
  operationalDate: string;
  status: string;
  customerNotes?: string;
  isOverdue: boolean;
};

export type PendingDateSummary = {
  date: string;
  orderCount: number;
  productCount?: number;
  isOverdue: boolean;
  orders: PendingOrderItem[];
};

export type PendingStageSummary = {
  stage: "preparacion" | "entrega" | "mercado";
  totalOrders: number;
  totalProducts?: number;
  dates: PendingDateSummary[];
  oldestPendingDate: string | null;
};

function customerNameFromSnapshot(snapshot: unknown): string {
  if (!snapshot || typeof snapshot !== "object") return "Cliente";
  const rec = snapshot as Record<string, unknown>;
  const name =
    (typeof rec.business_name === "string" && rec.business_name.trim()) ||
    (typeof rec.responsible_name === "string" && rec.responsible_name.trim());
  return name || "Cliente";
}

export async function getPendingPreparationWork(): Promise<PendingStageSummary> {
  noStore();
  const supabase = await createSupabaseServerClient();
  const today = todayInBolivia();

  if (!supabase) {
    return {
      stage: "preparacion",
      totalOrders: 0,
      dates: [],
      oldestPendingDate: null,
    };
  }

  const { data, error } = await supabase
    .from("qb_orders")
    .select("id, public_reference, customer_snapshot, customer_notes, operational_date, status, submitted_at")
    .in("status", ["pendiente_preparacion", "en_preparacion"])
    .order("operational_date", { ascending: true })
    .order("submitted_at", { ascending: true });

  if (error || !data) {
    return {
      stage: "preparacion",
      totalOrders: 0,
      dates: [],
      oldestPendingDate: null,
    };
  }

  const dateMap = new Map<string, PendingOrderItem[]>();
  for (const row of data) {
    const dateStr = String(row.operational_date);
    const item: PendingOrderItem = {
      id: String(row.id),
      publicReference: String(row.public_reference),
      customerName: customerNameFromSnapshot(row.customer_snapshot),
      operationalDate: dateStr,
      status: String(row.status),
      customerNotes: typeof row.customer_notes === "string" ? row.customer_notes : undefined,
      isOverdue: dateStr < today,
    };
    const list = dateMap.get(dateStr) ?? [];
    list.push(item);
    dateMap.set(dateStr, list);
  }

  const dates: PendingDateSummary[] = [...dateMap.entries()]
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, orders]) => ({
      date,
      orderCount: orders.length,
      isOverdue: date < today,
      orders,
    }));

  return {
    stage: "preparacion",
    totalOrders: data.length,
    dates,
    oldestPendingDate: dates[0]?.date ?? null,
  };
}

export async function getPendingDeliveryWork(): Promise<PendingStageSummary> {
  noStore();
  const supabase = await createSupabaseServerClient();
  const today = todayInBolivia();

  if (!supabase) {
    return {
      stage: "entrega",
      totalOrders: 0,
      dates: [],
      oldestPendingDate: null,
    };
  }

  const { data, error } = await supabase
    .from("qb_orders")
    .select("id, public_reference, customer_snapshot, customer_notes, operational_date, status, submitted_at")
    .eq("status", "preparado")
    .order("operational_date", { ascending: true })
    .order("submitted_at", { ascending: true });

  if (error || !data) {
    return {
      stage: "entrega",
      totalOrders: 0,
      dates: [],
      oldestPendingDate: null,
    };
  }

  const dateMap = new Map<string, PendingOrderItem[]>();
  for (const row of data) {
    const dateStr = String(row.operational_date);
    const item: PendingOrderItem = {
      id: String(row.id),
      publicReference: String(row.public_reference),
      customerName: customerNameFromSnapshot(row.customer_snapshot),
      operationalDate: dateStr,
      status: String(row.status),
      customerNotes: typeof row.customer_notes === "string" ? row.customer_notes : undefined,
      isOverdue: dateStr < today,
    };
    const list = dateMap.get(dateStr) ?? [];
    list.push(item);
    dateMap.set(dateStr, list);
  }

  const dates: PendingDateSummary[] = [...dateMap.entries()]
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, orders]) => ({
      date,
      orderCount: orders.length,
      isOverdue: date < today,
      orders,
    }));

  return {
    stage: "entrega",
    totalOrders: data.length,
    dates,
    oldestPendingDate: dates[0]?.date ?? null,
  };
}

export async function getPendingProvisionWork(): Promise<PendingStageSummary> {
  noStore();
  const supabase = await createSupabaseServerClient();
  const today = todayInBolivia();

  if (!supabase) {
    return {
      stage: "mercado",
      totalOrders: 0,
      totalProducts: 0,
      dates: [],
      oldestPendingDate: null,
    };
  }

  const { data: orders, error: ordersError } = await supabase
    .from("qb_orders")
    .select("id, public_reference, customer_snapshot, customer_notes, operational_date, status, submitted_at")
    .in("status", ["pendiente_preparacion", "en_preparacion"])
    .order("operational_date", { ascending: true })
    .order("submitted_at", { ascending: true });

  if (ordersError || !orders || !orders.length) {
    return {
      stage: "mercado",
      totalOrders: 0,
      totalProducts: 0,
      dates: [],
      oldestPendingDate: null,
    };
  }

  // Group active orders by operational_date
  const dateOrdersMap = new Map<string, PendingOrderItem[]>();
  for (const row of orders) {
    const dateStr = String(row.operational_date);
    const item: PendingOrderItem = {
      id: String(row.id),
      publicReference: String(row.public_reference),
      customerName: customerNameFromSnapshot(row.customer_snapshot),
      operationalDate: dateStr,
      status: String(row.status),
      customerNotes: typeof row.customer_notes === "string" ? row.customer_notes : undefined,
      isOverdue: dateStr < today,
    };
    const list = dateOrdersMap.get(dateStr) ?? [];
    list.push(item);
    dateOrdersMap.set(dateStr, list);
  }

  const distinctDates = [...dateOrdersMap.keys()].sort((a, b) => a.localeCompare(b));

  // For each distinct date, build the actual Market Sheet model to evaluate toProvision
  const matrixDataPerDate = await Promise.all(
    distinctDates.map(async (date) => {
      try {
        const matrixData = await getOperationalMatrixData(date, "administrador");
        const model = buildMarketSheetModel(matrixData);
        // Products that actually have deficit to provision from market (toProvision > 0):
        const itemsToProvision = model.rows.filter((r) => r.toProvision > 0);
        return {
          date,
          productCount: itemsToProvision.length,
          productIds: itemsToProvision.map((r) => r.productId),
        };
      } catch {
        return {
          date,
          productCount: 0,
          productIds: [],
        };
      }
    }),
  );

  const dates: PendingDateSummary[] = [];
  const globalProductsNeedingProvision = new Set<string>();
  let totalOrdersWithDeficit = 0;

  for (const info of matrixDataPerDate) {
    // Only dates that actually have at least 1 product requiring market provision (toProvision > 0)
    if (info.productCount > 0) {
      const dateOrders = dateOrdersMap.get(info.date) ?? [];
      dates.push({
        date: info.date,
        orderCount: dateOrders.length,
        productCount: info.productCount,
        isOverdue: info.date < today,
        orders: dateOrders,
      });
      totalOrdersWithDeficit += dateOrders.length;
      for (const pId of info.productIds) {
        globalProductsNeedingProvision.add(pId);
      }
    }
  }

  return {
    stage: "mercado",
    totalOrders: totalOrdersWithDeficit,
    totalProducts: globalProductsNeedingProvision.size,
    dates,
    oldestPendingDate: dates[0]?.date ?? null,
  };
}
