import type { Metadata } from "next";

import { PublicCheckout } from "@/components/catalog/public-checkout";
import { getQbCheckoutData } from "@/lib/qb-catalog/data";

export const metadata: Metadata = {
  title: "Revisar pedido | QB Insumos",
  description: "Revision de pedido QB sin precios.",
};

export default async function PublicCheckoutPage() {
  const data = await getQbCheckoutData();

  return <PublicCheckout {...data} />;
}
