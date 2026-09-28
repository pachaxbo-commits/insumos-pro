import type { NavItem } from "@/types/dashboard";
import type { UserRole } from "@/types/auth";

export const roleLabels: Record<UserRole, string> = {
  administrador: "Administrador",
  ventas: "Ventas",
  inventario: "Inventario",
  entregador: "Entregador",
  finanzas: "Finanzas",
};

export function getRoleLabel(role: UserRole | null | undefined) {
  if (!role) return "Sin rol";
  return roleLabels[role];
}

const roleRouteAccess: Record<UserRole, string[]> = {
  administrador: [
    "/",
    "/pedidos",
    "/matriz-operativa",
    "/productos",
    "/parametrizacion",
    "/clientes",
    "/recibos",
    "/historial",
  ],
  ventas: ["/"],
  inventario: ["/", "/matriz-operativa"],
  entregador: ["/", "/matriz-operativa"],
  finanzas: ["/"],
};

export type FocusedWorkspace = {
  href: string | null;
  title: string;
  description: string;
  step: string;
};

export function getFocusedWorkspace(
  role: UserRole | null | undefined,
): FocusedWorkspace {
  switch (role) {
    case "administrador":
      return {
        href: "/pedidos",
        title: "Crear pedidos",
        description: "Registra el pedido solicitado por cada cliente.",
        step: "Paso 1 de 3",
      };
    case "inventario":
      return {
        href: "/matriz-operativa",
        title: "Preparar pedidos",
        description: "Marca cantidades y observaciones para despacho.",
        step: "Paso 2 de 3",
      };
    case "entregador":
      return {
        href: "/matriz-operativa",
        title: "Registrar entregas",
        description: "Anota las cantidades exactas que recibió el cliente.",
        step: "Paso 3 de 3",
      };
    default:
      return {
        href: null,
        title: "Módulo en pausa",
        description: "Este perfil se habilitará en una siguiente etapa.",
        step: "Bloqueado por ahora",
      };
  }
}

function normalizePath(pathname: string) {
  if (!pathname) return "/";

  const path = pathname.split("?")[0]?.split("#")[0] ?? "/";

  if (path === "/") return "/";

  return path.endsWith("/") ? path.slice(0, -1) : path;
}

export function canAccessPath(role: UserRole | null | undefined, pathname: string) {
  if (!role) return false;

  const normalizedPath = normalizePath(pathname);
  const allowedRoutes = roleRouteAccess[role];

  if (allowedRoutes.includes("*")) {
    return true;
  }

  return allowedRoutes.some((allowedPath) => {
    const normalizedAllowedPath = normalizePath(allowedPath);

    if (normalizedAllowedPath === "/") {
      return normalizedPath === "/";
    }

    return (
      normalizedPath === normalizedAllowedPath ||
      normalizedPath.startsWith(`${normalizedAllowedPath}/`)
    );
  });
}

export function filterNavigationByRole(items: NavItem[], role: UserRole | null | undefined) {
  return items.filter((item) => canAccessPath(role, item.href));
}
