import type { Metadata } from "next";

import { PublicCheckout } from "@/components/catalog/public-checkout";
import { getQbCheckoutData } from "@/lib/qb-catalog/data";

export const metadata: Metadata = {
  title: "Revisar pedido | QB Insumos",
  description: "Revisa los productos y datos de entrega antes de enviar tu pedido.",
};

export default async function PublicCheckoutPage() {
  const data = await getQbCheckoutData();

  return <PublicCheckout {...data} />;
}
