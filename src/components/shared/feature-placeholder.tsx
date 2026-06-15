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
        eyebrow="Modulo preparado"
        title={title}
        description={description}
      />
      <EmptyState
        icon={<FlaskConical className="size-5" />}
        title={`${title} esta preparado para evolucionar`}
        description="Esta seccion queda reservada para crecimiento controlado del sistema, manteniendo la navegacion y los componentes base."
      />
    </div>
  );
}
