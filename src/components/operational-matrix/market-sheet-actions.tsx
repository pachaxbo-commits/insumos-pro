import Link from "next/link";
import { Download, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

export function MarketSheetActions({ date }: { date: string }) {
  const encodedDate = encodeURIComponent(date);

  return (
    <section id="hoja-mercado" className="scroll-mt-6 rounded-2xl border-2 border-emerald-300 bg-emerald-50/70 p-4 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-emerald-950">Hoja de compras del día</p>
          <p className="mt-1 text-sm text-emerald-900/75">
            Usa únicamente lo solicitado por los clientes para esta fecha; no cambia pedidos, preparación ni entrega.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="bg-white">
            <Link href={`/matriz-operativa/mercado?date=${encodedDate}`}>
              <Printer className="size-4" />
              Abrir hoja de compras
            </Link>
          </Button>
          <Button asChild>
            <a href={`/api/matriz-operativa/mercado.xlsx?date=${encodedDate}`}>
              <Download className="size-4" />
              Descargar Excel
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
