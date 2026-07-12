import {
  LayoutDashboard,
  BarChart3,
  ClipboardList,
  Package,
  PackageCheck,
  ReceiptText,
  Settings,
  SlidersHorizontal,
  Users,
} from "lucide-react";

import type { NavItem } from "@/types/dashboard";

export const mainNavigation: NavItem[] = [
  {
    title: "Inicio QB",
    href: "/",
    icon: LayoutDashboard,
    description: "Resumen operativo QB.",
  },
  {
    title: "Productos",
    href: "/productos",
    icon: Package,
    description: "Catalogo base transitorio.",
  },
  {
    title: "Ingresos",
    href: "/ingresos",
    icon: PackageCheck,
    description: "Recepcion y clasificacion QB.",
  },
  {
    title: "Pedidos",
    href: "/pedidos",
    icon: ClipboardList,
    description: "Preparacion y entrega QB.",
  },
  {
    title: "Recibos",
    href: "/recibos",
    icon: ReceiptText,
    description: "Recibos acumulativos QB.",
  },
  {
    title: "Reportes QB",
    href: "/reportes",
    icon: BarChart3,
    description: "Reportes y auditoria QB.",
  },
  {
    title: "Parametrizacion",
    href: "/parametrizacion",
    icon: SlidersHorizontal,
    description: "Productos, unidades y presentaciones QB.",
  },
  {
    title: "Clientes",
    href: "/clientes",
    icon: Users,
    description: "Datos de contacto sin cobros.",
  },
  {
    title: "Configuracion",
    href: "/configuracion",
    icon: Settings,
    description: "Transicion, permisos y auditoria.",
  },
];
