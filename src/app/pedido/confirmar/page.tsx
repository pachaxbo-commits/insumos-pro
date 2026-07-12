import type { Metadata } from "next";

import { ModuleTransitionScreen } from "@/components/qb-insumos/module-transition-screen";
import { getTransitionModuleByPath } from "@/lib/qb-insumos/transition-policy";

export const metadata: Metadata = {
  title: "Confirmar pedido | QB Insumos",
  description: "Confirmacion publica temporalmente suspendida durante la transicion a QB Insumos.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ConfirmPublicOrderPage() {
  const transitionModule = getTransitionModuleByPath("/pedido/confirmar");

  return <ModuleTransitionScreen module={transitionModule!} publicView />;
}
