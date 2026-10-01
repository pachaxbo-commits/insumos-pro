"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileSpreadsheet } from "lucide-react";

import { UserMenu } from "@/components/auth/user-menu";
import { QbInsumosBrand } from "@/components/branding/qb-insumos-brand";
import { canAccessPath } from "@/lib/auth/roles";
import { mainNavigation } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/types/auth";
import type { AppAppearance } from "@/lib/app-appearance/data";
import type { MenuKey } from "@/lib/app-appearance/model";

const keyByPath: Record<string, MenuKey> = {
  "/": "home", "/pedidos": "orders", "/matriz-operativa": "operation",
  "/stock": "stock", "/recibos": "receipts", "/clientes": "customers",
  "/matriz-operativa/mercado": "provision", "/configuracion": "settings",
};

export function AppHeader({ user, appearance }: { user: SessionUser; appearance: AppAppearance }) {
  const pathname = usePathname();
  const activePaths = [
    "/", "/pedidos", "/matriz-operativa", "/stock", "/recibos",
    "/clientes", "/configuracion",
  ];
  const navigation = [
    ...activePaths.map((href) => mainNavigation.find((item) => item.href === href)),
    user.role === "administrador"
      ? { href: "/matriz-operativa/mercado", title: "Hoja de Provisión", icon: FileSpreadsheet }
      : undefined,
  ].filter((item): item is NonNullable<typeof item> =>
    Boolean(item && canAccessPath(user.role, item.href)),
  );

  return (
    <header className="sticky top-0 z-50 flex min-w-0 items-center gap-3 border-b border-slate-200 bg-slate-100/95 px-3 py-2.5 lg:px-5">
      <Link href="/" aria-label={`${appearance.systemName}, inicio`} className="shrink-0">
        <QbInsumosBrand variant="compact" systemName={appearance.systemName} logoUrl={appearance.logoUrl} />
      </Link>
      <nav aria-label="Navegación principal" className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto whitespace-nowrap [scrollbar-width:thin]">
        {navigation.map((item) => {
          const active = pathname === item.href ||
            (item.href !== "/matriz-operativa" && pathname.startsWith(`${item.href}/`));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors",
                active ? "bg-emerald-900 text-white" : "text-slate-700 hover:bg-slate-100",
              )}
            >
              <Icon className="size-4.5" aria-hidden="true" />
              {keyByPath[item.href] ? appearance.menuLabels[keyByPath[item.href]] : item.title}
            </Link>
          );
        })}
      </nav>
      <UserMenu user={user} />
    </header>
  );
}
