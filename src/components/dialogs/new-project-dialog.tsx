import { FolderPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { buildStructuredName } from "@/lib/utils";
import { PROJECT_TYPE_LABELS, ProjectType } from "@/types";

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nextSequence: string;
  onSubmit: (project: {
    baseName: string;
    client: string;
    department: string;
    type: ProjectType;
    description: string;
    totalContratado: number;
  }) => void;
  clientOptions: string[];
  departmentOptions: string[];
}

const TYPE_ENTRIES = Object.entries(PROJECT_TYPE_LABELS) as [ProjectType, string][];

export function NewProjectDialog({
  open,
  onOpenChange,
  nextSequence,
  onSubmit,
  clientOptions,
  departmentOptions,
}: NewProjectDialogProps): JSX.Element {
  const [baseName, setBaseName] = useState("");
  const [client, setClient] = useState("");
  const [department, setDepartment] = useState("");
  const [type, setType] = useState<ProjectType>("INST");
  const [description, setDescription] = useState("");
  const [totalContratado, setTotalContratado] = useState("");

  const structuredName = useMemo(
    () =>
      buildStructuredName({
        sequence: nextSequence,
        client,
        department,
        type,
        baseName,
      }),
    [baseName, client, department, nextSequence, type],
  );

  const reset = (): void => {
    setBaseName("");
    setClient("");
    setDepartment("");
    setType("INST");
    setDescription("");
    setTotalContratado("");
  };

  const handleSubmit = (): void => {
    onSubmit({
      baseName: baseName.trim(),
      client: client.trim(),
      department: department.trim(),
      type,
      description: description.trim(),
      totalContratado: Number(totalContratado) || 0,
    });
    reset();
    onOpenChange(false);
  };

  const canSubmit = Boolean(baseName.trim() && client.trim() && department.trim() && description.trim());

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          reset();
        }
        onOpenChange(nextOpen);
      }}
      title="Nuevo proyecto"
      description={`Folio sugerido ${nextSequence}`}
      className="max-w-3xl"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input value={client} onChange={(event) => setClient(event.target.value)} placeholder="Cliente" list="project-client-options" />
        <datalist id="project-client-options">
          {clientOptions.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>

        <Input
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
          placeholder="Departamento"
          list="project-department-options"
        />
        <datalist id="project-department-options">
          {departmentOptions.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>

        <div className="sm:col-span-2">
          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#888888]">Tipo de trabajo</span>
            <select
              value={type}
              onChange={(event) => setType(event.target.value as ProjectType)}
              className="h-12 w-full rounded-2xl border border-[#3F3F46] bg-[#313136] px-4 text-sm font-semibold text-foreground outline-none transition focus:border-accent/50 focus:ring-4 focus:ring-accent/10"
            >
              {TYPE_ENTRIES.map(([code, label]) => (
                <option key={code} value={code}>
                  {code} - {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Input
          type="number"
          value={totalContratado}
          onChange={(event) => setTotalContratado(event.target.value)}
          placeholder="Monto total inicial"
          className="sm:col-span-2"
        />
      </div>

      <div className="mt-4 space-y-4">
        <Input value={baseName} onChange={(event) => setBaseName(event.target.value)} placeholder="Nombre del proyecto" />
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Describe el alcance, ubicación, restricciones y objetivo del proyecto."
        />
      </div>

      <div className="mt-5 rounded-[24px] bg-[#1F1F22] p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-accent">
          <FolderPlus className="h-4 w-4" />
          Nombre estructurado
        </div>
        <p className="break-words text-sm font-medium text-foreground">{structuredName}</p>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} disabled={!canSubmit}>
          Crear proyecto
        </Button>
      </div>
    </Dialog>
  );
}
