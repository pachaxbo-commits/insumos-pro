import { CustomerRecoveryForm } from "@/components/customer-account/customer-recovery-form";

type CustomerRecoveryPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function CustomerRecoveryPage({
  searchParams,
}: CustomerRecoveryPageProps) {
  const params = await searchParams;
  const initialMessage =
    params.error === "invalid-link"
      ? "El enlace de recuperación no es válido, ya fue utilizado o venció. Solicita uno nuevo."
      : undefined;

  return <CustomerRecoveryForm mode="request" initialMessage={initialMessage} />;
}
