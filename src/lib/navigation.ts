import {
  BarChart3,
  Boxes,
  CreditCard,
  LayoutDashboard,
  Package,
  ReceiptText,
  Settings,
  ShoppingBag,
  Truck,
  Users,
} from "lucide-react";

import type { NavItem } from "@/types/dashboard";

export const mainNavigation: NavItem[] = [
  {
    title: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
    description: "Vision general de ventas, inventario y alertas.",
  },
  {
    title: "Ventas",
    href: "/ventas",
    icon: ShoppingBag,
    description: "Seguimiento comercial y cobranzas.",
  },
  {
    title: "Compras",
    href: "/compras",
    icon: ReceiptText,
    description: "Ordenes a proveedores y abastecimiento.",
  },
  {
    title: "Inventario",
    href: "/inventario",
    icon: Boxes,
    description: "Control de stock y movimientos.",
  },
  {
    title: "Productos",
    href: "/productos",
    icon: Package,
    description: "Catalogo, precios y presentaciones.",
  },
  {
    title: "Clientes",
    href: "/clientes",
    icon: Users,
    description: "Mayoristas, restaurantes y cuentas activas.",
  },
  {
    title: "Proveedores",
    href: "/proveedores",
    icon: Truck,
    description: "Red de abastecimiento y compras.",
  },
  {
    title: "Finanzas",
    href: "/finanzas",
    icon: CreditCard,
    description: "Cuentas por cobrar, pagar y caja.",
  },
  {
    title: "Reportes",
    href: "/reportes",
    icon: BarChart3,
    description: "Indicadores operativos y comerciales.",
  },
  {
    title: "Configuracion",
    href: "/configuracion",
    icon: Settings,
    description: "Parametros del sistema y empresa.",
  },
];
