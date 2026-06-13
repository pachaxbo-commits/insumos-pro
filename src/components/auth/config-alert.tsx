import { AlertTriangle, DatabaseZap } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ConfigAlertProps = {
  title: string;
  description: string;
  className?: string;
};

export function ConfigAlert({
  title,
  description,
  className,
}: ConfigAlertProps) {
  return (
    <Card className={cn("border-amber-200 bg-amber-50/90 shadow-sm", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-heading text-lg text-amber-900">
          <span className="rounded-xl bg-amber-100 p-2">
            <DatabaseZap className="size-4" />
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-start gap-3 text-sm leading-6 text-amber-900/90">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>{description}</p>
      </CardContent>
    </Card>
  );
}
