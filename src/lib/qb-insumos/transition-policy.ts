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
    reason: "Consulta un resumen de pedidos, ingresos, inventario y recibos.",
    visibleInNavigation: true,
  },
  {
    id: "productos",
    title: "Productos",
    href: "/productos",
    status: "active_transitional",
    reason: "Gestiona el Catálogo, las unidades, las presentaciones y la información de cada producto.",
    visibleInNavigation: true,
  },
  {
    id: "ingresos",
    title: "Ingresos",
    href: "/ingresos",
    status: "active_transitional",
    reason: "Registra la recepción física de mercadería y su clasificación cuando corresponda.",
    visibleInNavigation: true,
  },
  {
    id: "pedidos",
    title: "Pedidos",
    href: "/pedidos",
    status: "active_transitional",
    reason: "Crea, busca y consulta el historial y detalle administrativo de pedidos.",
    visibleInNavigation: true,
  },
  {
    id: "matriz-operativa",
    title: "Matriz operativa",
    href: "/matriz-operativa",
    status: "active_transitional",
    reason: "Prepara y entrega pedidos en una planilla operativa por fecha.",
    visibleInNavigation: true,
  },
  {
    id: "clientes",
    title: "Clientes",
    href: "/clientes",
    status: "active_transitional",
    reason: "Consulta los datos de contacto y el estado de los clientes registrados.",
    visibleInNavigation: true,
  },
  {
    id: "configuracion",
    title: "Configuración",
    href: "/configuracion",
    status: "active_transitional",
    reason: "Consulta los accesos por rol y la bitácora de actividad.",
    visibleInNavigation: true,
  },
  {
    id: "inventario",
    title: "Inventario",
    href: "/inventario",
    status: "suspended_legacy",
    reason: "Consulta las existencias desde Reportes. El inventario se actualiza mediante Ingresos y Entregas.",
    visibleInNavigation: false,
  },
  {
    id: "ventas",
    title: "Ventas",
    href: "/ventas",
    status: "suspended_legacy",
    reason: "Gestiona las solicitudes desde Pedidos y revisa los importes consolidados desde Recibos.",
    visibleInNavigation: false,
  },

  {
    id: "compras",
    title: "Compras",
    href: "/compras",
    status: "suspended_legacy",
    reason: "Registra la mercadería recibida desde Ingresos.",
    visibleInNavigation: false,
  },
  {
    id: "compras-multiple",
    title: "Compra múltiple",
    href: "/compras/multiple",
    status: "suspended_legacy",
    reason: "Registra cada recepción y su clasificación desde Ingresos.",
    visibleInNavigation: false,
  },
  {
    id: "proveedores",
    title: "Proveedores",
    href: "/proveedores",
    status: "suspended_legacy",
    reason: "La gestión de proveedores no está disponible en la operación actual.",
    visibleInNavigation: false,
  },
  {
    id: "finanzas",
    title: "Finanzas",
    href: "/finanzas",
    status: "suspended_legacy",
    reason: "QB Insumos no registra caja, cobros, pagos ni cuentas por cobrar o pagar.",
    visibleInNavigation: false,
  },
  {
    id: "reportes",
    title: "Reportes",
    href: "/reportes",
    status: "active_transitional",
    reason: "Consulta inventario, ingresos, pedidos, entregas, recibos y actividad operativa.",
    visibleInNavigation: true,
  },
  {
    id: "catalogo-publico",
    title: "Catálogo público",
    href: "/catalogo",
    status: "active_transitional",
    reason: "Consulta los productos disponibles y agrega las cantidades que necesitas.",
    visibleInNavigation: false,
  },
  {
    id: "checkout-publico",
    title: "Revisión de pedido",
    href: "/catalogo/checkout",
    status: "active_transitional",
    reason: "Revisa los productos y los datos de entrega antes de enviar el pedido.",
    visibleInNavigation: false,
  },
  {
    id: "mi-cuenta",
    title: "Mi cuenta",
    href: "/mi-cuenta",
    status: "active_transitional",
    reason: "Consulta el perfil, las ubicaciones y el historial de pedidos del cliente.",
    visibleInNavigation: false,
  },
  {
    id: "mi-cuenta-recuperar",
    title: "Recuperar cuenta cliente",
    href: "/mi-cuenta/recuperar",
    status: "active_transitional",
    reason: "Solicita un enlace para recuperar el acceso a la cuenta de cliente.",
    visibleInNavigation: false,
  },
  {
    id: "mi-cuenta-restablecer",
    title: "Restablecer cuenta cliente",
    href: "/mi-cuenta/restablecer",
    status: "active_transitional",
    reason: "Define una nueva contraseña para la cuenta de cliente.",
    visibleInNavigation: false,
  },
  {
    id: "confirmacion-publica",
    title: "Confirmación pública de pedido",
    href: "/pedido/confirmar",
    status: "suspended_legacy",
    reason: "La confirmación se gestiona desde el flujo vigente de Pedidos.",
    visibleInNavigation: false,
  },
  {
    id: "recibos",
    title: "Recibos acumulativos",
    href: "/recibos",
    status: "active_transitional",
    reason: "Agrupa pedidos entregados y gestiona recibos acumulativos no fiscales.",
    visibleInNavigation: true,
  },
  {
    id: "entregas",
    title: "Entregas",
    href: "/matriz-operativa",
    status: "active_transitional",
    reason: "Confirma la entrega desde la Matriz operativa; luego genera el recibo acumulativo correspondiente.",
    visibleInNavigation: false,
  },
  {
    id: "parametrizacion",
    title: "Parametrización",
    href: "/parametrizacion",
    status: "active_transitional",
    reason: "Define unidades, conversiones y presentaciones disponibles para los productos.",
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
