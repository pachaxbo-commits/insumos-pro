import {
  BadgeDollarSign,
  PackagePlus,
  ShoppingCart,
  UserPlus,
  Wallet,
  Warehouse,
} from "lucide-react";

import { formatCurrency } from "@/lib/format";
import type {
  AlertItem,
  FinanceHighlight,
  InventoryMovement,
  KpiItem,
  QuickAction,
  SaleItem,
  StockAlert,
  TopProduct,
} from "@/types/dashboard";

export const dashboardKpis: KpiItem[] = [
  {
    title: "Ventas de hoy",
    value: formatCurrency(18640),
    change: "+12.4%",
    trend: "up",
    icon: BadgeDollarSign,
    caption: "17 facturas emitidas antes de las 16:00",
  },
  {
    title: "Ventas del mes",
    value: formatCurrency(382500),
    change: "+8.1%",
    trend: "up",
    icon: ShoppingCart,
    caption: "Meta mensual cubierta al 74%",
  },
  {
    title: "Cuentas por cobrar",
    value: formatCurrency(91420),
    change: "6 vencidas",
    trend: "neutral",
    icon: Wallet,
    caption: "Mayor concentración en restaurantes y hoteles",
  },
  {
    title: "Cuentas por pagar",
    value: formatCurrency(63580),
    change: "3 esta semana",
    trend: "down",
    icon: Warehouse,
    caption: "Pagos programados con proveedores clave",
  },
];

export const financeHighlights: FinanceHighlight[] = [
  {
    id: "fh-1",
    label: "Margen bruto demo",
    value: "26.8%",
    detail: "Promedio estimado sobre ventas del mes",
  },
  {
    id: "fh-2",
    label: "Cobranza proyectada",
    value: formatCurrency(48400),
    detail: "Próximos 7 días según vencimientos demo",
  },
  {
    id: "fh-3",
    label: "Compras por reponer",
    value: formatCurrency(22350),
    detail: "Basado en alertas de stock bajo",
  },
];

export const recentSales: SaleItem[] = [
  {
    id: "V-24091",
    customer: "Restaurante Sabor Andino",
    date: "Hoy, 15:10",
    amount: 2340,
    status: "pagada",
    channel: "Mostrador",
  },
  {
    id: "V-24090",
    customer: "Hotel Valle Verde",
    date: "Hoy, 14:35",
    amount: 5180,
    status: "pendiente",
    channel: "Crédito",
  },
  {
    id: "V-24088",
    customer: "Pollos Don Gallo",
    date: "Hoy, 12:20",
    amount: 1460,
    status: "pagada",
    channel: "Transferencia",
  },
  {
    id: "V-24084",
    customer: "Catering La Estancia",
    date: "Ayer, 18:05",
    amount: 3890,
    status: "pendiente",
    channel: "Crédito",
  },
  {
    id: "V-24079",
    customer: "Mercado Gourmet Central",
    date: "Ayer, 10:45",
    amount: 2840,
    status: "vencida",
    channel: "Crédito",
  },
];

export const inventoryMovements: InventoryMovement[] = [
  {
    id: "M-903",
    product: "Tomate perita",
    type: "salida",
    quantity: 120,
    unit: "kg",
    warehouse: "Depósito Principal",
    date: "Hoy, 14:20",
  },
  {
    id: "M-901",
    product: "Arroz premium 50 kg",
    type: "entrada",
    quantity: 18,
    unit: "bolsas",
    warehouse: "Depósito Principal",
    date: "Hoy, 11:15",
  },
  {
    id: "M-896",
    product: "Aceite vegetal 5 L",
    type: "salida",
    quantity: 24,
    unit: "bidones",
    warehouse: "Picking",
    date: "Hoy, 09:40",
  },
  {
    id: "M-890",
    product: "Condimento mixto",
    type: "ajuste",
    quantity: 6,
    unit: "cajas",
    warehouse: "Secos",
    date: "Ayer, 17:10",
  },
];

export const alerts: AlertItem[] = [
  {
    id: "A-1",
    title: "Stock bajo de locoto",
    description: "Quedan 14 kg y la rotación semanal supera 30 kg.",
    tone: "critical",
    time: "Hace 12 min",
  },
  {
    id: "A-2",
    title: "Cobro vencido de Mercado Gourmet Central",
    description: "Factura V-24079 con 5 días de retraso.",
    tone: "warning",
    time: "Hace 35 min",
  },
  {
    id: "A-3",
    title: "Pedido de arroz confirmado por proveedor",
    description: "Entrega estimada para mañana a primera hora.",
    tone: "success",
    time: "Hace 1 h",
  },
  {
    id: "A-4",
    title: "Cierre de caja pendiente",
    description: "La caja del turno mañana aún no fue conciliada.",
    tone: "info",
    time: "Hace 2 h",
  },
];

export const stockAlerts: StockAlert[] = [
  {
    id: "S-1",
    product: "Locoto fresco",
    stock: 14,
    minimum: 30,
    supplier: "Agrícola Don Pepe",
  },
  {
    id: "S-2",
    product: "Cebolla roja",
    stock: 38,
    minimum: 60,
    supplier: "MercaCampo SRL",
  },
  {
    id: "S-3",
    product: "Aceite vegetal 5 L",
    stock: 12,
    minimum: 20,
    supplier: "Distribuidora El Sol",
  },
  {
    id: "S-4",
    product: "Condimento mixto",
    stock: 9,
    minimum: 18,
    supplier: "Sabores del Valle",
  },
];

export const topProducts: TopProduct[] = [
  {
    id: "P-1",
    name: "Arroz premium 50 kg",
    category: "Secos",
    units: 86,
    revenue: 75680,
  },
  {
    id: "P-2",
    name: "Papa holandesa",
    category: "Verduras",
    units: 420,
    revenue: 28560,
  },
  {
    id: "P-3",
    name: "Tomate perita",
    category: "Verduras",
    units: 360,
    revenue: 24840,
  },
  {
    id: "P-4",
    name: "Aceite vegetal 5 L",
    category: "Aceites",
    units: 72,
    revenue: 21600,
  },
];

export const quickActions: QuickAction[] = [
  {
    title: "Nueva venta",
    description: "Registrar una venta demo o preparar una factura.",
    href: "/ventas",
    icon: ShoppingCart,
  },
  {
    title: "Nueva compra",
    description: "Agregar una compra de reposición a proveedores.",
    href: "/compras",
    icon: BadgeDollarSign,
  },
  {
    title: "Nuevo producto",
    description: "Dar de alta un nuevo ítem del catálogo.",
    href: "/productos",
    icon: PackagePlus,
  },
  {
    title: "Nuevo cliente",
    description: "Registrar una cuenta comercial o restaurante.",
    href: "/clientes",
    icon: UserPlus,
  },
];

export const operationalSummary = {
  lowStockProducts: 4,
  pendingOrders: 7,
};
