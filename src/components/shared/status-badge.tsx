import {
  AlertCircle,
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Info,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AlertTone, InventoryMovementType, SaleStatus } from "@/types/dashboard";

type StatusBadgeProps = {
  status: SaleStatus | AlertTone | InventoryMovementType;
  className?: string;
};

const saleStatusMap: Record<SaleStatus, { label: string; className: string; icon: LucideIcon }> = {
  pagada: {
    label: "Pagada",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: CheckCircle2,
  },
  pendiente: {
    label: "Pendiente",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    icon: Clock3,
  },
  vencida: {
    label: "Vencida",
    className: "border-rose-200 bg-rose-50 text-rose-700",
    icon: AlertCircle,
  },
  confirmada: {
    label: "Confirmada",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: CheckCircle2,
  },
  borrador: {
    label: "Borrador",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    icon: Clock3,
  },
  anulada: {
    label: "Anulada",
    className: "border-slate-200 bg-slate-100 text-slate-700",
    icon: AlertCircle,
  },
};

const alertToneMap: Record<AlertTone, { label: string; className: string; icon: LucideIcon }> = {
  critical: {
    label: "Critica",
    className: "border-rose-200 bg-rose-50 text-rose-700",
    icon: AlertCircle,
  },
  warning: {
    label: "Atencion",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    icon: Clock3,
  },
  info: {
    label: "Info",
    className: "border-sky-200 bg-sky-50 text-sky-700",
    icon: Info,
  },
  success: {
    label: "Resuelta",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: CheckCircle2,
  },
};

const movementTypeMap: Record<InventoryMovementType, { label: string; className: string; icon: LucideIcon }> = {
  entrada: {
    label: "Entrada",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: ArrowDownLeft,
  },
  salida: {
    label: "Salida",
    className: "border-slate-200 bg-slate-100 text-slate-700",
    icon: ArrowUpRight,
  },
  ajuste: {
    label: "Ajuste",
    className: "border-violet-200 bg-violet-50 text-violet-700",
    icon: ArrowRightLeft,
  },
  merma: {
    label: "Merma",
    className: "border-rose-200 bg-rose-50 text-rose-700",
    icon: AlertCircle,
  },
  devolucion: {
    label: "Devolucion",
    className: "border-sky-200 bg-sky-50 text-sky-700",
    icon: ArrowDownLeft,
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config =
    saleStatusMap[status as SaleStatus] ??
    alertToneMap[status as AlertTone] ??
    movementTypeMap[status as InventoryMovementType];

  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={cn("gap-1 rounded-full px-2.5 py-1 font-medium", config.className, className)}
    >
      <Icon className="size-3.5" />
      {config.label}
    </Badge>
  );
}
