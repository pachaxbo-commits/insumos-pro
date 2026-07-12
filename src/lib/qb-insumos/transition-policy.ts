export type TransitionModuleStatus =
  | "active_transitional"
  | "suspended_legacy"
  | "future_qb_module";

export type TransitionModule = {
  id: string;
  title: string;
  href: string | null;
  status: TransitionModuleStatus;
  reason: string;
  visibleInNavigation: boolean;
};

export const transitionModules: TransitionModule[] = [
  {
    id: "inicio",
    title: "Inicio",
    href: "/",
    status: "active_transitional",
    reason: "Resumen operativo QB sin metricas financieras ni consultas de ventas, pagos o caja.",
    visibleInNavigation: true,
  },
  {
    id: "productos",
    title: "Productos",
    href: "/productos",
    status: "active_transitional",
    reason: "Catalogo base reutilizable para QB Insumos; no ejecuta ventas, pagos ni caja.",
    visibleInNavigation: true,
  },
  {
    id: "ingresos",
    title: "Ingresos",
    href: "/ingresos",
    status: "active_transitional",
    reason: "Modulo QB-4 para recepcion fisica y clasificacion opcional sin compras legacy, pagos ni CxP.",
    visibleInNavigation: true,
  },
  {
    id: "pedidos",
    title: "Pedidos",
    href: "/pedidos",
    status: "active_transitional",
    reason: "Modulo QB-6 para preparacion y entrega fisica; descuenta stock al entregar sin ventas, cobros ni recibos.",
    visibleInNavigation: true,
  },
  {
    id: "clientes",
    title: "Clientes",
    href: "/clientes",
    status: "active_transitional",
    reason: "Vista transitoria de clientes sin cobros, checkout ni cuentas por cobrar operativas.",
    visibleInNavigation: true,
  },
  {
    id: "configuracion",
    title: "Configuracion",
    href: "/configuracion",
    status: "active_transitional",
    reason: "Vista segura de parametros de transicion y auditoria de solo lectura.",
    visibleInNavigation: true,
  },
  {
    id: "inventario",
    title: "Inventario",
    href: "/inventario",
    status: "suspended_legacy",
    reason: "Los movimientos manuales de stock se congelan hasta QB-2/QB-3/QB-6 para evitar descuentos o ajustes incompatibles.",
    visibleInNavigation: false,
  },
  {
    id: "ventas",
    title: "Ventas",
    href: "/ventas",
    status: "suspended_legacy",
    reason: "El flujo objetivo reemplaza ventas POS/manuales por recibos acumulativos no fiscales despues de entrega.",
    visibleInNavigation: false,
  },

  {
    id: "compras",
    title: "Compras",
    href: "/compras",
    status: "suspended_legacy",
    reason: "Las compras actuales mezclan recepcion con pagos/confirmaciones antiguas; seran reemplazadas por ingresos QB.",
    visibleInNavigation: false,
  },
  {
    id: "compras-multiple",
    title: "Compra multiple",
    href: "/compras/multiple",
    status: "suspended_legacy",
    reason: "La base de clasificacion se reutilizara luego, pero su confirmacion actual no queda operativa en QB-1.",
    visibleInNavigation: false,
  },
  {
    id: "proveedores",
    title: "Proveedores",
    href: "/proveedores",
    status: "suspended_legacy",
    reason: "Queda congelado junto con compras antiguas hasta definir ingresos de mercaderia QB.",
    visibleInNavigation: false,
  },
  {
    id: "finanzas",
    title: "Finanzas",
    href: "/finanzas",
    status: "suspended_legacy",
    reason: "QB Insumos no registra efectivo, QR, caja, cuentas por cobrar, cuentas por pagar ni pagos.",
    visibleInNavigation: false,
  },
  {
    id: "reportes",
    title: "Reportes QB",
    href: "/reportes",
    status: "active_transitional",
    reason: "Modulo QB-8 de reportes simples y auditoria operativa sin ventas, pagos, caja, CxC ni CxP.",
    visibleInNavigation: true,
  },
  {
    id: "catalogo-publico",
    title: "Catalogo publico",
    href: "/catalogo",
    status: "active_transitional",
    reason: "Catalogo QB-5 sin precios, pago, checkout legacy ni confirmacion por token.",
    visibleInNavigation: false,
  },
  {
    id: "checkout-publico",
    title: "Checkout publico",
    href: "/catalogo/checkout",
    status: "active_transitional",
    reason: "Revision QB-5 de pedido sin precios ni metodo de pago.",
    visibleInNavigation: false,
  },
  {
    id: "mi-cuenta",
    title: "Mi cuenta cliente",
    href: "/mi-cuenta",
    status: "active_transitional",
    reason: "Cuenta cliente con perfil, ubicaciones, historial y estados QB-6 sin precios.",
    visibleInNavigation: false,
  },
  {
    id: "mi-cuenta-recuperar",
    title: "Recuperar cuenta cliente",
    href: "/mi-cuenta/recuperar",
    status: "active_transitional",
    reason: "Recuperacion de acceso de cliente reutilizada sin flujo de pagos ni precios.",
    visibleInNavigation: false,
  },
  {
    id: "mi-cuenta-restablecer",
    title: "Restablecer cuenta cliente",
    href: "/mi-cuenta/restablecer",
    status: "active_transitional",
    reason: "Restablecimiento de contrasena de cliente reutilizado sin flujo de pagos ni precios.",
    visibleInNavigation: false,
  },
  {
    id: "confirmacion-publica",
    title: "Confirmacion publica de pedido",
    href: "/pedido/confirmar",
    status: "suspended_legacy",
    reason: "La confirmacion por token y precio queda fuera del flujo oficial de QB Insumos.",
    visibleInNavigation: false,
  },
  {
    id: "recibos",
    title: "Recibos acumulativos",
    href: "/recibos",
    status: "active_transitional",
    reason: "Modulo QB-7 para recibos acumulativos no fiscales sin cobros, caja ni CxC.",
    visibleInNavigation: true,
  },
  {
    id: "entregas",
    title: "Entregas",
    href: "/pedidos",
    status: "active_transitional",
    reason: "La entrega QB-6 vive dentro de Pedidos y deja el recibo acumulativo pendiente para QB-7.",
    visibleInNavigation: false,
  },
  {
    id: "parametrizacion",
    title: "Parametrizacion QB",
    href: "/parametrizacion",
    status: "active_transitional",
    reason: "Modulo QB-2/QB-3 para unidades, productos QB y presentaciones sin activar operaciones.",
    visibleInNavigation: true,
  },
];

export function getActiveTransitionalModules() {
  return transitionModules.filter(
    (module) => module.status === "active_transitional" && module.visibleInNavigation,
  );
}

export function getSuspendedLegacyModules() {
  return transitionModules.filter((module) => module.status === "suspended_legacy");
}

export function getFutureQbModules() {
  return transitionModules.filter((module) => module.status === "future_qb_module");
}

export function getTransitionModuleByPath(pathname: string) {
  const normalizedPath = normalizePath(pathname);
  return transitionModules
    .filter((module) => module.href)
    .sort((a, b) => (b.href?.length ?? 0) - (a.href?.length ?? 0))
    .find((module) => {
      const href = normalizePath(module.href ?? "/");
      return normalizedPath === href || normalizedPath.startsWith(`${href}/`);
    });
}

function normalizePath(pathname: string) {
  if (!pathname) return "/";

  const path = pathname.split("?")[0]?.split("#")[0] ?? "/";
  if (path === "/") return "/";

  return path.endsWith("/") ? path.slice(0, -1) : path;
}
