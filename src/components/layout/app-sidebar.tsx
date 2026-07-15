"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { QbInsumosBrand } from "@/components/branding/qb-insumos-brand";
import { Separator } from "@/components/ui/separator";
import { filterNavigationByRole, getRoleLabel } from "@/lib/auth/roles";
import { mainNavigation } from "@/lib/navigation";
import { getActiveTransitionalModules } from "@/lib/qb-insumos/transition-policy";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/types/auth";

type AppSidebarProps = {
  onNavigate?: () => void;
  mobile?: boolean;
  user: SessionUser;
};

export function AppSidebar({ onNavigate, mobile = false, user }: AppSidebarProps) {
  const pathname = usePathname();
  const activeHrefs = new Set(
    getActiveTransitionalModules()
      .map((module) => module.href)
      .filter(Boolean),
  );
  const visibleNavigation = filterNavigationByRole(mainNavigation, user.role).filter((item) =>
    activeHrefs.has(item.href),
  );

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
        <div className="flex items-center gap-3">
          <QbInsumosBrand
            variant="compact"
            textClassName="text-sidebar-foreground"
          />
        </div>
        <p className="mt-3 text-sm text-sidebar-foreground/70">{getRoleLabel(user.role)}</p>
      </div>

      <Separator className="bg-white/10" />

      <nav className="flex-1 space-y-1 px-3 py-4">
        {visibleNavigation.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors",
                isActive
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-sidebar-foreground/78 hover:bg-white/8 hover:text-sidebar-foreground",
              )}
            >
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-xl",
                  isActive ? "bg-slate-100 text-slate-900" : "bg-white/8 text-sidebar-foreground/88",
                )}
              >
                <Icon className="size-4.5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{item.title}</span>
                <span className={cn("block truncate text-xs", isActive ? "text-slate-500" : "text-sidebar-foreground/60")}>
                  {item.description}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mx-4 mb-4 rounded-2xl border border-white/10 bg-white/6 p-4">
        <p className="text-sm font-medium">Operación QB Insumos</p>
        <p className="mt-1 text-xs leading-5 text-sidebar-foreground/70">
          Accede a las funciones disponibles para tu rol.
        </p>
      </div>
    </aside>
  );
}
