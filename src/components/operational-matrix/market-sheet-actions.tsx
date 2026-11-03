import Link from "next/link";
import { Download, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

export function MarketSheetActions({ date }: { date: string }) {
  const encodedDate = encodeURIComponent(date);

  return (
    <section id="hoja-provisiones" aria-label="Acciones de hoja de provisión" className="print:hidden">
        <div className="flex flex-wrap gap-1.5">
          <Button asChild size="sm" variant="outline" className="h-9 bg-white px-2.5">
            <Link href={`/matriz-operativa/mercado?date=${encodedDate}`}>
              <Printer className="size-4" />
              Hoja de Provisión
            </Link>
          </Button>
          <Button asChild size="sm" className="h-9 px-2.5">
            <a href={`/api/matriz-operativa/mercado.xlsx?date=${encodedDate}`}>
              <Download className="size-4" />
              Descargar Excel
            </a>
          </Button>
        </div>
    </section>
  );
}
