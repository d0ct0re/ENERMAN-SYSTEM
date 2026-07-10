import { AlertTriangle, WandSparkles } from "lucide-react";
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

interface NewRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (request: Omit<RequestItem, "id" | "createdAt" | "createdBy" | "status">) => void;
  existingProjects: ProjectItem[];
}

export function NewRequestDialog({
  open,
  onOpenChange,
  onSubmit,
  existingProjects,
}: NewRequestDialogProps): JSX.Element {
  const [baseName, setBaseName] = useState("");
  const [client, setClient] = useState("");
  const [department, setDepartment] = useState("");
  const [lugar, setLugar] = useState("");
  const [type, setType] = useState<ProjectType>("INST");
  const [description, setDescription] = useState("");

  const structuredName = useMemo(
    () => buildRequestName({ client, department, lugar, type, baseName }),
    [baseName, client, department, lugar, type],
  );

  const duplicateProject = useMemo(
    () =>
      baseName.trim().length > 0
        ? existingProjects.find((project) =>
            [project.structuredName, project.baseName, project.client]
              .join(" ")
              .toLowerCase()
              .includes(baseName.trim().toLowerCase()),
          )
        : undefined,
    [baseName, existingProjects],
  );

  const reset = (): void => {
    setBaseName("");
    setClient("");
    setDepartment("");
    setLugar("");
    setType("INST");
    setDescription("");
  };

  const handleSubmit = (): void => {
    onSubmit({
      structuredName,
      baseName,
      client,
      department,
      lugar: lugar || undefined,
      type,
      description,
      duplicateOfProjectId: duplicateProject?.id,
      linkedProjectId: undefined,
      rejectionReason: undefined,
      correctionReason: undefined,
    });
    reset();
    onOpenChange(false);
  };

  const canSubmit = Boolean(baseName.trim() && client.trim() && department.trim() && description.trim());

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) reset();
        onOpenChange(nextOpen);
      }}
      title="Nueva solicitud"
      description="Genera una solicitud estructurada con validación visual de duplicados."
      className="max-w-3xl"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <ClientInput value={client} onChange={setClient} />
        <DepartmentInput value={department} onChange={setDepartment} />
        <LugarInput value={lugar} onChange={setLugar} />
        <TypeSelector value={type} onChange={setType} />
      </div>

      <div className="mt-4 space-y-4">
        <Input value={baseName} onChange={(event) => setBaseName(event.target.value)} placeholder="Nombre base" />
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Describe el alcance, restricciones, contexto operativo y objetivo de la solicitud."
        />
      </div>

      <div className="mt-5 rounded-[26px] border border-accent/15 bg-accent/[0.05] p-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-accent">
          <WandSparkles className="h-4 w-4" />
          Vista previa del nombre estructurado
        </div>
        <p className="text-sm font-medium text-foreground">{structuredName}</p>
      </div>

      {duplicateProject ? (
        <div className="mt-4 flex items-start gap-3 rounded-[24px] border border-warning/20 bg-warning/10 p-4 text-sm text-brand">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          Posible duplicado con el proyecto {duplicateProject.structuredName}.
        </div>
      ) : null}

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button onClick={handleSubmit} disabled={!canSubmit}>Enviar</Button>
      </div>
    </Dialog>
  );
}
