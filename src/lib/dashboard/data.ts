import { CreditCard, PackageSearch, ReceiptText, WalletCards } from "lucide-react";

import { getFinanceData } from "@/lib/finance/data";
import { formatCurrency, formatNumber } from "@/lib/format";
import { getInventoryData } from "@/lib/inventory/data";
import { getSalesData } from "@/lib/sales/data";
import type {
  AlertItem,
  InventoryMovementType,
  KpiItem,
  SaleStatus,
} from "@/types/dashboard";

export type DashboardSaleRow = {
  id: string;
  customer: string;
  date: string;
  amount: number;
  status: SaleStatus;
  channel: string;
};

export type DashboardMovementRow = {
  id: string;
  product: string;
  type: InventoryMovementType;
  quantity: number;
  unit: string;
  warehouse: string;
  date: string;
};

export type DashboardTopProduct = {
  id: string;
  name: string;
  category: string;
  units: number;
  revenue: number;
};

export type DashboardStockAlert = {
  id: string;
  product: string;
  stock: number;
  minimum: number;
  supplier: string;
};

export type DashboardData = {
  kpis: KpiItem[];
  recentSales: DashboardSaleRow[];
  recentMovements: DashboardMovementRow[];
  alerts: AlertItem[];
  topProducts: DashboardTopProduct[];
  stockAlerts: DashboardStockAlert[];
  lowStockProducts: number;
  outOfStockProducts: number;
  movementsToday: number;
  receivableTotal: number;
  payableTotal: number;
  netCashToday: number;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-BO", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-BO", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export async function getDashboardData(): Promise<DashboardData> {
  const [salesData, inventoryData, financeData] = await Promise.all([
    getSalesData(),
    getInventoryData(),
    getFinanceData(),
  ]);

  const receivableTotal = financeData.summary.receivableTotal || salesData.summary.pendingDebt;
  const payableTotal = financeData.summary.payableTotal;

  return {
    kpis: [
      {
        title: "Ventas de hoy",
        value: formatCurrency(salesData.summary.salesToday),
        change: `${salesData.summary.confirmedSales} confirmadas`,
        trend: "up",
        icon: ReceiptText,
        caption: "Datos reales",
      },
      {
        title: "Ventas del mes",
        value: formatCurrency(salesData.summary.salesMonth),
        change: `${formatNumber(salesData.summary.draftSales)} borradores`,
        trend: "neutral",
        icon: WalletCards,
        caption: "Ventas confirmadas",
      },
      {
        title: "Cuentas por cobrar",
        value: formatCurrency(receivableTotal),
        change: `${financeData.summary.overdueReceivable} vencidas`,
        trend: receivableTotal > 0 ? "neutral" : "up",
        icon: CreditCard,
        caption: "Cartera pendiente",
      },
      {
        title: "Stock critico",
        value: formatNumber(inventoryData.summary.lowStockProducts + inventoryData.summary.outOfStockProducts),
        change: `${inventoryData.summary.movementsToday} movimientos hoy`,
        trend: inventoryData.summary.lowStockProducts ? "down" : "up",
        icon: PackageSearch,
        caption: "Inventario activo",
      },
    ],
    recentSales: salesData.sales.slice(0, 6).map((sale) => ({
      id: sale.id.slice(0, 8),
      customer: sale.customer?.name ?? "Sin cliente",
      date: formatDate(sale.sale_date),
      amount: Number(sale.total),
      status: sale.status,
      channel: sale.payment_type,
    })),
    recentMovements: inventoryData.movements.slice(0, 6).map((movement) => ({
      id: movement.id,
      product: movement.product?.name ?? "Producto no disponible",
      type: movement.movement_type,
      quantity: Number(movement.quantity),
      unit: movement.product?.unit?.abbreviation ?? "",
      warehouse: movement.reason,
      date: formatDateTime(movement.created_at),
    })),
    alerts: [
      ...inventoryData.alerts.slice(0, 3).map((product) => ({
        id: product.id,
        title: product.stock_status === "sin_stock" ? "Producto sin stock" : "Producto con stock bajo",
        description: `${product.name}: ${formatNumber(Number(product.stock_current))} de minimo ${formatNumber(Number(product.stock_min))}.`,
        tone: product.stock_status === "sin_stock" ? ("critical" as const) : ("warning" as const),
        time: "Inventario",
      })),
      ...(payableTotal > 0
        ? [
            {
              id: "payables",
              title: "Cuentas por pagar pendientes",
              description: `Saldo pendiente con proveedores: ${formatCurrency(payableTotal)}.`,
              tone: "info" as const,
              time: "Finanzas",
            },
          ]
        : []),
    ],
    topProducts: salesData.topProducts.map((product) => ({
      id: product.product_id,
      name: product.name,
      category: "Ventas",
      units: product.quantity,
      revenue: product.revenue,
    })),
    stockAlerts: inventoryData.alerts.slice(0, 5).map((product) => ({
      id: product.id,
      product: product.name,
      stock: Number(product.stock_current),
      minimum: Number(product.stock_min),
      supplier: product.supplier_name ?? product.category?.name ?? "Sin proveedor referencial",
    })),
    lowStockProducts: inventoryData.summary.lowStockProducts,
    outOfStockProducts: inventoryData.summary.outOfStockProducts,
    movementsToday: inventoryData.summary.movementsToday,
    receivableTotal,
    payableTotal,
    netCashToday: financeData.summary.netCashToday,
  };
}
