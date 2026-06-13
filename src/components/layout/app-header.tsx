"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, PlusCircle, Search } from "lucide-react";

import { UserMenu } from "@/components/auth/user-menu";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { canAccessPath, getRoleLabel } from "@/lib/auth/roles";
import type { SessionUser } from "@/types/auth";

type AppHeaderProps = {
  user: SessionUser;
};

export function AppHeader({ user }: AppHeaderProps) {
  const [open, setOpen] = useState(false);
  const canCreateSale = canAccessPath(user.role, "/ventas");

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 rounded-[1.5rem] border border-white/60 bg-white/78 px-4 py-3 shadow-sm backdrop-blur lg:px-5">
      <div className="flex items-center gap-3">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="lg:hidden">
              <Menu className="size-5" />
              <span className="sr-only">Abrir menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[320px] border-0 bg-transparent p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Navegacion principal</SheetTitle>
            </SheetHeader>
            <AppSidebar mobile onNavigate={() => setOpen(false)} user={user} />
          </SheetContent>
        </Sheet>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Operacion
          </p>
          <h2 className="font-heading text-lg font-semibold tracking-tight">Dashboard ejecutivo</h2>
        </div>
      </div>

      <div className="hidden min-w-0 flex-1 items-center justify-center px-4 md:flex">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            readOnly
            value="Buscar ventas, productos o clientes (demo)"
            className="border-white bg-muted/70 pl-9 text-muted-foreground"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden text-right sm:block">
          <p className="max-w-48 truncate text-sm font-medium">
            {user.fullName || user.email || "Usuario"}
          </p>
          <p className="text-xs text-muted-foreground">{getRoleLabel(user.role)}</p>
        </div>
        {canCreateSale ? (
          <Button asChild className="rounded-xl">
            <Link href="/ventas">
              <PlusCircle className="size-4" />
              <span className="hidden sm:inline">Nueva venta</span>
            </Link>
          </Button>
        ) : null}
        <UserMenu user={user} />
      </div>
    </header>
  );
}
