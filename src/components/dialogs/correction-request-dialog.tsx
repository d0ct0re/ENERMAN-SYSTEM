import { AlertTriangle, Send, WandSparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { ClientInput } from "@/components/ui/client-input";
import { DepartmentInput } from "@/components/ui/department-input";
import { LugarInput } from "@/components/ui/lugar-input";
import { TypeSelector } from "@/components/ui/type-selector";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { buildRequestName } from "@/lib/utils";
import { ProjectItem, ProjectType, RequestItem } from "@/types";

interface CorrectionRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: RequestItem;
  existingProjects: ProjectItem[];
  onResubmit: (
    fields: Pick<RequestItem, "baseName" | "client" | "department" | "lugar" | "type" | "description" | "structuredName">,
  ) => Promise<void>;
}

export function CorrectionRequestDialog({
  open,
  onOpenChange,
  request,
  existingProjects,
  onResubmit,
}: CorrectionRequestDialogProps): JSX.Element {
  const [baseName, setBaseName] = useState(request.baseName);
  const [client, setClient] = useState(request.client);
  const [department, setDepartment] = useState(request.department);
  const [lugar, setLugar] = useState(request.lugar ?? "");
  const [type, setType] = useState<ProjectType>(request.type);
  const [description, setDescription] = useState(request.description);
  const [saving, setSaving] = useState(false);

  // Resetear al abrir para reflejar el estado actual de la solicitud
  const handleOpenChange = (next: boolean): void => {
    if (next) {
      setBaseName(request.baseName);
      setClient(request.client);
      setDepartment(request.department);
      setLugar(request.lugar ?? "");
      setType(request.type);
      setDescription(request.description);
    }
    onOpenChange(next);
  };

  const structuredName = useMemo(
    () => buildRequestName({ client, department, lugar, type, baseName }),
    [baseName, client, department, lugar, type],
  );

  const duplicateProject = useMemo(
    () =>
      baseName.trim().length > 0
        ? existingProjects.find((p) =>
            [p.structuredName, p.baseName, p.client]
              .join(" ")
              .toLowerCase()
              .includes(baseName.trim().toLowerCase()),
          )
        : undefined,
    [baseName, existingProjects],
  );

  const canSubmit = Boolean(baseName.trim() && client.trim() && department.trim() && description.trim());

  const handleSubmit = async (): Promise<void> => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await onResubmit({
        baseName,
        client,
        department,
        lugar: lugar || undefined,
        type,
        description,
        structuredName,
      });
      onOpenChange(false);
    } catch { /* error shown via toast */ }
    finally { setSaving(false); }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Corregir solicitud"
      description={`Folio: ${request.structuredName || "Sin folio"}`}
      className="max-w-3xl"
    >
      {/* Corrección requerida */}
      {request.correctionReason ? (
        <div className="mb-4 flex items-start gap-3 rounded-[20px] border border-[#0EA5E9]/20 bg-[#0EA5E9]/8 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#0EA5E9]" />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#0EA5E9]">Corrección requerida por administración</p>
            <p className="mt-1 text-sm text-foreground">{request.correctionReason}</p>
          </div>
        </div>
      ) : null}

      {/* Campos editables */}
      <div className="grid gap-4 sm:grid-cols-2">
        <ClientInput value={client} onChange={setClient} />
        <DepartmentInput value={department} onChange={setDepartment} />
        <LugarInput value={lugar} onChange={setLugar} />
        <TypeSelector value={type} onChange={setType} />
      </div>

      <div className="mt-4 space-y-4">
        <Input value={baseName} onChange={(e) => setBaseName(e.target.value)} placeholder="Nombre base" />
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe el alcance, restricciones, contexto operativo y objetivo de la solicitud."
        />
      </div>

      {/* Preview nombre estructurado */}
      <div className="mt-4 rounded-[26px] border border-accent/15 bg-accent/[0.05] p-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-accent">
          <WandSparkles className="h-4 w-4" />
          Vista previa del nombre estructurado
        </div>
        <p className="text-sm font-medium text-foreground">{structuredName || "—"}</p>
      </div>

      {/* Duplicado */}
      {duplicateProject ? (
        <div className="mt-4 flex items-start gap-3 rounded-[24px] border border-warning/20 bg-warning/10 p-4 text-sm text-[#F5A524]">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          Posible duplicado con el proyecto {duplicateProject.structuredName}.
        </div>
      ) : null}

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
          Cancelar
        </Button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || saving}
          className="flex items-center justify-center gap-2 rounded-2xl bg-accent px-6 py-2.5 text-sm font-bold text-[#111111] transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          {saving ? "Enviando..." : "Volver a enviar"}
        </button>
      </div>
    </Dialog>
  );
}
