import ParametrizacionPage from "@/app/(private)/parametrizacion/page";
import { SettingsNav } from "@/components/settings/settings-nav";
import { requireRoleAccess } from "@/lib/auth/session";

export default async function ConfigurarParametrizacionPage() {
  await requireRoleAccess("/configuracion/parametrizacion");
  return <div className="space-y-4"><SettingsNav current="/configuracion/parametrizacion" /><ParametrizacionPage /></div>;
}
