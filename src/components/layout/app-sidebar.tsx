"use client";

import { FileSpreadsheet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { QbInsumosBrand } from "@/components/branding/qb-insumos-brand";
import { Separator } from "@/components/ui/separator";
import {
  canAccessPath,
  getFocusedWorkspace,
  getRoleLabel,
} from "@/lib/auth/roles";
import { mainNavigation } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/types/auth";

type AppSidebarProps = {
  onNavigate?: () => void;
  mobile?: boolean;
  user: SessionUser;
};

export function AppSidebar({
  onNavigate,
  mobile = false,
  user,
}: AppSidebarProps) {
  const pathname = usePathname();
  const workspace = getFocusedWorkspace(user.role);
  const adminAvailablePaths = new Set([
    "/matriz-operativa",
    "/productos",
    "/parametrizacion",
    "/clientes",
    "/recibos",
    "/historial",
  ]);
  const availableItems = mainNavigation.filter(
    (item) =>
      item.href === workspace.href ||
      (user.role === "administrador" && adminAvailablePaths.has(item.href)),
  );
  const dailyFlow = [
    { href: "/pedidos", label: "1. Crear pedido" },
    { href: "/matriz-operativa", label: "2. Preparar y entregar" },
    { href: "/recibos", label: "3. Generar recibo" },
  ].filter((item) => canAccessPath(user.role, item.href));
  return (
    <aside
      className={cn(
        "flex h-full flex-col",
        mobile
          ? "min-h-screen bg-sidebar text-sidebar-foreground"
          : "rounded-[1.75rem] border border-white/10 bg-sidebar text-sidebar-foreground shadow-2xl shadow-slate-950/15",
      )}
    >
      <div className="px-5 py-6">
        <QbInsumosBrand
          variant="compact"
          textClassName="text-sidebar-foreground"
        />
        <p className="mt-3 text-sm text-sidebar-foreground/70">
          {getRoleLabel(user.role)}
        </p>
      </div>

      <Separator className="bg-white/10" />

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-sidebar-foreground/45">
          Disponible ahora
        </p>
        {availableItems.length && workspace.href ? (
          <div className="mt-2 space-y-1">
            {availableItems.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              const focused = item.href === workspace.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors",
                    active
                      ? "bg-white text-slate-900 shadow-sm"
                      : "bg-white/10 text-sidebar-foreground hover:bg-white/15",
                  )}
                >
                  <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-900">
                    <Icon className="size-4.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">
                      {focused ? workspace.title : item.title}
                    </span>
                    <span
                      className={cn(
                        "block truncate text-xs",
                        active
                          ? "text-slate-500"
                          : "text-sidebar-foreground/65",
                      )}
                    >
                      {focused ? workspace.step : item.description}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="mt-2 rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-sidebar-foreground/70">
            {workspace.description}
          </div>
        )}

        {user.role === "administrador" ? (
          <div className="mt-6">
            <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-sidebar-foreground/45">
              Compras
            </p>
            <div className="mt-2 space-y-1">
              <Link
                href="/matriz-operativa/mercado"
                aria-current={pathname === "/matriz-operativa/mercado" ? "page" : undefined}
                onClick={onNavigate}
                className="flex items-center gap-3 rounded-xl bg-emerald-950/35 px-3 py-3 text-sidebar-foreground hover:bg-emerald-950/50"
              >
                <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-900">
                  <FileSpreadsheet className="size-4" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">Hoja de compras</span>
                  <span className="block text-xs text-sidebar-foreground/65">Vista para imprimir y Excel</span>
                </span>
              </Link>
            </div>
          </div>
        ) : null}
      </nav>

      <div className="mx-4 mb-4 rounded-2xl border border-white/10 bg-white/6 p-4">
        <p className="text-sm font-medium">Flujo diario</p>
        <div className="mt-2 space-y-1 text-xs text-sidebar-foreground/75">
          {dailyFlow.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className="block rounded-md px-2 py-1.5 hover:bg-white/10"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </aside>
  );
}
