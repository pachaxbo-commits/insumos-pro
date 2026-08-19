import type { NextRequest } from "next/server";

import { requireRoleAccess } from "@/lib/auth/session";
import { buildMarketSheetModel } from "@/lib/market-sheet/model";
import { buildMarketWorkbook } from "@/lib/market-sheet/workbook";
import { getOperationalMatrixData } from "@/lib/operational-matrix/data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function validDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export async function GET(request: NextRequest) {
  const auth = await requireRoleAccess("/matriz-operativa");
  if (auth.user.role !== "administrador") {
    return new Response("Solo el administrador puede exportar esta hoja.", {
      status: 403,
    });
  }

  const date = validDate(request.nextUrl.searchParams.get("date"));
  if (!date) {
    return new Response("Fecha operativa inválida.", { status: 400 });
  }

  const data = await getOperationalMatrixData(date, auth.user.role);
  const model = buildMarketSheetModel(data);
  const buffer = await buildMarketWorkbook(model);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="qb-insumos-compras-mercado-${date}.xlsx"`,
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}

