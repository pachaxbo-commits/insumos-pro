import Link from "next/link";
import { Download, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

export function MarketSheetActions({ date }: { date: string }) {
  const encodedDate = encodeURIComponent(date);

  return (
    <section id="hoja-mercado" aria-label="Acciones de hoja de compras" className="print:hidden">
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="bg-white">
            <Link href={`/matriz-operativa/mercado?date=${encodedDate}`}>
              <Printer className="size-4" />
              Hoja de compras
            </Link>
          </Button>
          <Button asChild>
            <a href={`/api/matriz-operativa/mercado.xlsx?date=${encodedDate}`}>
              <Download className="size-4" />
              Descargar Excel
            </a>
          </Button>
        </div>
    </section>
  );
}
