import { FolderPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { ClientInput } from "@/components/ui/client-input";
import { DepartmentInput } from "@/components/ui/department-input";
import { LugarInput } from "@/components/ui/lugar-input";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { buildStructuredName } from "@/lib/utils";
import { ProjectType } from "@/types";
import { TypeSelector } from "@/components/ui/type-selector";

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nextSequence: string;
  onSubmit: (project: {
    baseName: string;
    client: string;
    department: string;
    lugar?: string;
    type: ProjectType;
    description: string;
    totalContratado: number;
  }) => void;
}


export function NewProjectDialog({
  open,
  onOpenChange,
  nextSequence,
  onSubmit,
}: NewProjectDialogProps): JSX.Element {
  const [baseName, setBaseName] = useState("");
  const [client, setClient] = useState("");
  const [department, setDepartment] = useState("");
  const [lugar, setLugar] = useState("");
  const [type, setType] = useState<ProjectType>("INST");
  const [description, setDescription] = useState("");
  const [totalContratado, setTotalContratado] = useState("");

  const structuredName = useMemo(
    () =>
      buildStructuredName({
        sequence: nextSequence,
        client,
        department,
        lugar: lugar || undefined,
        type,
        baseName,
      }),
    [baseName, client, department, lugar, nextSequence, type],
  );

  const reset = (): void => {
    setBaseName("");
    setClient("");
    setDepartment("");
    setLugar("");
    setType("INST");
    setDescription("");
    setTotalContratado("");
  };

  const handleSubmit = (): void => {
    onSubmit({
      baseName: baseName.trim(),
      client: client.trim(),
      department: department.trim(),
      lugar: lugar.trim() || undefined,
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
        <ClientInput value={client} onChange={setClient} />
        <DepartmentInput value={department} onChange={setDepartment} />
        <LugarInput value={lugar} onChange={setLugar} className="sm:col-span-2" />
        <TypeSelector value={type} onChange={setType} />
        <Input
          type="number"
          value={totalContratado}
          onChange={(event) => setTotalContratado(event.target.value)}
          placeholder="Monto total inicial"
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
