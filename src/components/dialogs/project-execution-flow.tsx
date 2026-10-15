import type { ReactNode } from "react";
import { StepForm, FormSummary, type SummaryField } from "@/components/ui/step-form";
interface Props {
  enabled: boolean; tracking: ReactNode; schedule: ReactNode; save: ReactNode;
  progress: { filled: number; total: number }[]; summary: SummaryField[];
}
export function ProjectExecutionFlow({ enabled, tracking, schedule, save, progress, summary }: Props): JSX.Element {
  if (!enabled) return <div className="space-y-3">{tracking}{schedule}{save}</div>;
  return <StepForm className="execution-flow" title="Ejecución del proyecto" save={save} steps={[
    { id: "tracking", label: "Seguimiento", title: "Estado y seguimiento", content: tracking, progress: progress[0] },
    { id: "schedule", label: "Fechas", title: "Fechas, evidencias y comentarios", content: schedule, progress: progress[1] },
    { id: "review", label: "Revisión", title: "Revisa la ejecución", progress: progress[2], content: <><p className="step-form__description">Comprueba el estado del trabajo, las fechas y los comentarios antes de guardar.</p><FormSummary fields={summary} /></> },
  ]} />;
}