import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import type { QuickAction } from "@/types/dashboard";

export function QuickActionCard({ action }: { action: QuickAction }) {
  const Icon = action.icon;

  return (
    <Link href={action.href} className="group block">
      <Card className="h-full border-white/60 bg-white/85 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
        <CardContent className="flex h-full flex-col gap-4 p-5">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-900/10">
            <Icon className="size-5" />
          </span>
          <div className="space-y-1">
            <h3 className="font-heading text-base font-semibold">{action.title}</h3>
            <p className="text-sm leading-6 text-muted-foreground">{action.description}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
