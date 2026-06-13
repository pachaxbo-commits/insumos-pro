import { FlaskConical } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";

type FeaturePlaceholderProps = {
  title: string;
  description: string;
};

export function FeaturePlaceholder({ title, description }: FeaturePlaceholderProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Modulo demo"
        title={title}
        description={description}
      />
      <EmptyState
        icon={<FlaskConical className="size-5" />}
        title={`${title} quedo preparado para Fase 2`}
        description="En esta fase se priorizo la base visual, la navegacion y los componentes reutilizables. La logica de negocio real vendra despues."
      />
    </div>
  );
}
