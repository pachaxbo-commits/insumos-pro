"use client";

import { LogOut, ShieldCheck, UserRound } from "lucide-react";

import { logoutAction } from "@/lib/auth/actions";
import { getRoleLabel } from "@/lib/auth/roles";
import type { SessionUser } from "@/types/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type UserMenuProps = {
  user: SessionUser;
};

export function UserMenu({ user }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="size-9 rounded-full border-slate-200 bg-white p-0 hover:bg-slate-50"
          aria-label="Abrir menú de usuario"
        >
          <span className="flex size-8 items-center justify-center rounded-xl bg-slate-900 text-white">
            <UserRound className="size-4.5" aria-hidden="true" />
          </span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64 rounded-xl">
        <DropdownMenuLabel className="space-y-1 py-2">
          <div className="text-sm font-medium">{user.fullName || "Usuario"}</div>
          <div className="text-xs font-normal text-muted-foreground">
            {user.email || "Sin correo"}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2 text-muted-foreground">
          <ShieldCheck className="size-4" />
          {getRoleLabel(user.role)}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={logoutAction}>
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              const target = event.currentTarget as HTMLElement | null;
              const form = target?.closest("form");
              form?.requestSubmit();
            }}
            variant="destructive"
          >
            <LogOut className="size-4" />
            Cerrar sesion
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
