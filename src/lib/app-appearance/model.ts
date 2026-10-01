export const menuKeys = ["home", "orders", "operation", "stock", "receipts", "customers", "provision", "settings"] as const;
export type MenuKey = (typeof menuKeys)[number];

export const defaultMenuLabels: Record<MenuKey, string> = {
  home: "Inicio",
  orders: "Pedidos",
  operation: "Operación",
  stock: "Stock",
  receipts: "Recibos",
  customers: "Clientes",
  provision: "Hoja de Provisión",
  settings: "Configuración",
};
