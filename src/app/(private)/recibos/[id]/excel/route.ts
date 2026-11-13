import { requireRoleAccess } from "@/lib/auth/session";
import { getQbReceiptDetailData } from "@/lib/qb-receipts/data";
import { buildReceiptWorkbook } from "@/lib/qb-receipts/workbook";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleAccess("/recibos");
  const internal = new URL(request.url).searchParams.get("copia") === "interna";
  if (internal && auth.user.role !== "administrador") {
    return new Response("La copia interna requiere Administración.", { status: 403 });
  }

  const { id } = await params;
  const { receipt } = await getQbReceiptDetailData(id, auth.user.role!);
  if (!receipt || (!internal && receipt.status !== "emitido")) {
    return new Response("Recibo no disponible.", { status: 404 });
  }
  const buffer = await buildReceiptWorkbook(receipt, internal);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="recibo-${internal ? "interno" : "cliente"}.xlsx"`,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}
