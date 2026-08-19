import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PrintReceiptButton } from "@/components/qb-receipts/print-receipt-button";
import { ReceiptDocument } from "@/components/qb-receipts/receipt-document";
import { Button } from "@/components/ui/button";
import { requireRoleAccess } from "@/lib/auth/session";
import { getQbReceiptDetailData } from "@/lib/qb-receipts/data";

export default async function DeliveryNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRoleAccess("/recibos");
  const { id } = await params;
  const { receipt, error } = await getQbReceiptDetailData(id);

  if (!receipt) {
    return (
      <div className="space-y-4">
        <Button asChild variant="outline">
          <Link href="/recibos">
            <ArrowLeft className="size-4" />
            Volver
          </Link>
        </Button>
        <div className="rounded-lg border bg-background p-8 text-sm text-muted-foreground">
          {error ?? "Nota de entrega no disponible."}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button asChild variant="outline">
          <Link href={`/recibos/${receipt.id}`}>
            <ArrowLeft className="size-4" />
            Volver al recibo
          </Link>
        </Button>
        <PrintReceiptButton />
      </div>
      <ReceiptDocument receipt={receipt} variant="delivery-note" />
    </div>
  );
}

