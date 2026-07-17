import type { Metadata } from "next";

import { PublicCheckout } from "@/components/catalog/public-checkout";
import { CustomerConfirmationStatus } from "@/components/customer-account/confirmation-status";
import { getQbCheckoutData } from "@/lib/qb-catalog/data";

export const metadata: Metadata = {
  title: "Revisar pedido | QB Insumos",
  description: "Revisa los productos y datos de entrega antes de enviar tu pedido.",
};

export default async function PublicCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ confirmation?: string }>;
}) {
  const params = await searchParams;
  const data = await getQbCheckoutData();

  return (
    <>
      <CustomerConfirmationStatus state={params.confirmation} />
      <PublicCheckout {...data} />
    </>
  );
}
