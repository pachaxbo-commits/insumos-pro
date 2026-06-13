import type { NavItem } from "@/types/dashboard";
import type { UserRole } from "@/types/auth";

export const roleLabels: Record<UserRole, string> = {
  administrador: "Administrador",
  ventas: "Ventas",
  inventario: "Inventario",
  finanzas: "Finanzas",
};

export function getRoleLabel(role: UserRole | null | undefined) {
  if (!role) return "Sin rol";
  return roleLabels[role];
}

const roleRouteAccess: Record<UserRole, string[]> = {
  administrador: ["*"],
  ventas: ["/", "/ventas", "/clientes", "/reportes"],
  inventario: [
    "/",
    "/productos",
    "/inventario",
    "/compras",
    "/proveedores",
    "/reportes",
  ],
  finanzas: [
    "/",
    "/finanzas",
    "/clientes",
    "/reportes",
    "/finanzas/cuentas-por-cobrar",
    "/finanzas/cuentas-por-pagar",
  ],
};

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
