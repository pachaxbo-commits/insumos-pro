import Link from "next/link";
import { Download, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

import { operationalDateHref, provisionPath, provisionExcelPath } from "@/lib/operational-matrix/date-navigation";

export function MarketSheetActions({ date }: { date: string }) {

  return (
    <section id="hoja-provisiones" aria-label="Acciones de hoja de provisión" className="print:hidden">
        <div className="flex flex-wrap gap-1.5">
          <Button asChild size="sm" variant="outline" className="h-9 bg-white px-2.5">
            <Link href={operationalDateHref(provisionPath, date)}>
              <Printer className="size-4" />
              Hoja de Provisión
            </Link>
          </Button>
          <Button asChild size="sm" className="h-9 px-2.5">
            <a href={operationalDateHref(provisionExcelPath, date)}>
              <Download className="size-4" />
              Descargar Excel
            </a>
          </Button>
        </div>
    </section>
  );
}
