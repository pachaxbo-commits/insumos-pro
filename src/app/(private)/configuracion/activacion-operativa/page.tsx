import { OperationalActivationManager } from "@/components/operational-activation/operational-activation-manager";
import { PageHeader } from "@/components/layout/page-header";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getOperationalActivationSummary } from "@/lib/operational-activation/data";

export default async function OperationalActivationPage() {
  const auth = await requireAuthenticatedUser();
  if (auth.user.role !== "administrador") return <p>Esta herramienta está disponible únicamente para administradores.</p>;
  const summary = await getOperationalActivationSummary();
  return <div className="space-y-6"><PageHeader eyebrow="Administración" title="Activación operativa" description="Descarga, valida y aplica datos proporcionados por el cliente con trazabilidad y confirmación previa." /><OperationalActivationManager summary={summary} /></div>;
}
