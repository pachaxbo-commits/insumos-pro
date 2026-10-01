import ProductosPage from "@/app/(private)/productos/page";
import { SettingsNav } from "@/components/settings/settings-nav";
import { requireRoleAccess } from "@/lib/auth/session";

type Props = { searchParams: Promise<{ q?: string; category?: string; status?: string; stock?: string; page?: string }> };

export default async function ConfigurarProductosPage(props: Props) {
  await requireRoleAccess("/configuracion/productos");
  return <div className="space-y-4"><SettingsNav current="/configuracion/productos" /><ProductosPage {...props} /></div>;
}
