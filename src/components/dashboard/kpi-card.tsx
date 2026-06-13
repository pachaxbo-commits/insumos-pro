import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { KpiItem } from "@/types/dashboard";

const trendStyles = {
  up: {
    icon: ArrowUpRight,
    className: "text-emerald-600 bg-emerald-50",
  },
  down: {
    icon: ArrowDownRight,
    className: "text-slate-700 bg-slate-100",
  },
  neutral: {
    icon: ArrowRight,
    className: "text-amber-700 bg-amber-50",
  },
};

export function KpiCard({ item }: { item: KpiItem }) {
  const Icon = item.icon;
  const trend = trendStyles[item.trend];
  const TrendIcon = trend.icon;

  return (
    <Card className="border-white/60 bg-card/92 shadow-sm">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{item.title}</p>
            <p className="mt-2 font-heading text-3xl font-semibold tracking-tight">{item.value}</p>
          </div>
          <span className="flex size-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-900/10">
            <Icon className="size-5" />
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium", trend.className)}>
            <TrendIcon className="size-3.5" />
            {item.change}
          </span>
          <p className="text-right text-xs text-muted-foreground">{item.caption}</p>
        </div>
      </CardContent>
    </Card>
  );
}
