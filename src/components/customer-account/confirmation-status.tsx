import { CheckCircle2 } from "lucide-react";

export function CustomerConfirmationStatus({ state }: { state?: string }) {
  if (state !== "confirmed") return null;

  return (
    <div
      role="status"
      className="fixed right-4 top-4 z-50 flex max-w-sm items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 shadow-lg"
    >
      <CheckCircle2 className="size-4 shrink-0" />
      Cuenta confirmada correctamente.
    </div>
  );
}
