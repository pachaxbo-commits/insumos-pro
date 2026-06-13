"use client";

import { LogOut, ShieldCheck } from "lucide-react";

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

function getInitials(user: SessionUser) {
  const source = user.fullName?.trim() || user.email || "IP";

  return source
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function UserMenu({ user }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-11 rounded-xl border-white bg-white/70 px-3 hover:bg-white"
        >
          <span className="flex size-8 items-center justify-center rounded-xl bg-slate-900 text-xs font-semibold text-white">
            {getInitials(user)}
          </span>
          <span className="hidden text-left sm:block">
            <span className="block max-w-36 truncate text-sm font-medium">
              {user.fullName || user.email || "Usuario"}
            </span>
            <span className="block text-xs text-muted-foreground">
              {getRoleLabel(user.role)}
            </span>
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
