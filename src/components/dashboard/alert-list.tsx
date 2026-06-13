import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AlertItem } from "@/types/dashboard";
import { StatusBadge } from "@/components/shared/status-badge";

export function AlertList({ items }: { items: AlertItem[] }) {
  return (
    <Card className="border-white/60 bg-card/92 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="font-heading text-lg">Alertas importantes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((item) => (
          <div key={item.id} className="rounded-2xl border border-border/70 bg-background/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-medium">{item.title}</h3>
              <StatusBadge status={item.tone} />
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
            <p className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {item.time}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
