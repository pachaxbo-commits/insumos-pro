"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, TestTube2 } from "lucide-react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { QbOperationalSettings } from "@/types/operational-settings";

export function StockControlBanner({
  settings,
}: {
  settings: QbOperationalSettings;
}) {
  const router = useRouter();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const channel = supabase
      .channel("qb-operational-settings")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "qb_operational_settings" },
        () => {
          if (refreshTimer.current) clearTimeout(refreshTimer.current);
          refreshTimer.current = setTimeout(() => router.refresh(), 150);
        },
      )
      .subscribe();

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [router]);

  const Icon = settings.strictStockControl ? ShieldCheck : TestTube2;
  return (
    <div
      className={
        settings.strictStockControl
          ? "rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3"
          : "rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3"
      }
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0" />
        <div>
          <p className="font-medium">
            {settings.strictStockControl
              ? "Control de stock activo"
              : "Modo piloto — Stock provisional"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {settings.strictStockControl
              ? "Las entregas se bloquean cuando la existencia disponible no alcanza para la cantidad realmente preparada."
              : "Puedes vender y preparar pedidos normalmente. El sistema seguirá registrando los movimientos, aunque todavía no bloqueará operaciones por falta de stock."}
          </p>
        </div>
      </div>
    </div>
  );
}
