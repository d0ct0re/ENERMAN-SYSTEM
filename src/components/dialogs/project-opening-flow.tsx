import type { ReactNode } from "react";
import { StepForm, FormSummary } from "@/components/ui/step-form";
interface Props {
  enabled: boolean; information: ReactNode; location: ReactNode; review: ReactNode; save: ReactNode;
  canContinue: boolean; fieldProgress: { filled: number; total: number }[];
  preview: { name: string; reference: string; client: string; department: string; place: string; engineer: string; folio: string; address: string; negotiator: string; contact: string; };
}
export function ProjectOpeningFlow({ enabled, information, location, review, save, canContinue, preview, fieldProgress }: Props): JSX.Element {
  if (!enabled) return <div className="space-y-3">{information}{location}{review}{save}</div>;
  return <StepForm className="opening-flow" title="Apertura del proyecto" save={save} canContinue={canContinue} hint="Completa cliente, departamento, tipo, lugar y nombre del trabajo para continuar." steps={[
    { id: "information", label: "Información", title: "Información del proyecto", progress: fieldProgress[0], content: information },
    { id: "location", label: "Ubicación", title: "Ubicación y contactos", progress: fieldProgress[1], content: location },
    { id: "review", label: "Revisión", title: "Revisa la apertura", progress: fieldProgress[2], content: <><p className="step-form__description">Comprueba los datos antes de guardar. Las fechas importantes se guardan por separado.</p><FormSummary fields={[
      { label: "Folio", value: preview.folio }, { label: "Trabajo", value: preview.name }, { label: "Cliente", value: preview.client }, { label: "Departamento", value: preview.department }, { label: "Lugar", value: preview.place }, { label: "Ingeniero", value: preview.engineer }, { label: "Ubicación del trabajo", value: preview.address, wide: true }, { label: "Compras / Negociador", value: preview.negotiator }, { label: "Contacto", value: preview.contact },
    ]} />{review}</> },
  ]} />;
}