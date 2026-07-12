import { CustomerRecoveryForm } from "@/components/customer-account/customer-recovery-form";

export const dynamic = "force-dynamic";

export default function CustomerPasswordUpdatePage() {
  return <CustomerRecoveryForm mode="update" />;
}
