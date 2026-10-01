import {
  LayoutDashboard,
  BarChart3,
  ClipboardList,
  TableProperties,
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
    title: "Inicio",
    href: "/",
    icon: LayoutDashboard,
    description: "Resumen de la operación.",
  },
  {
    title: "Stock",
    href: "/stock",
    icon: Package,
    description: "Existencias y movimientos.",
  },
  {
    title: "Ingresos",
    href: "/ingresos",
    icon: PackageCheck,
    description: "Recepción y clasificación.",
  },
  {
    title: "Pedidos",
    href: "/pedidos",
    icon: ClipboardList,
    description: "Creación, historial y detalle.",
  },
  {
    title: "Abrir preparación y entregas",
    href: "/matriz-operativa",
    icon: TableProperties,
    description: "Matriz operativa por fecha.",
  },
  {
    title: "Recibos",
    href: "/recibos",
    icon: ReceiptText,
    description: "Recibos acumulativos.",
  },
  {
    title: "Historial",
    href: "/historial",
    icon: BarChart3,
    description: "Consulta operativa por fecha.",
  },
  {
    title: "Reportes",
    href: "/reportes",
    icon: BarChart3,
    description: "Reportes y auditoría.",
  },
  {
    title: "Parametrización",
    href: "/parametrizacion",
    icon: SlidersHorizontal,
    description: "Unidades y presentaciones.",
  },
  {
    title: "Clientes",
    href: "/clientes",
    icon: Users,
    description: "Datos de contacto y estado.",
  },
  {
    title: "Configuración",
    href: "/configuracion",
    icon: Settings,
    description: "Accesos y auditoría.",
  },
];
